# Live Capture Investigation

**Status:** Research complete — no implementation started
**Date:** 2026-07-28
**Companion documents:**
- [Live Mode — Product Design](live-mode-product-design.md) — what live mode should be, and why it is not a variant of the replay UI
- [Export & Steward Decisions](export-and-decisions-design.md) — the decision layer, record schema, and the three export surfaces

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

Copy under the lock, process outside it. `CopySharedMemoryObj` is already selective — it only copies sections whose event flag fired, and only `mNumVehicles` / `activeVehicles` entries rather than the full 104 slots.

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
- `mSteamID` — **stable driver identity.** `mID` is explicitly documented as reusable in multiplayer after a driver leaves, so it is not a safe key. This is likely a worthwhile improvement to the existing app independent of live capture.

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

**Phase 3 — Context capture**
Rolling position/velocity buffer; snapshot the N seconds around each incident. This is the feature people are actually asking for.

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

---

## Verification Provenance

Facts in this document were verified directly against a local LMU installation on **2026-07-28**, not solely from web sources. Community documentation on this topic is inconsistent and frequently conflates the two data paths.

- Install path: `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate`
- `Support/SharedMemoryInterface/SharedMemoryInterface.hpp` — dated 2026-03-31
- `Support/SharedMemoryInterface/InternalsPlugin.hpp` — dated 2026-03-31
- `Support/SharedMemoryInterface/PluginObjects.hpp` — dated 2025-12-16
- Incident XML shape confirmed against `fixture-test-set/replay-log-data-files/`

Re-verify the header contents after major LMU updates before relying on this document.

---

## References

- [pyLMUSharedMemory](https://github.com/TinyPedal/pyLMUSharedMemory) — Python library for LMU's **built-in** interface; closest reference implementation
- [TinyPedal](https://github.com/TinyPedal/TinyPedal) — supports both paths; its README documents the first-party vs plugin distinction
- [lmu-pitwall](https://github.com/Swizzjack/lmu-pitwall) — Rust sidecar + React frontend; useful architectural precedent
- [le-mans-ultimate-telemetry](https://github.com/NikMusy/le-mans-ultimate-telemetry) — Python backend streaming JSON over WebSocket
- [rF2SharedMemoryMapPlugin](https://github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin) — TheIronWolf's plugin, the third-party path
