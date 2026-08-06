# Live Capture Investigation

**Status:** Phases 0–3 implemented and verified against a running game — **dev-only; the sidecar is not yet packaged** ([details](#packaging--the-sidecar-is-not-shipped))
**Date:** 2026-07-28, updated 2026-08-06
**Companion documents:**
- [Live Mode — Product Design](live-mode-product-design.md) — what live mode should be, and why it is not a variant of the replay UI
- [Export & Steward Decisions](export-and-decisions-design.md) — the decision layer, record schema, and the three export surfaces
- [Live ↔ Replay Reconciliation](live-replay-reconciliation-design.md) — persisting live capture and linking it to a replay for post-session review

**Question:** What would it take to capture incidents live during a race, from the game's perspective, rather than parsing session log files after the fact?

---

## Table of Contents

- [Summary](#summary)
- [Two Data Paths](#two-data-paths)
- [The First-Party Shared Memory Contract](#the-first-party-shared-memory-contract)
  - [Named Objects](#named-objects)
  - [Buffer Layout](#buffer-layout)
  - [Access Pattern](#access-pattern)
- [Why This Is Lower Risk Than Expected](#why-this-is-lower-risk-than-expected)
- [Fields of Interest](#fields-of-interest)
- [Language and Runtime Analysis](#language-and-runtime-analysis)
  - [Why Node Alone Is Not Enough](#why-node-alone-is-not-enough)
  - [Options](#options)
  - [Sidecar Language Tradeoff](#sidecar-language-tradeoff)
- [Performance Notes](#performance-notes)
- [Proposed Architecture](#proposed-architecture)
- [Process Model and Lifecycle](#process-model-and-lifecycle)
  - [One supervisor](#one-supervisor)
  - [One sidecar, and it exits with its supervisor](#one-sidecar-and-it-exits-with-its-supervisor)
  - [Dev loop consequence](#dev-loop-consequence)
  - [Packaging — the sidecar is not shipped](#packaging--the-sidecar-is-not-shipped)
- [Suggested Phasing](#suggested-phasing)
- [Risks and Open Questions](#risks-and-open-questions)
- [Verification Provenance](#verification-provenance)
- [References](#references)

---

## Summary

Live incident capture is feasible and does **not** require shipping a third-party plugin DLL.

Three findings drive this:

1. **Le Mans Ultimate ships a first-party shared memory interface.** The SDK header is included in every install at `Support/SharedMemoryInterface/`. No community plugin is needed.
2. **The live results stream carries the same incident vocabulary we already parse.** `<Incident>`, `<Penalty>`, and `<TrackLimit>` arrive incrementally in shared memory as they happen — the same strings we parse from XML today.
3. **A native reader is required, but it should be an out-of-process sidecar**, not an Electron addon. Studio 397's own documented example uses exactly this pattern.

The practical upside over log parsing is *context*: we can keep a rolling buffer of car positions and velocities and snapshot the seconds surrounding each incident. Log files structurally cannot provide this — by the time they are written, the surrounding context is gone.

---

## Two Data Paths

There are two distinct ways to read LMU telemetry. They are frequently conflated in community documentation.

| | **First-party (recommended)** | **Third-party plugin** |
| --- | --- | --- |
| Source | Built into LMU | TheIronWolf's `rFactor2SharedMemoryMapPlugin64.dll` |
| Mapping names | `LMU_Data` | `$rFactor2SMMP_Telemetry$`, `$rFactor2SMMP_Scoring$` |
| User install step | None | Download DLL → `Bin64/Plugins/` → enable in `CustomPluginVariables.JSON` → restart |
| Header available | Yes, shipped in game | Community-maintained |
| Used by | TinyPedal (Windows) | lmu-pitwall, le-mans-ultimate-telemetry, most community tools |

Most community tools use the plugin route because it predates the first-party interface and is shared with rFactor 2. For LMU Steward, the first-party path is strongly preferred: **it removes an install step from every user's setup**, which matters for a tool aimed at league stewards rather than tinkerers.

Both paths require **Settings → Gameplay → Enable Plugins** to be turned on in game.

---

## The First-Party Shared Memory Contract

Defined in `Support/SharedMemoryInterface/SharedMemoryInterface.hpp`, © 2025 Studio 397 B.V. and Motorsport Games Inc.

> **Licensing note:** the header states redistribution and modification are not permitted. It cannot be vendored into this repository. See [Sidecar Language Tradeoff](#sidecar-language-tradeoff) for the consequences.

### Named Objects

| Kind | Name | Purpose |
| --- | --- | --- |
| File mapping | `LMU_Data` | The data buffer (`SharedMemoryLayout`) |
| Event | `LMU_Data_Event` | Auto-reset event, signaled on each update |
| File mapping | `LMU_SharedMemoryLockData` | Spinlock state (`waiters`, `busy`) |
| Event | `LMU_SharedMemoryLockEvent` | Lock wait handle |

Note that `OpenFileMapping` is called with a **wide** string (`L"LMU_Data"`) while the lock objects use the ANSI variants. Worth matching exactly.

### Buffer Layout

```
SharedMemoryObjectOut
├── generic   : SharedMemoryGeneric
│   ├── events[SME_MAX]        // which events fired this tick
│   ├── gameVersion            // use this to version-gate struct layout
│   ├── FFBTorque
│   └── appInfo                : ApplicationStateV01
├── paths     : SharedMemoryPathData
│   ├── userData
│   ├── customVariables
│   ├── stewardResults         // <- worth separate investigation
│   ├── playerProfile
│   └── pluginsFolder
├── scoring   : SharedMemoryScoringData
│   ├── scoringInfo            : ScoringInfoV01
│   ├── scoringStreamSize
│   ├── vehScoringInfo[104]    : VehicleScoringInfoV01
│   └── scoringStream[65536]   // <- the live incident feed
└── telemetry : SharedMemoryTelemetryData
    ├── activeVehicles
    ├── playerVehicleIdx
    ├── playerHasVehicle
    └── telemInfo[104]         : TelemInfoV01   // large; likely skippable
```

The `SharedMemoryEvent` enum includes `SME_START_SESSION`, `SME_END_SESSION`, `SME_UPDATE_SCORING`, `SME_UPDATE_TELEMETRY`, `SME_ENTER_REALTIME`, and `SME_EXIT_REALTIME` — giving clean live session boundaries that log files only reveal after the fact.

### Access Pattern

The interface is **push-based, not polled**. The header's usage example blocks on `WaitForMultipleObjects` against both the update event and LMU's process handle, so the reader wakes when data is produced and exits cleanly when the game closes.

```
1. OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, lmuPid)
2. OpenEventA(SYNCHRONIZE, "LMU_Data_Event")
3. OpenFileMapping(FILE_MAP_ALL_ACCESS, L"LMU_Data")
4. MapViewOfFile(...)
5. loop:
     WaitForMultipleObjects([hParent, hEvent])
       - signaled hParent -> LMU exited, break
       - signaled hEvent  -> Lock(); CopySharedMemoryObj(local, shared); Unlock();
                             process local copy outside the lock
```

Copy under the lock, process outside it. `CopySharedMemoryObj` only walks `mNumVehicles` / `activeVehicles` entries rather than the full 104 slots.

> ⚠️ **`generic.events[]` is a queue, not an array indexed by event type.**
> The header's own `CopySharedMemoryObj` reads
> `if (src.generic.events[SME_UPDATE_SCORING])`, which invites indexing *by* the
> enum. That is wrong, and reading it that way fires bogus session transitions on
> every update.
>
> Observed in a live session, the slots hold **fired event types in order**, with
> `SME_MAX` (16) as the terminator:
>
> ```
> [ 0] = 6   SME_START_SESSION
> [ 1] = 16  <terminator>
> [ 2..15] = 16
> ```
>
> Read it as a list, stopping at the first value `>= SME_MAX`:
>
> ```cpp
> for (int i = 0; i < SME_MAX; ++i) {
>   const unsigned e = generic.events[i];
>   if (e >= SME_MAX) break;
>   // handle event type e
> }
> ```
>
> **Corollary: the results stream buffer is not cleared between updates.** The same
> delta stays visible for many consecutive ticks, so a naive reader re-emits every
> incident ~10 times. Deduplicate on content before publishing anything downstream.

> ⚠️ **The shared memory objects do not exist at the main menu.** `LMU_Data` and
> `LMU_Data_Event` are published when a session loads, so an attach attempt from
> the menu fails with `ERROR_FILE_NOT_FOUND` (2). The reader must poll and wait
> rather than treating that as a fatal error — and must not report "plugins are
> disabled" on the strength of it.

> 🛑 **Do not use `SharedMemoryLock::Lock()` from the SDK.** Its slow path is
> broken:
>
> ```cpp
> return WaitForSingleObject(mWaitEventHandle, dwMilliseconds) == WAIT_OBJECT_0;
> ```
>
> It returns `true` **without re-acquiring `busy`**, and leaks a `waiters`
> increment. A caller that trusts it then calls `Unlock()`, which clears the busy
> flag while another process legitimately holds the lock.
>
> This matters far beyond our own reader: `LMU_SharedMemoryLockData` is a **single
> machine-wide lock shared by every consumer of LMU's shared memory**, including
> in-process plugins (dashboards, wheel LED/RPM software, motion rigs). Releasing
> a lock we never held corrupts mutual exclusion for all of them, and is a
> plausible cause of third-party telemetry tools failing while our reader runs.
>
> **Rule for any reader we ship: never block, never queue, never release a lock we
> did not genuinely acquire.** Use a bounded try-acquire and skip the update on
> contention — missing a tick is harmless, since the buffer is not cleared between
> updates and content is deduplicated anyway. The spike now does this and reports
> a skipped-tick count so contention is visible.

> 🛑 **`CopySharedMemoryObj` gates its copies on garbage.** Each section is
> copied only `if (src.generic.events[SME_UPDATE_SCORING])` — that is, if slot
> **10** of the events array is non-zero. Since `events[]` is a queue terminated
> by `SME_MAX` (16), slot 10 almost always holds the terminator, which is
> truthy, so everything gets copied for entirely the wrong reason.
>
> It happens to work, and would keep working right up until slot 10 legitimately
> held `SME_ENTER` (0), at which point scoring would silently stop updating.
> Anything that keeps a rolling buffer cannot rest on that. The sidecar now uses
> its own `CopyShared`, which copies every section unconditionally with bounds
> checks and decodes the event queue separately.
>
> The SDK's version also writes its NUL terminator at `scoringStream[size]`
> without checking, which overruns when the stream fills the buffer exactly.

> ⚠️ **`mSectorFlag` is not a local-yellow boolean.** The header describes it as
> "whether there are any local yellows at the moment in each sector". Read live
> at Daytona through a green practice session it held a constant **11** in all
> three sectors. Whatever it carries, it is not what the header says, and no UI
> should present it as a yellow flag. It is carried through raw so a session
> with a real local yellow can settle it. This is the same trap as `mGamePhase`:
> the header describes the engine, not the game.

> ✅ **The two clocks agree.** `ScoringInfoV01.mCurrentET` (the clock `et=` is
> quoted in) and `TelemInfoV01.mElapsedTime` were measured 0.04–0.14s apart.
> Incident contexts are still anchored by searching for the frame whose
> `mCurrentET` is nearest the quoted `et`, so nothing depends on that continuing
> to hold; the observed anchor error is 0.0–0.1s, bounded by the scoring tick.

> ℹ️ **Telemetry ticks nearer 25Hz than 50Hz.** Measured at ~0.039s between
> updates at Daytona. Trace resolution follows the game's rate, not the sample
> floor, so frames carry their own timestamps and consumers must not assume
> constant spacing.

> ⚠️ **Strings are UTF-8.** Driver names arrive as UTF-8 bytes
> (`Sébastien Buemi`, `José María López`). Since driver name is the join key for
> incident parsing, any consumer must treat these as UTF-8 rather than the local
> code page.

Note the example takes LMU's PID as a command-line argument — Studio 397 designed this for an **external child process**, which directly supports the sidecar architecture below.

---

## Why This Is Lower Risk Than Expected

`ScoringInfoV01.mResultsStream` is documented as:

> results stream additions since last update (newline-delimited and NULL-terminated)

This is surfaced in shared memory as `scoringStream[65536]`, and it carries the **same event vocabulary the app already parses from XML**:

```xml
<Incident et="96.6">Bradley Drake(0) reported contact (2003.53) with Immovable</Incident>
```

The existing parser already handles both the self-closing and open-tag forms of `<Incident>`, `<Penalty>`, and `<TrackLimit>` — see `src/main/api/replay.ts:333-344` (self-closing branch) and `src/main/api/replay.ts:423-437` (open-tag branch).

**A live steward is therefore not a new detection engine.** It is the existing incident semantics arriving early, with the same `et=` timestamps and the same string shapes our fixtures already cover. This collapses the majority of the risk normally associated with a feature like this.

---

## Fields of Interest

Beyond the results stream, `VehicleScoringInfoV01` and `ScoringInfoV01` expose state that logs never capture:

**Incident reconstruction**
- `mPos`, `mLocalVel`, `mLocalAccel` — world position and derivatives, per car, at scoring rate
- `mLapDist`, `mPathLateral`, `mTrackEdge` — position relative to the racing surface

**Stewarding state**
- `mNumPenalties` — outstanding penalties
- `mCountLapFlag` — lap/time invalidation, i.e. track limits
- `mFlag`, `mUnderYellow`, `mYellowFlagState`, `mSectorFlag[3]` — flag state
- `mPitState`, `mNumPitstops`, `mInPits`, `mInGarageStall`
- `mFinishStatus` — none / finished / DNF / DQ
- `mTrackLimitsStepsPerPenalty`

**Identity**
- `mSteamID` — **stable driver identity, but only online.** `mID` is explicitly documented as reusable in multiplayer after a driver leaves, so it is not a safe key on its own.

> ⚠️ **`mSteamID` is `0` for every AI entry and every offline session.** A
> 54-car single-player field at Daytona reported 54 drivers and exactly **one**
> distinct Steam ID. Keying the UI on it collapsed the entire field to one
> identity — duplicate React keys, and a driver lookup that returned whichever
> car happened to be first.
>
> The rule is therefore: key on `mSteamID` **when it is populated**, and fall
> back to the slot otherwise. Neither field is sufficient alone. See
> `driverIdentity` in `src/renderer/hooks/useLiveSessionData.ts`.
>
> Note this cuts the other way for the camera: `/rest/watch/focus/<slot-id>`
> addresses cars by **slot**, so both keys have to be carried.

---

## Language and Runtime Analysis

### Why Node Alone Is Not Enough

Node cannot create or open Windows named file mappings, nor wait on kernel event objects. There is no built-in binding for `OpenFileMapping`, `MapViewOfFile`, or `WaitForMultipleObjects`. Some native component is unavoidable.

### Options

**1. N-API native addon, in-process with Electron main**

- Fastest data path, no IPC hop
- Requires `electron-rebuild` per Electron version and architecture
- Adds a code-signing surface
- A crash in the addon takes down the whole app
- The project already has native-dep tooling (`better-sqlite3`, `npm run rebuild`), so the toolchain exists

**2. Sidecar process — recommended**

A small native binary performs the Win32 work and streams normalized JSON lines over stdout.

- Crash isolated from the UI
- Decoupled from Electron version upgrades
- Independently testable, and its output can be **recorded and replayed as test fixtures**
- Matches Studio 397's own documented example (`child.exe <LMU-pid>`)
- Matches what every comparable project converged on — lmu-pitwall ships a Rust binary, le-mans-ultimate-telemetry uses a Python backend over WebSocket

**3. Pure-Node FFI (`koffi` / `ffi-napi`)**

- No build step, fastest to prototype
- Requires hand-decoding a large struct through FFI with fragile layout assumptions
- Acceptable for a Phase 0 spike, not for shipping

### Sidecar Language Tradeoff

| | **C++** | **Rust** |
| --- | --- | --- |
| Struct layout | Exact — `#include` the shipped header | Hand-ported, can drift |
| Header licensing | Cannot vendor; needs the header present at build time, complicating CI | Not affected |
| Distribution | Needs runtime consideration | Single static binary |
| Windows API | Native | `windows` crate |

The C++ advantage is real: including `SharedMemoryInterface.hpp` and `InternalsPlugin.hpp` yields exact layout for free and stays in sync automatically. The cost is that the header cannot be committed, so CI builds would need it sourced from a game install.

Rust avoids the licensing constraint and ships a clean single binary, at the cost of hand-porting the structs.

**Either way, gate on `SharedMemoryGeneric.gameVersion` and add a layout self-test** that validates expected struct sizes and offsets at startup. This is the primary defense against silent breakage on LMU updates.

---

## Performance Notes

`SharedMemoryObjectOut` embeds `TelemInfoV01[104]`, which is large — likely several hundred KB.

**For stewarding, the telemetry buffer is probably skippable entirely.** `VehicleScoringInfoV01` already carries `mPos`, `mLocalVel`, and `mLocalAccel` for every car at scoring rate (~5Hz), which is sufficient for proximity and closing-speed reconstruction. The high-rate telemetry array only becomes necessary for detailed per-car physics analysis, which is a different feature.

Skipping it avoids the bulk of the per-tick copy cost.

---

## Proposed Architecture

Live capture should be a **parallel producer into the existing incident model**, not a rewrite.

```
LMU (shared memory)
      │  LMU_Data / LMU_Data_Event
      ▼
native sidecar
      │  JSON lines over stdout
      ▼
src/main/live/          normalize into existing incident shape
      ▼
SQLite (better-sqlite3)
      ▼
IPC → renderer (live view)
```

Post-session, the existing XML parse reconciles against the captured data. **The XML remains authoritative**; live capture is enrichment that adds context the logs cannot carry.

This keeps the current log/replay pipeline untouched and lets the feature ship incrementally.

---

## Process Model and Lifecycle

The diagram above is the **data** path. This is the **process** path: who owns the sidecar and what bounds its lifetime. Both matter because the shared memory lock is machine-wide and shared with every other consumer, including wheel LED software and motion rigs.

The invariant the whole design rests on is **one supervisor, one sidecar**. Bounded try-acquire (see [Access Pattern](#access-pattern)) keeps a *single* well-behaved consumer polite; it does nothing to make *several* safe. Two Steward sidecars contending are indistinguishable, from the game's side, from Steward fighting a user's LED software.

```
one Electron main process        ← single-instance lock
        │  spawn --json --parent-pid=<supervisor pid>
        ▼
one lmu-spike sidecar            ← exits when LMU exits,
        │                          when the supervisor exits,
        │                          or on stopLiveCapture()
        ▼
   stdout JSON lines
```

### One supervisor

`src/main/main.ts` calls `app.requestSingleInstanceLock()` *before* the `whenReady` handler is registered. A losing instance quits without reaching `createWindow()` or `configureLiveCapture()`, so it cannot start a sidecar even transiently — ordering matters here, because `app.quit()` is asynchronous and a handler registered first would still fire. The winner handles `second-instance` by restoring, showing and focusing the existing window.

Nothing enforced this before 2026-08-06; see risk 8 for what that looked like in practice.

### One sidecar, and it exits with its supervisor

`configureLiveCapture()` is driven by two settings switches and is idempotent in both directions, so toggling either does not stack sidecars. `startLiveCapture()` is a no-op while a child is already live, and the supervisor respawns on exit after `RESTART_DELAY_MS` so a session starting later is picked up without user action.

Shutdown is the harder half. `stopLiveCapture()` only runs on orderly paths — a crash or a Task Manager kill skips it entirely, and the sidecar is spawned without a job object. It is therefore passed `--parent-pid=<n>` and waits on the parent handle alongside LMU's, in both the wait-for-mapping loop and the main tick loop. Three things end it: LMU exiting, the supervisor exiting, `stopLiveCapture()`.

Testing on 2026-08-06 did not produce an orphan even without that flag, but the mechanism was never identified and is not guaranteed for a packaged app — see risk 9 for the evidence and its limits. Diagnostic runs pass no parent pid and are unaffected.

### Dev loop consequence

The lock changes hot reload: on a `src/main/**` edit, electronmon spawns replacements (observed: five inside 65ms), the incumbent still holds the lock, and every replacement quits. **The app keeps running the old bundle** — a visible window is not evidence the edit loaded. Restart `npm start` fully after main-process changes, freeing port 1212 first. Renderer changes are unaffected.

That same burst is what made the pre-lock behavior so damaging: each of those processes used to start its own sidecar.

### Packaging — the sidecar is not shipped

⚠️ **OPEN.** `resolveSidecarPath()` searches `process.cwd()`, `app.getAppPath()` and the executable's directory for either `tools/live-capture-spike/build/lmu-spike.exe` or `resources/lmu-spike.exe`. In dev the first hits from the repo root. **In a packaged build neither exists:**

- electron-builder's `extraResources` is `./assets/**` only, so nothing ever places `lmu-spike.exe` into `resources/`.
- `tools/live-capture-spike/build/` is gitignored, so the binary is not in the repo for CI to copy — any release step must *build* it (`tools/live-capture-spike/build.bat`, needs an MSVC toolset and the LMU SDK headers, which cannot be redistributed).

A packaged release therefore reports "Live capture sidecar not found" and the feature is silently unavailable. Live capture is **dev-only until this is resolved**, which is also why the parent-pid change above currently only takes effect in dev. Resolving it means deciding how the sidecar gets built and signed for release, not just adding a path to `extraResources`.

---

## Suggested Phasing

**Phase 0 — Spike (highest value, ~1–2 days)**
Throwaway standalone executable. Map `LMU_Data`, print `mResultsStream` and scoring info, run through one online race. Everything downstream is ordinary work once this is green.

**Phase 0 verification checklist.** Every open question in these documents resolves here, so run them all in the same session rather than discovering them one at a time:

| # | Question | How to check | If it fails |
| --- | --- | --- | --- |
| 1 | **Does EAC permit the read in an online session?** | Run the spike during a live multiplayer/ranked race, not just single player | Blocks the entire feature — stop and reassess |
| 2 | Is shared memory populated only with **Enable Plugins** on? | Toggle Settings → Gameplay → Enable Plugins and compare | Detect and surface "live capture unavailable" |
| 3 | Is `telemInfo[104]` populated for **remote** cars? | Dump `activeVehicles` and sample brake/throttle for two remote drivers | Drop throttle/brake traces from the dossier; scoring data still carries Tier 1 |
| 4 | What `mFlag` value indicates **blue**? | Trail a faster car until blue is shown, log the raw value | Decode empirically; never hardcode `6` |
| 5 | Is `mTrackLimitsStepsPerPenalty` populated with a real threshold? | Read it and compare against in-game track-limit behavior | Strike tracking loses its denominator; show raw counts instead |
| 6 | Are `mGamePhase` / `mYellowFlagState` inert? | Watch during a session; expect no meaningful FCY transitions | Confirms the current assumption — do not design on them |
| 7 | Does the hand-ported struct layout match? | Assert expected sizes/offsets at startup; log `gameVersion` | Fix the port before anything else is trusted |

Items 1 and 3 are the high-stakes ones — 1 gates the feature, 3 gates the flagship dossier capability.

### Results — online practice run, 2026-07-28 ✅ PHASE 0 COMPLETE

WeatherTech Raceway Laguna Seca, ~29 human drivers, public practice. **All seven items answered.**

| # | Result |
| --- | --- |
| 3 | ✅ **PASS — remote telemetry is fully populated.** Vehicles reporting `mControl == 2` carried live, changing throttle/brake/steering (`thr=0.97 brk=0.00 str=-0.06`), sampled repeatedly over many minutes. |
| 4 | ✅ **PASS — `mFlag == 6` confirmed as blue.** Both `0` and `6` observed in a live multiclass field, matching the header's documented values. |

**Item 3 is the flagship result.** Throttle and brake traces for *other* drivers are available, which makes the incident dossier's strongest capability real: *"did he brake-check me?"* becomes a brake trace rather than an argument. Tier 1 should be resequenced to include traces.

**Findings that change the design:**

- **`mTrackLimitsStepsPerPenalty` is per-session, not a constant.** It read `40` at Daytona and `24` at Laguna Seca. Strike tracking must read it live per session; hardcoding a denominator would misreport every driver's standing.
- **A single collision produces two `<Incident>` records** — one from each car's perspective, ~0.1s apart, with *different* magnitudes:
  ```
  <Incident et="6235.4">matteo stefano(50) reported contact (210.78) with another vehicle Rafael Cruvinel(14)</Incident>
  <Incident et="6235.5">Rafael Cruvinel(14) reported contact (125.23) with another vehicle matteo stefano(50)</Incident>
  ```
  The triage queue must fold these into **one incident with two parties**, or every car-to-car contact appears twice and the unreviewed count is inflated. The differing magnitudes are themselves evidence — they indicate which car absorbed more of the impact.
- **`<TrackLimits>` is emitted twice on the live stream.** The written session XML contains it once (verified against `fixture-test-set/`), so this is live-stream-specific. Without deduplication, live counts would be double the post-session counts and the two views would disagree.
- **`<Sector>` elements carry more than sector times.** They also report damage: `<Sector et="6211.2">S F#7575(54) reports new suspension damage</Sector>`. Damage is stewarding-relevant and arrives on a channel the design had not considered.
- **Driver names are user-supplied and messy** — `S F#7575`, `Bence Biro#6702`, `matteo stefano`. Names contain `#`, digits, and arbitrary casing. This reinforces `mSteamID` as the join key; name matching would be fragile.
- **`mNumVehicles` changes continuously** in open practice (29 → 24 as drivers joined and left). Any field-state UI must treat the roster as volatile rather than fixed at session start.
- **New incident object kinds:** `Sign`, alongside `Immovable` and `Cone`.

### Results — single-player run, 2026-07-28

Daytona Road Course, 54 vehicles, practice session.

| # | Result |
| --- | --- |
| 1 | ✅ **PASS.** Read succeeded against a running game. Anti-cheat did not interfere. |
| 2 | ✅ Mapping opened with plugins enabled. Note it is absent at the main menu — see the warning above. |
| 3 | ⏳ **Still open.** All 54 slots populated with changing throttle/brake/steering, but every vehicle reported `mControl == 1` (local AI). Single player cannot answer this; an online race is still required. |
| 4 | ⏳ **Still open.** Only `mFlag == 0` (green) observed — no blue-flag situation arose. |
| 5 | ✅ **Populated.** `mTrackLimitsStepsPerPenalty = 40`, `mTrackLimitsStepsPerPoint = 4`. |
| 6 | ✅ **Consistent with the assumption.** Phases `0 → 5` (green flag) only; `mYellowFlagState` stayed `0`. No FCY. |
| 7 | ✅ Layout matches the baseline below; `mSession` moved `0 → 1` as the session loaded. |

**Confirmed stream formats.** All three steward event kinds appear live:

```
<Incident et="114.8">Bradley Drake(0) reported contact (5004.90) with another vehicle Robert Kubica(15)</Incident>
<Incident et="66.1">Bradley Drake(0) reported contact (8954.12) with Immovable</Incident>
<TrackLimits Driver="Bradley Drake" ID="0" Lap="0" WarningPoints="23.75" CurrentPoints="23.75" Resolution="5" et="25.7">Invalid Lap Cut Track</TrackLimits>
<TrackLimits Driver="Bradley Drake" ID="0" Lap="0" WarningPoints="0" CurrentPoints="23.75" Resolution="7" et="73.9">No Further Action</TrackLimits>
```

Notes that affect the design:

- **The element is `<TrackLimits>`, plural** — matching the existing parser fix that bumped `REPLAY_CACHE_SCHEMA_VERSION` to 3. Live capture confirms that fix independently.
- **`<TrackLimits>` is far richer than assumed** — it carries `WarningPoints`, `CurrentPoints`, `Resolution`, and a verdict as text content (`Invalid Lap Cut Track`, `No Further Action`). The design treated track limits as a bare count; it is closer to an adjudicated event with a running points total.
- **Contact events name the object struck**: `another vehicle <Name>(<ID>)`, `Immovable`, `Cone`. Only the first is a two-driver incident; a parser must not assume every `<Incident>` has two parties.
- **Not every incident is stewardable.** Hitting a cone or a wall generates an `<Incident>` identical in shape to car-to-car contact. The triage queue needs to classify and de-prioritise solo events, or a steward drowns in their own off-track excursions.

**Measured layout baseline** (item 7), from compiling against the shipped headers on 2026-07-28:

| Symbol | Bytes |
| --- | ---: |
| `sizeof(SharedMemoryObjectOut)` | 324,824 |
| `sizeof(ScoringInfoV01)` | 548 |
| `sizeof(VehicleScoringInfoV01)` | 584 |
| `sizeof(TelemInfoV01)` | 1,888 |
| `offsetof(…, scoring)` | 1,632 |
| `offsetof(…, telemetry)` | 128,464 |

These reconcile exactly with the declared arrays (104 × 1,888 + 8 = 196,360 for the telemetry block), which confirms `#pragma pack(push, 4)` is being applied as expected. **Re-run the spike after any LMU update and diff against this table** — a change means the layout drifted and any hand-ported struct definition needs revisiting.

Note the total is ~317 KB, not the ~1 MB estimated earlier in this document. Copying the whole object at 50Hz is roughly 16 MB/s, which is unremarkable — and `CopySharedMemoryObj` copies less than that, since it skips sections whose event flag did not fire and only walks active vehicles. **The earlier concern about telemetry copy cost was overstated.** Skipping the telemetry buffer remains reasonable for Tier 1 because the data isn't needed, not because it is expensive.

**Phase 1 — Transport**
Stream live session and driver state only, no incidents. Proves the sidecar, the IPC path, and the UI wiring end to end.

**Phase 2 — Live incidents**
Parse `mResultsStream` into the existing incident model. Reuses current parser semantics.

**Phase 3 — Context capture** ✅ **DONE, verified live 2026-08-02**
Rolling position/velocity buffer; snapshot the N seconds around each incident. This is the feature people are actually asking for.

The sidecar keeps a ~30s in-memory ring of per-car frames — world position and
velocity, yaw rate, throttle/brake/steering from telemetry, merged with lap
distance, lateral offset, track edge, flag and sector from scoring — and emits a
window of `[-6s, +2s]` per contact. Nothing is recorded continuously.

Because the window straddles the incident, and only the "before" half exists
when the `<Incident>` line arrives, each incident is parked and emitted once the
session clock has run past it. Evidence derivation (closing speed, who was
ahead, on/off track, class interaction, braking, blue-flag duration, peak yaw)
happens in TypeScript in `src/main/api/live-incident-evidence.ts`, where it can
be unit tested; the sidecar only captures and emits.

**Verified against a live session at Daytona, 2026-08-02.** A real LMP2-into-GT3
contact produced both cars' traces: the LMP2 arriving under braking 13 m/s
faster, closing from ~15m to ~5m, and losing 4 m/s in a single sample at
contact. That capture is checked in as
`src/main/api/live-incident-context.fixture.ts` and is what the evidence tests
run against.

> ⚠️ **A duration measured against a finite window is a floor, not a fact.**
> "Blue flag shown for 6.0s" may mean the flag was shown for six seconds, or
> that it was already showing when the window began. Held durations carry a
> `truncated` flag and render as `6.0s+` when the measurement ran off the end of
> the capture.

**Phase 4 — Derived detection**
Detections the game does not report itself, built on captured context.

---

## Risks and Open Questions

1. **EasyAntiCheat — the main unknown.** LMU ships EAC (`EasyAntiCheat/`, `start_protected_game.exe`). Reading a section the game deliberately exposes is sanctioned rather than injection, and community tools do this routinely, but this should be **validated in a real online/ranked session before building on it**. This is the single biggest reason Phase 0 exists.
2. **Enable Plugins toggle.** Required, and off by default for some users. The app must detect its absence and surface "live capture unavailable" clearly rather than failing silently.
3. **Struct layout drift** across LMU updates. Mitigate with `gameVersion` gating and a startup layout self-test.
4. **Live vs. replay disambiguation.** Shared memory is populated during replay playback too. The existing `/rest/replay/isActive` endpoint can distinguish.
5. **Remote vehicle accuracy.** The header warns `mInPits` is "not always accurate for remote vehicles." Multiplayer-derived state needs tolerance.
6. **Slot ID reuse.** `mID` is reused after a driver leaves a multiplayer session. Key on `mSteamID`.
7. **`stewardResults` path.** LMU exposes its own stewarding-results concept via `SharedMemoryPathData`. Not yet investigated — may overlap with or complement this feature.
8. **Multiple Steward instances.** ✅ MITIGATED 2026-08-06. Nothing stopped several copies of the app running at once, and each one called `configureLiveCapture()` and spawned its own sidecar. Observed live: four `lmu-spike` processes alongside ~21 Electron processes, with three "starting sidecar" log lines inside 60ms. Several sidecars contending for the machine-wide lock is precisely the hazard bounded try-acquire exists to avoid — try-acquire keeps *one* sidecar polite, it does not make *several* safe. Double-clicking the desktop shortcut twice was enough to reproduce it. `src/main/main.ts` now takes `app.requestSingleInstanceLock()` before the `whenReady` handler is registered, so a losing instance quits without ever creating a window or a sidecar. **Dev cost:** electronmon hot-restart no longer applies `src/main/**` edits — the incumbent holds the lock and each replacement quits — so a full `npm start` restart is needed after main-process changes.
9. **Sidecar lifetime is tied to the supervisor by convention, not contract.** `stopLiveCapture()` only runs on orderly shutdown; a crash or a Task Manager kill skips it. The sidecar is spawned without a job object and watches only *LMU's* process, so nothing in either codebase guaranteed it would exit with the app. Testing on 2026-08-06 did **not** reproduce an orphan — killing the Electron main process alone ended the sidecar within 8s — but the mechanism was never identified: `IsProcessInJob` is uninformative on Windows 10 (every process sampled, including user-launched LMU, reports true), so whether job teardown or a broken stdout pipe ended it is unknown, and neither is guaranteed for a packaged app launched from a shortcut. The sidecar now accepts `--parent-pid=<n>` and waits on the parent handle alongside LMU's, making the exit explicit rather than incidental. Verified causally: with the flag the sidecar exits when an isolated dummy parent is killed; without it, that same parent's death leaves it running. Diagnostic runs pass no parent pid and are unaffected.

---

## Verification Provenance

Facts in this document were verified directly against a local LMU installation on **2026-07-28**, not solely from web sources. Community documentation on this topic is inconsistent and frequently conflates the two data paths.

- Install path: `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate`
- `Support/SharedMemoryInterface/SharedMemoryInterface.hpp` — dated 2026-03-31
- `Support/SharedMemoryInterface/InternalsPlugin.hpp` — dated 2026-03-31
- `Support/SharedMemoryInterface/PluginObjects.hpp` — dated 2025-12-16
- Incident XML shape confirmed against `fixture-test-set/replay-log-data-files/`

Re-verify the header contents after major LMU updates before relying on this document.

Risks 8 and 9 were verified separately on **2026-08-06** against a running LMU practice session (Laguna Seca, 37 drivers) with live capture enabled, by launching the app twice and by killing the supervisor out from under the sidecar.

---

## References

- [pyLMUSharedMemory](https://github.com/TinyPedal/pyLMUSharedMemory) — Python library for LMU's **built-in** interface; closest reference implementation
- [TinyPedal](https://github.com/TinyPedal/TinyPedal) — supports both paths; its README documents the first-party vs plugin distinction
- [lmu-pitwall](https://github.com/Swizzjack/lmu-pitwall) — Rust sidecar + React frontend; useful architectural precedent
- [le-mans-ultimate-telemetry](https://github.com/NikMusy/le-mans-ultimate-telemetry) — Python backend streaming JSON over WebSocket
- [rF2SharedMemoryMapPlugin](https://github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin) — TheIronWolf's plugin, the third-party path
