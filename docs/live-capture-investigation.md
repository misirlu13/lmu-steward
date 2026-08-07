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
- [Observed Steering Distribution](#observed-steering-distribution)
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

**Session vs replay**
- `mControl` — `-1` nobody, `0` local player, `1` local AI, `2` remote, `3` replay

> 🛑 **Watching a replay populates shared memory exactly like driving a
> session.** Same track, same field, a running session clock, `state: live` on
> the status line — nothing there distinguishes them. Live capture recorded
> three "sessions" that were replays being watched before this was understood.
>
> `mControl == 3` on every car is the only reliable tell. Observed in a real
> store: a 37-car Laguna Seca "session" with `controls={3: 37}` and no
> incidents, alongside genuine sessions reading `controls={1: 38}`.
>
> The test is **unanimity, not any** — a real session never contains a
> replay-controlled car, so requiring all of them cannot produce a false
> positive, whereas a single stray value could. See `canPersistCapture` in
> `src/main/api/live-capture.ts`.
>
> ⚠️ **The standings are what settle this, and they arrive after the status
> line.** Nothing may be persisted until the first standings for a session have
> been seen — writing on the first status tick produced session rows with no
> field at all. Standings must also be **cleared on a session change**, or a new
> session's first row carries the previous session's field, control values
> included, which defeats the check entirely.

---

## Field Expansion — Observed Values, 2026-08-07

The sidecar originally read a deliberately narrow slice of the two scoring structs. It now also
carries session conditions on the status line and timing, pit state and world position on each
standings row. Every field below was **observed live** across one practice, one qualifying and one
race session at WeatherTech Raceway Laguna Seca (37 AI cars, dry) on 2026-08-07. Values are quoted
as read, not as the header describes them, because in four places the two disagree.

### The header is not the last word

| Field | Header says | Observed |
| --- | --- | --- |
| `mPitState` | `0=none, 1=request, 2=entering, 3=stopped, 4=exiting` | **5** is the resting value for a car sitting in the pits or garage — 34 of 37 cars carried it at the qualifying green. `0`, `1` and `2` were also seen; `3` and `4` were not. **The documented range is wrong**, so nothing may treat this as a five-entry lookup. |
| "no time" sentinel | `-1` throughout | **Inconsistent within one row.** A driver with no completed lap has `mBestLapTime` `-1` but `mLastSector1` `0`. Filter on `> 0`; a `!== -1` check lets the zeros through onto a timing screen. |
| `mServerName` | "name of the server" | The literal string `"-none-"` offline, matching the REST `sessionInfo` payload in `session.ts:17`. It is a placeholder, not a name, and is dropped rather than carried. |
| `mCloudCoverage`, `mTrackGripLevel` | *(LMU additions, undocumented)* | Small integers, **not percentages** — `cloudCoverage` read 1 in a clear practice and 0 in a clear qualifying; `trackGripLevel` a constant 3 across all three sessions. Enums or steps of some kind. Carried raw; do not render until a wet or green-track session says what the scale is. |

### What checks out exactly

- **`mTimeOfDay` = `mStartET` + `mCurrentET`**, confirmed to 0.1s in all three sessions
  (practice `43200.0 + 2844.4 = 46044.4`, i.e. a session started at noon, 47 minutes in). Both are
  seconds since midnight, and the session start is a *time of day*, not an elapsed offset.
- **Sector 2 is cumulative (S1+S2)**, exactly as the header claims, and the three sectors
  reconstruct the lap to the millisecond. Race leader: S1 `29.008`, `mLastSector2` `60.249`,
  `mLastLapTime` `77.233` → S2 = `31.241`, S3 = `16.984`, sum `77.233`. Getting this wrong is the
  classic timing-screen bug; the arithmetic is `S2 = last2 - last1`, `S3 = lap - last2`.
- **`mBestSector1` ≠ `mBestLapSector1`**, as the header warns and as real data confirms — a
  practice leader held a best S1 of `28.708` while the S1 *from* their best lap was `28.748`. Two
  genuinely different numbers; a timing screen that conflates them is lying by a few hundredths.
- **`mTimeBehindNext` is a true interval in a race**, and composes into `mTimeBehindLeader`
  exactly: P2 `0.653`, P3 `0.543`, P4 `0.395` against leader gaps `0.653`, `1.196`, `1.591`. This
  is the `INT` column.
- **`mPos.x` / `mPos.z` share the world coordinate space of `/rest/watch/trackMap`.** Cars in a
  lap-1 train read `x ≈ −390…−404` with `z` stepping `−190 → −100` in running order, inside the
  map's own extent. No calibration is needed between the two.
- **`mTimeIntoLap` goes negative before the start** (`−19.6` observed in the REST sample, `−3.19`
  live at the qualifying green), so it is carried whenever it is a number rather than only when
  positive.

### What is *not* trustworthy

> ⚠️ **`mTimeBehindNext` and `mTimeBehindLeader` are meaningless outside a race.** In practice they
> read `0.0` for almost the whole field, with stray values of `40.993`, `68.269` and a **negative**
> `−0.829`. Practice and qualifying rank by best lap, so the car "one place higher" is not the car
> ahead on track. This is the same reason `live-pressure.ts` derives gaps from `lapDist` instead.
> An `INT` column must be suppressed, not zeroed, outside a race.

> ⚠️ **`mQualification` is a grid position, not a qualifying result, and it is populated before
> one exists.** It read a clean `1…37` straight down the entry list in practice *and* in qualifying
> before any car had set a lap. In the race it became a real permutation — the pole-sitter
> (`qualification: 1`) had dropped to P4 by the first tick — so it *is* the grid once a grid exists.
> Nothing in the value distinguishes "real result" from "placeholder ordering", so it should only be
> shown in a race.

> ⚠️ **`mYellowFlagState` read a constant `0` (None) through all three sessions.** No caution was
> triggered, so this neither confirms nor refutes the standing assumption that LMU does not
> meaningfully implement full-course yellows — the same assumption that already makes `gamePhase` 6
> get treated as green. `live-capture.ts` logs every transition of this field, so the question will
> answer itself from a session that has one. Until then, build nothing on it.
>
> `mSectorFlag` remains excluded: still a constant `[11, 11, 11]` in every green session observed.

### Cost

The standings line grew from roughly 350 to **695 bytes per car**, measured on a 37-car race tick.
At the 1 Hz poll rate and LMU's 104-car ceiling that is ~72 KB/s over the sidecar's stdout pipe,
against ~36 KB/s before. `LiveSessionRecord.drivers` persists the final standings, so a stored
session row roughly doubles for the same reason.

`EmitStatusJson` and the per-row `snprintf` in `EmitStandingsJson` were replaced with a `FormatJson`
helper that measures with `snprintf`'s return value and re-formats into a heap buffer when the
stack buffer will not fit. The row had a fixed `char entry[896]` and the ~18 new fields would have
overflowed it; **`snprintf` truncates silently**, and a truncated row is malformed JSON that
`applyLine` discards with a `live-capture: unparseable line:` warning almost nobody reads. Sizing
the buffer larger only moves that cliff. Truncation is now impossible rather than detected.

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

## Observed Steering Distribution

Measured **2026-08-07**, before choosing an axis for the steering channel in
`LiveIncidentTraceChart.tsx` (plan Step 6). Source: `live_incident_contexts` in
the local data store — **314,111 frames** across **1,534 incidents** and
**1,742 car traces**, from four captured sessions (three at Laguna Seca, one at
Daytona Road Course). All AI fields; AI cars report live, changing steering, so
this is valid data for range purposes.

**The committed fixtures are not representative of this, and neither was the
assumption built on them.** `liveTraceFixture.ts` spans only −0.226…+0.176 and
`buildFrames` in `liveFixtures.ts` generated `jitter * 0.2`. Both suggested
steering occupies a narrow band around centre and that a full-scale −1…+1 axis
would draw every trace as a flat line. **On real data that is false.**

| Measure | Value |
| --- | --- |
| Per-frame range | −1.000 … +1.000 (the full scale, both rails reached) |
| Frames at exactly −1.000 | 17.0% |
| Frames at exactly +1.000 | 4.1% |
| Per-car steering range (moving cars), median | 0.819 of the available 2.0 |
| Per-car range (moving cars), p75 / p90 | 1.239 / 1.869 |

**Read the near-zero mass carefully — it is stationary cars, not small inputs.**
51% of frames fall in `[0.0, 0.1)` and 729 of 1,742 car traces are a *constant*
`+0.000`, but 98.5% of near-zero frames are below 1 m/s. Filtering to cars that
were actually moving (mean speed > 5 m/s, n = 656) changes the picture entirely:

| max abs(steering) | Share of moving cars |
| --- | --- |
| ≤ 0.1 | 1.1% |
| ≤ 0.2 | 8.1% |
| ≤ 0.3 | 27.7% |
| ≤ 0.5 | 46.5% |

Restricting further to cars that never dropped below 20 m/s — still racing, no
spin or recovery (n = 443) — gives p25 = 0.216, median = 0.374, p75 = 0.633,
p90 = 0.968. Saturation at ±1.0 correlates strongly with low speed (mean 2.6 m/s
at full lock, 66% of those frames below 1 m/s), which is the expected signature
of a spin, a recovery, or a stationary car with the wheel wound on.

**Consequences, both now implemented:**

1. **The steering axis is fixed full-scale, −1…+1, and is not autoscaled.**
   Autoscaling was on the table only because the fixture implied real inputs
   were tiny. They are not, so autoscaling would buy nothing and would cost the
   two properties this trace exists for: comparability between the two cars in
   one incident, and between one incident and the next.
2. **`buildFrames` was corrected** to wind on toward full lock in the braking
   zone rather than wobbling at ±0.2, so dev mode shows a representative band.

**Cars per incident — 1,326 of 1,534 (86%) carry a single car's window**, only
208 carry two. This is why the trace chart keeps one SVG per car rather than
moving to one SVG per channel with both cars overlaid: in the large majority of
real incidents there is no second car to overlay.

> ⚠️ **Handedness is still unknown.** Nothing in `main.cpp`, `types.ts` or the
> vendored SDK header records which sign is left and which is right.
> `mUnfilteredSteering` correlates with the yaw rate derived from
> `mLocalRot.y` at r = +0.71, agreeing in sign on 93.8% of meaningful inputs, so
> the channel is coherent — but that establishes consistency, not direction. The
> chart therefore labels steering by magnitude only and makes no left/right
> claim. **To resolve:** log `mUnfilteredSteering` against a known corner in a
> live session and record the answer here.

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

The field expansion values above were verified on **2026-08-07** against three consecutive live sessions at WeatherTech Raceway Laguna Seca (37 AI cars, dry, `session` 1 / 5 / 10), by running the rebuilt sidecar standalone with `--json` and reading its emitted lines directly. `/rest/watch/trackMap` was confirmed to serve geometry during a live session in the same sitting — see Step 8 of `plans/live-steward-ui-plan.md`.

---

## References

- [pyLMUSharedMemory](https://github.com/TinyPedal/pyLMUSharedMemory) — Python library for LMU's **built-in** interface; closest reference implementation
- [TinyPedal](https://github.com/TinyPedal/TinyPedal) — supports both paths; its README documents the first-party vs plugin distinction
- [lmu-pitwall](https://github.com/Swizzjack/lmu-pitwall) — Rust sidecar + React frontend; useful architectural precedent
- [le-mans-ultimate-telemetry](https://github.com/NikMusy/le-mans-ultimate-telemetry) — Python backend streaming JSON over WebSocket
- [rF2SharedMemoryMapPlugin](https://github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin) — TheIronWolf's plugin, the third-party path
