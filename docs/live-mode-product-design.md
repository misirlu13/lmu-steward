# Live Mode — Product Design

**Status:** Design proposal — no implementation started
**Date:** 2026-07-28
**Companion documents:**
- [Live Capture Investigation](live-capture-investigation.md) — technical feasibility, shared memory contract, sidecar architecture
- [Export & Steward Decisions](export-and-decisions-design.md) — the decision layer, record schema, and the three export surfaces
- [Live ↔ Replay Reconciliation](live-replay-reconciliation-design.md) — persisting live capture and linking it to a replay for post-session review

**Question:** Given that finished sessions are already parsed from log files and synced to the DB, what should live mode actually *be* to be maximally valuable to a steward during a race?

---

## Table of Contents

- [The Reframe](#the-reframe)
- [Design Principles](#design-principles)
- [Tier 1 — The Core Loop](#tier-1--the-core-loop)
  - [Incident Triage Queue](#incident-triage-queue)
  - [The Incident Dossier](#the-incident-dossier)
  - [Camera Dispatch](#camera-dispatch)
  - [Decision Log](#decision-log)
- [The Telemetry Question](#the-telemetry-question)
- [Tier 2 — Live-Only Intelligence](#tier-2--live-only-intelligence)
- [Tier 3 — Race Control Awareness](#tier-3--race-control-awareness)
- [What Not To Build](#what-not-to-build)
- [Layout](#layout)
- [Relationship to Existing UI](#relationship-to-existing-ui)
- [Gating](#gating)
- [Scope Recommendation](#scope-recommendation)
- [Field Reference](#field-reference)

---

## The Reframe

The existing replay UI answers **"what happened?"** Live mode must answer **"what needs my attention right now, and what do I do about it?"**

These are different jobs. The first is analysis. The second is decision support under time pressure. Building live mode as a variant of the replay views would waste most of its value.

| | **Post-session (exists today)** | **Live mode (proposed)** |
| --- | --- | --- |
| Mental model | Timeline you browse | **Queue you clear** |
| State | Read-only record | **Stateful** — decisions are recorded |
| Dataset | Complete | Append-only, permanently incomplete |
| Organizing unit | Session | **Incident** |
| Context | Unhurried, single steward | Time pressure, glanceable, second monitor |
| Output | Understanding | **Decisions** |

The DB sync already owns the retrospective job and does it well. **Live mode should not compete with it.**

---

## Design Principles

1. **Incident-centric, not session-centric.** The unit of work is one incident needing a call.
2. **Every view answers "so what?"** If a panel does not change what the steward does in the next 30 seconds, it belongs in the post-session view.
3. **Decisions are the output.** A live tool that only displays information is a scoreboard. The value is in capturing calls.
4. **Degrade honestly.** Live data is incomplete by nature. Never imply certainty the data does not support.
5. **Assume a second monitor.** Dense, dark, alert-driven, readable at a glance while watching the race.

---

## Tier 1 — The Core Loop

This is the MVP. It is buildable on scoring data plus the results stream alone, with no dependency on the open telemetry question below.

### Incident Triage Queue

Not a timeline — a **work queue**.

- Each incident carries state: `NEW → FLAGGED → DECIDED`, plus `DEFERRED` to post-session review
- Priority-sorted by severity, not strictly chronological
- Unreviewed count badge, always visible
- Filter by class, driver, incident type, and decision state

**`FLAGGED` — park it and keep watching — is expected to be the most common live action, not `DECIDED`.** Under time pressure the honest call is usually "that looked bad, come back to it."

That gives the queue a second responsibility beyond surfacing new incidents: **making sure nothing parked is forgotten by the checkered flag.** An end-of-session prompt listing unresolved flags is a small feature with outsized value.

See [Export & Steward Decisions](export-and-decisions-design.md) for the full lifecycle.

The contact magnitude already present in the log line is a usable severity proxy from day one:

```
Bradley Drake(0) reported contact (2003.53) with Immovable
                                    ^^^^^^^ severity signal
```

### The Incident Dossier

**This is the feature that justifies the whole project.**

> ✅ **Built and verified live 2026-08-02.** The dossier renders derived evidence
> and both cars' throttle/brake/speed traces from a captured window. Two
> deliberate departures from the table below, both forced by what the data
> actually supports:
>
> - **No corner names.** LMU exposes none, so inventing "T4" would be a lie.
>   The dossier reports sector plus distance around the lap.
> - **No "under yellow at the time".** `mSectorFlag` proved not to be a
>   yellow-flag boolean — see the Tier 3 warning.
>
> Durations that ran to the edge of the capture window render as a floor
> (`6.0s+`) rather than an exact figure.

The raw incident string above is nearly unadjudicable on its own. But because the sidecar keeps a rolling buffer of scoring data, the moment an `<Incident>` line arrives we can snapshot the surrounding seconds and turn that prose into a structured, adjudicable record:

| Evidence | Source field(s) |
| --- | --- |
| Both cars involved | Parsed from incident string + `mSteamID` |
| Closing speed and who was ahead | `mPos`, `mLocalVel`, `mLapDist` |
| On track or off | `mPathLateral` vs `mTrackEdge` |
| Same class or traffic incident | `mVehicleClass` |
| Blue flag being shown | `mFlag == 6` (**confirmed** in a live multiclass field) |
| Spin vs. clean contact | `mLocalRot`, `mLocalRotAccel` |
| Human or AI | `mControl` (0 = local, 1 = AI, 2 = remote) |
| Corner / sector | `mLapDist`, `mSector` |
| Under yellow at the time | `mUnderYellow`, `mYellowFlagState` |

**Log files structurally cannot provide this.** By the time the XML is written, the surrounding context is gone. This is the single strongest argument for live capture.

### Camera Dispatch

One click focuses the spectator camera on the car in question. `/rest/watch/focus` works in a live session, so this reuses the existing focus wiring from the replay view (see `PUT_REPLAY_COMMAND_FOCUS_CAR`).

Note that the *seek* half of the existing jump action (`PUT_REPLAY_COMMAND_TIME`) is meaningless live and must be dropped. `ReplayJumpBar` currently mixes playback transport with camera control; the camera half works live and the transport half does not, so that component needs splitting.

### Decision Log

Every call recorded with driver, incident reference, decision, reasoning, and the steward who made it.

**The app proposes, the steward disposes.** The dossier's classification never assigns a penalty on its own — its job is to pre-fill the call so the steward confirms in one click. This matters for adoption: leagues own their rulebooks, and under appeal "a named steward decided, here is the reasoning" is defensible where "the app decided" is not.

**Speed is the design constraint.** If assigning a penalty takes more than a couple of seconds, stewards will abandon the tool and go back to a notepad. That means preset tariff buttons from the league's configured list, keyboard shortcuts, one-key park, and reasoning optional at time of call — prompted for later during review.

**Decisions are revisable.** A call made live on partial evidence may change once the full replay is available, so a decision is a record with revisions rather than a row that gets overwritten.

This is what makes live mode a **tool** rather than a viewer — its output becomes durable and feeds the permanent record. Full lifecycle, record schema, tariff configuration, and export surfaces are in [Export & Steward Decisions](export-and-decisions-design.md).

**Live mode does not own export.** A session export requires a completed session — final standings, finishing statuses, the full incident list — none of which exist mid-race. Live mode can emit a **provisional decision board** (the running list of calls, for a stream overlay or Discord post), but the authoritative session export belongs to the replay view.

---

## The Telemetry Question

`SharedMemoryTelemetryData` exposes:

```cpp
uint8_t   activeVehicles;
TelemInfoV01 telemInfo[104];
```

and `TelemInfoV01` contains `mUnfilteredThrottle`, `mUnfilteredBrake`, and `mUnfilteredSteering` at ~50Hz.

**If those slots are genuinely populated for all cars in multiplayer**, the dossier can carry throttle and brake traces for both drivers covering the seconds before contact. That is literally the evidence real stewards argue about — *"did he brake-check me?"* becomes a brake trace rather than a shouting match.

> **✅ VERIFIED 2026-07-28 — remote telemetry is fully populated.** In a public online practice session at Laguna Seca, every vehicle reporting `mControl == 2` carried live, changing throttle, brake, and steering values, sampled repeatedly over several minutes.
>
> **This capability is real.** Tier 1 should be resequenced to include throttle/brake traces in the dossier — it is the strongest evidence the tool can offer, and it turns the most-argued question in stewarding into a measurement.

**Capture shape: rolling buffer, snapshot on incident — never continuous recording.**

At 50Hz × 3 channels × ~30 cars, continuous capture is a firehose that would be stored forever and read almost never. Instead keep a rolling in-memory window (~30 seconds is roughly 1–2 MB resident) and persist only the ~10 seconds surrounding each `<Incident>`.

> ⚠️ **A trace alone can mislead.** A brake spike is innocent if there is a corner there. Always capture `mPos`, `mLocalVel`, and `mLapDist` from the same window and present them together — the trace is only evidence when read with position context. Those fields are needed for the dossier regardless.

What it answers: brake-checking (a defender's brake spike with no corner), divebombs (attacker braking late or not at all), blue-flag compliance (did the lapped car actually lift), and avoidability (the gap between contact and any input change).

---

## Tier 2 — Live-Only Intelligence

Capabilities that are worthless post-session because the moment to act has passed.

**Track-limit strike tracking.**
`mTrackLimitsStepsPerPenalty` and `mTrackLimitsStepsPerPoint` give the thresholds; `mCountLapFlag` gives invalidations. Display *"Driver X: 3 of 4 strikes."* Post-session this is trivia. Live it is actionable.

**Penalty state.**
`mNumPenalties` is outstanding penalties. Who is carrying one into the final laps, who has not served. Race control tracks this constantly and log files never surface it in time.

**Driver watchlist.**
Running per-driver tallies keyed on `mSteamID` (not `mID` — slot IDs are reused after a driver leaves). Repeat offenders surface *during* the race, while action is still possible.

**Pressure monitor.**
The genuinely novel capability. A steward cannot watch 40 cars in a 24-hour race. Rank current battles by incident likelihood — proximity, closing speed, class delta, recent contact history — and surface *"watch these three."* This is the shift from reactive to proactive stewarding, and it is only possible with live positional data.

**Detection the game does not report.**
Solo spins and off-tracks without contact never generate an `<Incident>` line. Yaw rate (`mLocalRot`) combined with `mPathLateral` vs `mTrackEdge` catches them.

**Driver detail view.**
The queue and dossier are *incident-scoped*. This view is **escalation-scoped**, and exists to answer one question: *"is this a pattern?"* — asked before deciding on a driver's fifth incident rather than their first.

Reached from the watchlist, from any driver chip in the queue, or by search when a league receives a complaint about a specific car mid-race.

Contents:

- Session-cumulative incidents, with outcomes
- Track-limit strikes against **this session's** threshold (see the per-session warning below)
- Outstanding penalties (`mNumPenalties`)
- Prior decisions on this driver and the reasoning recorded for each
- Current position, class, gap, and whether they are in the pits
- Penalty assignment, including the accumulation case — see [Export & Steward Decisions](export-and-decisions-design.md)

It must **not** re-render the incident dossier. That is one click away, and duplicating it makes both screens worse.

> ⚠️ `mTrackLimitsStepsPerPenalty` is **per session**, not a constant — observed as `40` at Daytona and `24` at Laguna Seca. Read it live; a hardcoded denominator misreports every driver's standing.

**A small proximity map — not a full field map.**
On the driver view, a compact map showing the focused driver plus nearby cars answers *"are they in traffic, and who is around them?"* That is cheap and directly serves the escalation question. It is deliberately **not** the full-field live map, which belongs in Tier 3 and is discussed there.

---

## Tier 3 — Race Control Awareness

**Live field map.**
A real-time map showing all cars by class with incident flares, distinct from the existing aggregate heatmap. The `TrackMap` component and track point data already exist, so the rendering substrate is in place.

> **Rank this below the rest of Tier 3.** It is lower value than it first appears: the steward already has LMU running with a real spectator camera, and for *judging* an incident a 2D map is strictly worse than the 3D view — which is one click away via camera focus. What the map genuinely adds is **overview** — the whole field at once, which no single camera can give. That is real, but secondary to triage, and it competes with the queue for attention.
>
> The escalation-scoped proximity map on the driver detail view (Tier 2) delivers most of the practical benefit at a fraction of the cost. Build that first and see whether the full-field version is still wanted.

**Session control panel.**
Surface `mSessionTimeRemaining` as a real countdown.

> 🛑 **`mSectorFlag[3]` does not mean what the header says.** It was read live at
> Daytona through an entirely green practice session and held a constant `11` in
> all three sectors. It is not a local-yellow boolean. The capture layer carries
> it through raw and the dossier does not render it; the "local yellow in
> sector" evidence row has been removed rather than left showing a value that
> would be wrong. Settle what it means in a session with a genuine local yellow
> before designing anything on it.
>
> This is the second instance of the general rule below, and it is worth
> stating plainly: **every engine-level field in `InternalsPlugin.hpp` is a
> claim to be tested, not a fact.**

> ⚠️ **Do not build on full-course yellow.** `mGamePhase == 6` (FCY / safety car) and `mYellowFlagState` are defined in `InternalsPlugin.hpp`, but that header is the **gMotor engine API inherited from rFactor 2** — a field existing there says nothing about whether LMU populates it.
>
> In practice LMU's FCY is vestigial: players report it as a text message with no speed limit, no enforcement, and no penalty for overtaking, apparently leftover rF2 code left enabled on isolated tracks. Safety cars remain absent and debated.
>
> **Read both fields anyway** — they cost nothing extra, arriving in the same struct copy, and would light up automatically if Studio 397 implements FCY properly. Just don't design UI modes around them until that happens.
>
> This is the worked example of a general rule for this whole investigation: **the SDK header describes the engine, not the game.** Verify any engine-level field against actual LMU behavior before designing a feature on it.

**Blue flags — the LMU-specific win.**
Blue-flag disputes are among the most contested topics in endurance sim racing, and they arise in **two** situations, both confirmed present in LMU:

- **Multiclass traffic** — a Hypercar catching an LMP2 or LMGT3
- **Same-class lapping** — a leader catching a lapped car in his own class

Both are stewardable and both are argued about. Combined with relative positions over time, the flag state measures *how long* blue has been shown and whether the car yielded — turning a recurring argument into a measurement.

> ✅ **Encoding confirmed 2026-07-28.** Both `0` (green) and `6` (blue) were observed in a live multiclass online session, matching the header's documented values. Still drive the UI from a named constant rather than a literal `6`, so a future LMU change is a one-line fix.

This converts a recurring argument into a measurement, and it is specific to the series LMU simulates.

---

## What Not To Build

These are inherently retrospective and already well served after sync. Rebuilding them live means competing with your own post-session views:

- Lap-by-lap performance breakdowns
- The aggregate incident heatmap (an end-of-session artifact by nature)
- Driver Analysis view
- Session chat log review

---

## Layout

Assume a second monitor running alongside the game.

```
┌──────────────┬────────────────────────┬──────────────┐
│  TRIAGE      │  INCIDENT DOSSIER      │  FIELD STATE │
│  QUEUE       │                        │              │
│              │  Cars, closing speed,  │  Live map    │
│  ● New (3)   │  on/off track, class,  │  Flag state  │
│  ○ Review    │  blue flag, traces     │  Watchlist   │
│  ✓ Decided   │                        │  Strikes     │
│              │  [Focus] [Penalty]     │  Pressure    │
│              │  [No Action] [Note]    │              │
└──────────────┴────────────────────────┴──────────────┘
              Local yellow state surfaces in Field State
```

Dense, dark, alert-driven. Readable at a glance while watching the race, not while studying the screen.

---

## Relationship to Existing UI

Live mode is a **new view**, not a mode of the replay view. It gets its own route (`/live`) and its own component tree.

It does, however, reuse the presentational layer where the data shapes align — `ReplayMasterIncidentTimeline`, `ReplayDriverStandings`, `CarClassBadge`, `IncidentSeverityLabels`, `StatDisplay`, and `TrackMap` all take plain data props and carry over unchanged.

The capability seam already exists: Quick View mode in `src/renderer/utils/replayViewState.ts` is a degraded-capability profile that hides playback-dependent panels. Live is a third profile in that same system, which means the boolean `isQuickViewModeActive` should become a mode with derived capabilities (`canSeek`, `canControlCamera`, `canFocusCar`, `hasCompleteDataset`, `isAppendOnly`).

At session end, live mode hands off — but this is a **promotion step**, not just a data sync. `SME_END_SESSION` fires, LMU writes the XML, the existing sync ingests it, live decisions are promoted from provisional to reviewable and linked to the now-available `replay_hash`, and unresolved flags surface as a review worklist.

**The post-session replay view then becomes the review surface for calls made live.** The two halves of the product close the loop on each other: live mode captures decisions under pressure, and the replay view is where they get confirmed or revised with full evidence.

---

## Gating

Live stewarding ships behind the **experimental feature flag**, and live capture is a **user setting that defaults to off**.

Most users want the replay browser and the driver dashboard, and have no interest in a stewarding tool. Capture also takes a machine-wide lock shared with other consumers of LMU's shared memory, so not attaching at all is the strongest guarantee of not disturbing wheel LED software or motion rigs.

Capture is all-or-nothing per install rather than armed per session: the incident worth reviewing is the one nobody expected, and live capture exists to hold the seconds *before* it. See [Settings and Gating](live-replay-reconciliation-design.md#settings-and-gating).

---

## Scope Recommendation

**MVP = Tier 1 only.** Triage queue, dossier, camera dispatch, decision log.

That alone is a stewarding tool nobody in the LMU space currently offers, and it depends only on scoring data plus the results stream — no dependency on the unresolved telemetry question.

**Biggest scope multiplier: multi-steward panels.** Most leagues run stewarding as a panel rather than a single person, so this will be requested. Defer the networking entirely, but **design the decision record with an author field and a stable incident ID from day one** so it can be added later without a data migration.

Suggested order:

0. **Session export, then the decision layer, then cross-session export** — all built against the existing replay view and Dashboard, before any live work; see [Export & Steward Decisions](export-and-decisions-design.md) → Sequencing
1. Tier 1 core loop (scoring + results stream only)
2. Phase 0 telemetry verification → resequence if traces are available
3. Tier 2 intelligence (watchlist, strikes, penalty state)
4. Tier 3 awareness (live map, local yellows, blue flag)
5. Multi-steward, if demand justifies it

Step 0 is deliberately first. It delivers value on the product that already has users, validates the record schema against real league workflow while it is still cheap to change, and means live mode inherits a proven decision model instead of inventing one — which reduces Tier 1's scope rather than adding to it.

---

## Field Reference

All fields below were verified present in the shipped SDK header on 2026-07-28. See the companion document's provenance section.

**`ScoringInfoV01`** — session-level
`mSectorFlag[3]` (local yellows) · `mSessionTimeRemaining` · `mTrackLimitsStepsPerPenalty` · `mTrackLimitsStepsPerPoint` · `mResultsStream` · weather and track state fields · `mGamePhase` and `mYellowFlagState` (**engine-defined but not meaningfully implemented in LMU — see the Tier 3 warning**)

**`VehicleScoringInfoV01`** — per car, ~5Hz
`mPos` · `mLocalVel` · `mLocalAccel` · `mLocalRot` · `mLocalRotAccel` · `mLapDist` · `mPathLateral` · `mTrackEdge` · `mVehicleClass` · `mFlag` (blue-flag indicator — **encoding unverified**) · `mUnderYellow` · `mCountLapFlag` · `mNumPenalties` · `mPitState` · `mInPits` · `mFinishStatus` · `mControl` · `mSteamID` · `mPlace` · `mSector`

**`TelemInfoV01`** — per car, ~50Hz, **population in multiplayer unverified**
`mUnfilteredThrottle` · `mUnfilteredBrake` · `mUnfilteredSteering` · `mFilteredThrottle` · `mFilteredBrake` · `mElapsedTime` · `mLapNumber`
