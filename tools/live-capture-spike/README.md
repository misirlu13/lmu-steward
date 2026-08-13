# Live Capture Sidecar

Attaches to Le Mans Ultimate's first-party shared memory interface and streams
what it reads to the app as one JSON object per line on stdout.

**This ships.** It started as the Phase 0 spike answering the seven open
questions in
[live-capture-investigation.md](../../plans/live-capture-investigation.md), and it
still runs standalone for that — without `--json` it prints a human-readable
diagnostic and a findings summary. But the live steward feature depends on it, so
`npm run package` builds it and electron-builder copies it into the installer as
`resources/lmu-spike.exe`, signed with the same certificate as the app.

The app spawns and supervises it from `src/main/api/live-capture.ts`. It is a
separate process rather than an in-process addon deliberately: a struct-layout
mismatch after an LMU update kills the sidecar instead of the app, and stdio
keeps us clear of the firewall prompts and antivirus heuristics a local socket
would attract.

---

## Why C++, and why the layout is vendored

The sidecar used to `#include` LMU's own `SharedMemoryInterface.hpp` straight
from the game install. That gave exact struct layout for free, but it made a
**game installation a build input** — so no CI runner could produce the binary,
and the feature could not ship at all.

The layout now lives in
[`lmu-shared-memory-layout.hpp`](lmu-shared-memory-layout.hpp), written here and
committed. Nothing proprietary is copied into this repository, and the build
needs no game install. This is the same approach every other third-party LMU tool
takes — TinyPedal's `pyLMUSharedMemory` declares the identical layout in Python
`ctypes`.

C++ is still the right language for it: the packing rules are subtle enough that
being able to cross-check against the real header at compile time is worth a lot.
See **Verifying the layout** below — that check is what makes the vendored header
trustworthy, and it is not optional after an LMU update.

---

## Prerequisites

- **MSVC toolset** — any of VS 2017/2019/2022 with the C++ workload, or the
  standalone Build Tools. The build script locates it via `vswhere`.
- **Le Mans Ultimate** installed — only to *run* it, and to use `--verify`. Not
  needed to build.
- **Settings → Gameplay → Enable Plugins** turned **ON**, then restart the game

> Verified building and running against **VS 2017 Build Tools (MSVC 14.16)**.
> Compiles clean, and the layout report reconciles with the declared struct
> arrays — see the measured baseline in the investigation doc.

---

## Build

```
tools\live-capture-spike\build.bat
```

or, the way packaging does it, which also works on non-Windows by skipping:

```
npm run build:sidecar
```

---

## Verifying the layout

**Run this after every LMU update.** It is the only check that can catch the
game's structs moving underneath us:

```
tools\live-capture-spike\build.bat --verify
```

This compiles [`layout-check.cpp`](layout-check.cpp), which pulls in *both* the
vendored header and the SDK header from your game install and asserts — field by
field, not just size by size — that they describe the same bytes. It needs
`LMU_SDK_DIR` (defaulting to the usual Steam path) and so is local-only; CI
deliberately cannot run it.

A failure names the field that moved. Fix the vendored header, then update the
measured baseline in the investigation doc.

The vendored header also carries `static_assert`s against that recorded baseline.
Those compile everywhere, CI included, and are the guard rail when no game
install exists to check against — but they only pin numbers measured once. The
cross-check is the real proof.

> **The packing changes halfway down the header, and this is easy to get wrong.**
> The `V01` structs come from `InternalsPlugin.hpp` and are `pack(4)`. The
> `SharedMemory*` wrappers are **not** — that header pops its pack before they
> are declared, so they get default 8-byte alignment. Packing the whole file at 4
> moves `scoringStreamSize`, the vehicle array behind it, and the tail padding on
> `SharedMemoryObjectOut`. The cross-check caught exactly this during the port.

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
  and `lmu-shared-memory-layout.hpp` needs revisiting — `--verify` will tell you
  which field moved.
- Shared memory is also populated during **replay playback**, which gives
  deterministic, repeatable input for parser work without driving. It is not a
  substitute for the online run.
- `build/` is git-ignored. The binary ships, but it is compiled during packaging
  rather than committed.
