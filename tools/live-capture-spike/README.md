# Phase 0 — Live Capture Spike

Throwaway diagnostic that attaches to Le Mans Ultimate's first-party shared memory
interface and answers the seven open questions in
[live-capture-investigation.md](../../docs/live-capture-investigation.md).

**This is a dev tool. It is never shipped, never bundled, and never signed.**

---

## Why C++

The spike `#include`s LMU's own `SharedMemoryInterface.hpp` directly from the game
install. That makes struct layout correct by construction — including the
`#pragma pack(push, 4)` the headers rely on — which answers checklist item 7 for
free and removes the biggest risk of a hand-ported struct definition.

The header is **proprietary and may not be redistributed**, so it is read from
your Le Mans Ultimate installation at build time and never copied into this
repository. Only the compiled binary is an artifact, and that stays local.

---

## Prerequisites

- **MSVC toolset** — any of VS 2017/2019/2022 with the C++ workload, or the
  standalone Build Tools. The build script locates it via `vswhere`.
- **Le Mans Ultimate** installed
- **Settings → Gameplay → Enable Plugins** turned **ON**, then restart the game

> Verified building and running against **VS 2017 Build Tools (MSVC 14.16)** on
> 2026-07-28. Compiles clean, and the layout report reconciles with the declared
> struct arrays — see the measured baseline in the investigation doc.

---

## Build

```
tools\live-capture-spike\build.bat
```

The script locates MSVC via `vswhere` and picks up the SDK headers from the
default Steam install path. Override with `LMU_SDK_DIR` if your install differs:

```
set LMU_SDK_DIR=D:\Games\Le Mans Ultimate\Support\SharedMemoryInterface
tools\live-capture-spike\build.bat
```

## Run

Start Le Mans Ultimate, get into a session, then:

```
tools\live-capture-spike\build\lmu-spike.exe
```

It finds the game process automatically. Pass a PID as the first argument to
override. Press **Ctrl+C** to stop and print the summary.

---

## What to look for

Live output prints the **results stream** as it arrives — the `<Incident>`,
`<Penalty>`, and `<TrackLimit>` lines the app already parses from session XML.
Seeing those appear in real time is the core finding.

Every 5 seconds it prints diagnostics, and on exit a summary maps directly onto
the checklist:

| # | Question | What the summary shows |
| --- | --- | --- |
| 1 | EAC permits the read | PASS if scoring data was observed while running |
| 2 | Enable Plugins gate | Whether the `LMU_Data` mapping opened |
| 3 | Remote-car telemetry | PASS / FAIL / INCONCLUSIVE — see below |
| 4 | `mFlag` blue value | Distinct values observed |
| 5 | Track-limit threshold | `mTrackLimitsStepsPerPenalty` / `StepsPerPoint` |
| 6 | FCY inert | Distinct game phases and yellow states seen |
| 7 | Struct layout | Sizes, offsets, and `gameVersion` |

---

## Run it twice — this matters

**Single player answers 5 of 7.** Use it for fast iteration; it is offline, so
there is no anti-cheat exposure and no league impact.

**But single player cannot answer items 1 and 3**, and item 3 will actively
mislead you: offline, every car is simulated locally, so telemetry looks fully
populated. The real question is whether *network-interpolated remote* cars in a
multiplayer client carry input data. The spike reports INCONCLUSIVE rather than
PASS when it sees no `mControl == 2` vehicles, specifically to avoid that trap.

**So: one online race is required** to close items 1 and 3.

### Item 3 decides a feature

- **PASS** — throttle/brake traces for both drivers are viable in the incident
  dossier. That is the flagship capability; resequence Tier 1 to include it.
- **FAIL** — drop trace evidence from the design. Everything in Tier 1 still
  stands on scoring data alone; no other plan depends on it.

---

## Notes

- Record the item 7 numbers. A change across LMU updates means the layout drifted
  and any hand-port needs revisiting.
- Shared memory is also populated during **replay playback**, which gives
  deterministic, repeatable input for parser work without driving. It is not a
  substitute for the online run.
- `build/` is git-ignored.
