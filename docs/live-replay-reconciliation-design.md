# Live ↔ Replay Reconciliation — Design

**Status:** Design settled — no implementation started
**Date:** 2026-08-03
**Companion documents:**
- [Live Capture Investigation](live-capture-investigation.md) — the shared memory contract and what live capture collects
- [Live Mode — Product Design](live-mode-product-design.md) — what live mode is
- [Export & Steward Decisions](export-and-decisions-design.md) — the decision layer and export surfaces

**Question:** Live capture now produces incidents, evidence and decisions that exist nowhere else. Where does that data live after the session ends, and how does a steward review it later?

---

## Table of Contents

- [Summary](#summary)
- [Why This Is Not a Choice Between Two Options](#why-this-is-not-a-choice-between-two-options)
- [What Has To Be Persisted](#what-has-to-be-persisted)
- [Identifying a Live Session](#identifying-a-live-session)
- [Matching a Live Session to a Replay](#matching-a-live-session-to-a-replay)
- [Reconciling Incidents](#reconciling-incidents)
- [The Time Base Problem](#the-time-base-problem)
- [The Review Surface](#the-review-surface)
- [The Live Sessions List](#the-live-sessions-list)
- [Storage and Volume](#storage-and-volume)
- [Retention and Deletion](#retention-and-deletion)
- [Settings and Gating](#settings-and-gating)
- [Carrying Live Data in a Replay Export](#carrying-live-data-in-a-replay-export)
- [Sweeping Expired Sessions](#sweeping-expired-sessions)
- [Sequencing](#sequencing)
- [Resolved Decisions](#resolved-decisions)

---

## Summary

The proposal is **link live capture to the replay**, and treat a browsable list of live sessions as a fallback rather than a second review surface.

Three points drive this:

1. **A persisted live-session record is required either way.** There is nothing to link until live capture writes something durable, and today it writes almost nothing — decisions persist, but incidents, evidence and captured traces are held in memory in `live-capture.ts` and die with the process.
2. **The replay view is already the review surface.** Both companion documents say so, and it is where the actual footage is. Reviewing live evidence anywhere else means reading a brake trace with no way to watch what happened.
3. **A large share of live sessions will never link**, because LMU does not always keep a replay. Those sessions still hold real evidence, so they need somewhere to live — but that somewhere should be a modest list, not a parallel review UI.

The payoff, stated plainly: **open a replay, see the incidents the game reported, and for the ones captured live, see closing speeds, on/off-track, blue-flag duration and both drivers' throttle and brake traces — then seek the footage to that moment and make the call.** Nothing else in the LMU space does this, and neither half can do it alone: the replay has the footage but no telemetry, and live capture has the telemetry but no footage.

---

## Why This Is Not a Choice Between Two Options

The two options in the question are sequential, not alternative.

| | Persist live sessions | Link to a replay |
| --- | --- | --- |
| Required for the other? | Yes — nothing to link without it | No |
| Delivers value alone? | Some: the record survives | The whole feature |
| Effort | Storage + capture changes | Matching + merge + UI |

Linking is the feature. Persistence is its precondition. The only real design choice is **how much UI the unlinked case deserves**, and the answer should be "as little as possible" — see [The Live Sessions List](#the-live-sessions-list).

---

## What Has To Be Persisted

Today, at session end, all of this is lost:

| Data | Where it lives now | Rebuildable later? |
| --- | --- | --- |
| Steward decisions | `steward_decisions` table ✅ | n/a |
| Parsed incidents | Memory in `live-capture.ts` | Yes, from the session XML |
| Derived evidence | Memory | **No** |
| Context windows (traces) | Memory | **No** |
| Standings / final field | Memory | Yes, from the session XML |
| Session status | Memory | Yes |

**Only two rows matter: evidence and context windows.** Everything else the post-session XML already carries, and the XML is authoritative. So the live session record exists to preserve *the part logs structurally cannot hold* — which is the same argument that justified live capture in the first place.

> ⚠️ **Write incrementally, not at session end.** A 24-hour race that crashes at hour 23 must not lose 23 hours of evidence, and `SME_END_SESSION` is not guaranteed to fire — the process can be killed, the game can crash, the user can alt-F4. Incidents and their contexts should be appended as they arrive, exactly as decisions already are.

---

## Identifying a Live Session

A live session needs a key that is stable **across a sidecar restart mid-session**, because the supervisor restarts the sidecar on exit and a new process must keep appending to the same session rather than starting a new one.

Track name and session type are not enough: a race weekend has practice, qualifying and a race at one track, and a restarted race produces two distinct sessions of the same type.

Proposed key components:

- `mTrackName`
- `mSession` (LMU's own session enum, which separates practice 1-4, qualifying 5-8, race 10-13)
- **Session start, derived as `now - mCurrentET`**, quantised to ~30 seconds

That last one is the useful trick. `mCurrentET` is the session's own elapsed time, so `now - mCurrentET` reconstructs the session's start instant from any point during it — including from a sidecar that attached ten minutes late.

> 🛑 **Quantising does not absorb jitter — it relocates the discontinuity.** This
> claim was wrong in an earlier draft and cost a split session. Rounding to a
> 30s bucket moves the boundary rather than removing it, so a session whose
> reconstructed start happens to sit near one flips between two adjacent buckets
> on sub-millisecond noise. Seen live: two Laguna Seca rows exactly one quantum
> apart, one holding 316 incidents and the other none.
>
> Identity therefore has two parts, and both are needed:
>
> 1. **A session in progress keeps its key outright** rather than re-deriving it
>    each tick. The reconstructed start drifts — sim and wall clocks diverge, and
>    a pause stops one but not the other — so re-deriving would eventually
>    disagree with itself and split a long race. A genuine restart is detected by
>    **the session clock going backwards**, which is unambiguous and immune to
>    that drift.
> 2. **Rejoining prefers a session already on disk** (`resolveLiveSessionKey`),
>    matching on track, session enum, and a start within one quantum. A new key
>    is minted only when nothing nearby matches. The tolerance is a full quantum
>    precisely so that any start which would round into a neighbouring bucket is
>    recognised instead.

This mirrors the existing career session key, which is derived from session content rather than file name specifically so that "restarted races differ in session start time and so remain distinct" (see `CareerSessionRecord` in `types.ts`).

> ✅ **Implemented** as `deriveLiveSessionKey` in `src/main/api/live-session-store.ts`,
> quantised by `LIVE_SESSION_START_QUANTUM_MS` (30s). The sidecar had to be
> extended to emit `session` (raw `mSession`) and `currentEt`, which its status
> line did not carry — it published only a coarse `PRACTICE|QUALIFY|RACE` string
> and no elapsed time. Verified live at Laguna Seca: killing the sidecar
> mid-session respawned it and it re-derived the same key, leaving one session
> row rather than two.
>
> ⚠️ **A context must be matched to its incident on the generation-qualified id,
> not the bare `seq`.** The sidecar restarts `seq` at 1 with each process while
> the incident queue survives a restart, so a bare-`seq` match silently attaches
> the new process's traces to the previous process's incidents. Observed live
> before the fix: after one restart every context landed on an incident ~30s
> earlier, and the incidents the traces actually belonged to reported none.
> Regression test: "should not attach a context to an incident from an earlier
> sidecar generation" in `live-capture.test.ts`.

---

## Matching a Live Session to a Replay

**Do not write a second matcher.** The application already solves this exact problem: pairing a `.Vcr` with a result log by roster overlap, with a ranked candidate list, a confidence score, a floor and an ambiguity margin. See `scoreLogCandidates` and `validateImportPair` in `src/main/api/replay-import-match.ts`, with `DEFAULT_CONFIDENCE_FLOOR = 0.5` and `DEFAULT_CONFIDENCE_MARGIN = 0.1`.

The signals available for live↔replay matching are the same shape and slightly better:

| Signal | Live capture | Replay |
| --- | --- | --- |
| Driver roster | `mDriverName` + `mSteamID` per slot | `logData.Driver` |
| Track | `mTrackName` | `metadata.sceneDesc` |
| Session type | `mSession` | `metadata.session` |
| Session time | derived start instant | `timestamp` |
| Incident set | parsed live | parsed from XML |

The incident set is a signal the import matcher does not have, and it is a strong one: two independent captures of the same race produce the same `<Incident>` strings at the same `et` values. **Roster overlap should remain the primary score**, with incident agreement as a confirming signal, because a session where nobody crashed has no incidents to compare.

> 🛑 **Never auto-link below the confidence floor.** A wrong link attaches penalties and evidence to the wrong race — it puts a driver's name against an incident they were not in, in an export a league may publish. Below the floor, or within the ambiguity margin of a second candidate, the link must be proposed and confirmed by a human, exactly as replay import does. Silence is better than a confident mistake here.

> ✅ **Implemented** as `matchLiveSession` in `src/main/api/live-replay-match.ts`.
> The ranking itself was **extracted rather than rewritten**: `rankRosterCandidates`
> in `replay-import-match.ts` is now generic over the candidate and is the one
> place the floor, the margin and the minimum roster size are applied.
> `scoreLogCandidates` is a thin adapter over it, so import and live↔replay
> cannot drift apart on what "confident" means.
>
> **Nothing is ever linked automatically, at any confidence.** A confident match
> becomes a *proposal* on the session row and the list shows "Replay found"
> until a human confirms it. The scoring differs from import in exactly one
> place: import accepts a lone candidate unscored, because the user handed over
> both files and asserted they belong together. Here the candidate set is one we
> assembled, so `acceptSoleCandidate: false` — one replay at the right track on
> the right day is a coincidence, not a claim.
>
> Candidates come from the replay cache **and** the imported store, pre-filtered
> by session type, track alias and a ±36h window on the replay timestamp. The
> window bounds the search rather than discriminating within it; the roster does
> the discriminating.
>
> ⚠️ **The offline AI grid makes roster overlap alone useless.** Measured against
> a real store: two Laguna Seca practice sessions three hours apart, both with
> the same 38-car AI field, scored a roster overlap of exactly **1.00 against
> both replays**. Every offline quick race at one track looks like this. Incident
> agreement is what separates them — it read 1.00 for the right replay and 0.17
> for the wrong one — so it is consulted in exactly one place: reordering the
> group of candidates the roster scored within the ambiguity margin of each
> other. It needs at least 4 captured incidents and a 0.3 lead to be treated as
> decisive; below that the session stays ambiguous and a human picks.
>
> 🛑 **Read agreement off the whole tied group, never off the ranking's first
> place.** Candidates the roster scored identically come back in name order,
> which is arbitrary. An earlier version compared `candidates[0]` with
> `candidates[1]` and proposed the wrong replay for one of those two real Laguna
> Seca sessions. Regression test: "picks the best agreement in the tied group,
> not the roster's first place".
>
> ℹ️ **Driver names need the multiplayer discriminator stripped on the live
> side.** Shared memory carries `Steve Davis#1924`; the log's `<Driver><Name>`
> does not. Stripped in `liveSessionRoster` only, because that is the only side
> it appears on.
>
> **Considered and declined: timestamp proximity as a third signal.** In the
> real store the correct replay was within 2–8 seconds of the captured session's
> start every time, which would have resolved the one case that stayed ambiguous
> (a Daytona session with a single captured incident). It was left out because a
> replay timestamp is the .Vcr's creation time — reset by Windows on copy, and
> restamped from the log for an imported replay — so it is exactly the signal
> the import matcher exists because it could not trust. The ambiguous case shows
> the timestamps in the dialog and a human resolves it in one look.

### When there is no replay

Common, and not an error condition:

- LMU only writes a replay when replay saving is enabled
- Practice sessions are frequently not kept
- The user may have deleted it
- Replays are overwritten

An unlinked live session must remain fully usable as a record, and must never nag. If a replay appears later — imported from another PC, or synced after the fact — matching should re-run and link retroactively.

> ✅ **Implemented.** The match pass runs when the Captured Sessions list is
> opened, not on a timer and not at app start: it costs nothing for a user who
> never opens the view, and it is also what makes matching retroactive without
> any extra machinery — a replay synced or imported after the fact is simply a
> new candidate the next time the list is read. **This is step 7, delivered by
> the shape of step 4 rather than as separate work.**
>
> The pass is isolated: a results directory that cannot be read logs and is
> swallowed, because a proposal is a convenience and must not stop a steward
> seeing what was captured.
>
> **Unlinked gets no chip.** Linked and "Replay found" are marked; unlinked is
> not, because a replay is often simply not kept and marking that state would
> flag something the user cannot fix. Rejecting a proposal (`matchDismissedAt`)
> stops it being offered again, and unlinking dismisses too — otherwise the next
> pass immediately re-proposes the replay just rejected.

---

## Reconciling Incidents

Once linked, the same incident exists twice: once from the session XML, once from live capture. Rendering both would double every incident in the timeline and in the counts.

**The XML is authoritative; live capture is enrichment.** This is already stated in the capture document and it settles the merge:

- The replay view's incident list stays exactly as it is, built from the XML
- A live incident is matched onto a replay incident and **attaches** its evidence and context
- A live incident with no XML counterpart is *not* added to the list

Proposed merge key: **`et` within a small tolerance, plus at least one shared participant slot.** `et` alone is not safe — two incidents can share a timestamp in a large field — and participants alone are not safe either, since the same two drivers may collide more than once in a race.

> ⚠️ **The mirrored-collision fold changes the participant sets.** The sidecar folds LMU's two `<Incident>` records for one collision into a single incident with two parties, and the written XML contains both records separately. So one live incident may match *two* XML incidents. The merge must expect that and attach the same context to both, rather than assuming a one-to-one mapping.

> ✅ **Implemented** as `attachLiveEvidenceToEvents` in
> `src/renderer/utils/liveIncidentMerge.ts`, and the key is **stronger than the
> one proposed above**. Measuring against three real linked sessions changed it:
>
> **The live `raw` string is byte-identical to the XML `<Incident>` element.**
> Both come from the same place, so the incident text itself is available on
> both sides and matches exactly rather than fuzzily. Across the three sessions
> it matched **316/316, 801/801 and 1/1** live incidents — nothing unmatched.
>
> 🛑 **Text alone is not safe either, and this was measured, not guessed.** One
> real log repeats `Bradley Drake(0) reported contact (20.56) with Immovable`
> **seven times** across a session — et 20.0, 647.4, 727.1, 767.5, 778.6, 783.6
> — same driver, same wall, same impact force. Keying on text alone smears one
> incident's evidence across all seven. **43 distinct texts recur in that one
> log.**
>
> 🛑 **And `et` plus participants is not safe either.** A real multiplayer log
> holds three records at et 122.3 for `Gildas BEN(7) ... with Post`, identical
> but for the impact force. Same time, same driver, three separate incidents.
>
> So the key is **`et` within tolerance AND identical incident text**, with a
> second **mirror key** — same `et`, reversed participant pair — for the one case
> no text can match. Tolerance is 0.5s; the largest disagreement measured on a
> confirmed match was 0.1s, one scoring tick.
>
> ⚠️ **Mirrors are a multiplayer phenomenon, not a universal one.** The claim
> that one collision always produces two `<Incident>` records is **false for
> offline sessions**: across two captured Laguna Seca practice sessions with 122
> car-to-car contacts between them, **not one had a mirrored record**. The
> multiplayer fixture has them on every contact, at *exactly* the same `et`
> rather than the ~0.1s apart recorded earlier. The mirror path is therefore
> covered by unit tests built from the multiplayer format, because no offline
> capture can exercise it.
>
> ℹ️ **Unenriched XML rows are normal.** In one session 90 of 406 incidents
> carried no live evidence: 83 happened before capture attached (the session
> was already at et 292 when the sidecar arrived at et 1432), and most of the
> rest were a car scraping a barrier once a second. They render exactly as they
> did before live capture existed.

Live incidents that match nothing are worth keeping visible somewhere as a diagnostic — a persistent mismatch means either the merge key is wrong or the link is.

> ℹ️ **One exception to "the XML is authoritative": there may be no XML.** A
> replay with matched live data but no result log renders live incidents
> directly, with the view stating that it is a limited fallback. See
> [Resolved Decisions](#resolved-decisions).

---

## The Time Base Problem

This is the detail most likely to make the feature subtly wrong.

Live incident times come from `mCurrentET`. The XML's `et=` attribute is the same clock, so in principle they align exactly — which is what makes "seek the replay to this incident" work at all, since `PUT_REPLAY_COMMAND_TIME` takes seconds.

But **the replay view does not display raw `et`.** It already normalises for partial replays — see `computeReplayTimeBaselineSeconds`, `computeFirstReplayEventEtSeconds`, `detectPartialReplayData` and `shouldNormalizeReplayTime` in `replayViewState.ts` — because a replay that started after the session was underway has its own zero point.

> ⚠️ **Live data must go through the same normalisation as the replay's own incidents, or every live-enriched incident will be offset by the replay's baseline** — and the offset will be zero in ordinary testing and non-zero exactly when someone is reviewing a partial replay of a race they joined late. Attach live context to the *already-normalised* incident rather than seeking on the raw live `et`.

> ✅ **Resolved by ordering rather than by conversion.** The merge runs *after*
> `buildReplayTimelineEvents`, on the finished events. Each event already
> carries both clocks — `etSeconds` is the log's raw value and `timestampLabel`
> and `jumpToSeconds` are the normalised ones — so the merge matches raw against
> raw, which is what both sides quote, and everything displayed or sought stays
> the event's own already-normalised value. Nothing converts a live `et`, which
> means nothing can convert one wrongly.

The captured context frames carry `t` relative to their own incident, so they need no normalisation themselves. Only the incident anchor does.

---

## The Review Surface

Nothing new gets built here — the replay view gains a section when live data is linked.

- **Incident timeline** — a marker on incidents that carry live evidence, so a steward can see at a glance which ones can be examined properly
- **The dossier**, reused as-is from live mode: evidence rows, per-car measurements, and the throttle/brake/speed traces
- **Seek to incident**, which already exists (`jumpToIncidentInReplay`), so the footage and the trace are on the same moment
- **Decide**, using the same decision layer — a decision made post-session is the same record, and revising a live call creates a revision rather than overwriting it

That last point is the loop closing exactly as the design intended: **live mode captures calls under time pressure; the replay view is where they are confirmed or revised with full evidence.** The revision history is what makes it defensible — *"we called it live, reviewed it after, and changed it for this reason."*

Decisions made post-session should be promoted from `provisional` to `final` on confirmation, and gain the `replayHash` that was null while live.

> ✅ **Implemented** as `ReplayIncidentDossier` in `src/renderer/components/Replay/`.
> The dossier itself is live mode's, reused unchanged; only the plumbing differs
> — the incident comes off disk rather than out of a 1Hz poll, and the decision
> it produces is `final` with the `replayHash` populated.
>
> 🛑 **The decision identity had to be fixed first, and it was genuinely broken.**
> A live call and the same call reviewed here would have produced *two*
> decisions rather than one with a revision history, which is precisely the
> thing that makes stewarding defensible. Both halves of the id were wrong:
>
> - The renderer built its own `track|type` session key, which matched **no
>   session on disk**. The real key now comes from capture via
>   `LiveSessionData.sessionKey`.
> - Decisions keyed on `live-{generation}-{seq}`, which is per app process and
>   **renumbers on every sidecar restart** — so a mid-session restart detached
>   every call already made. Incidents now carry `persistedId`, the
>   content-derived id they are stored under, and both views key on it.
>
> The single decision in the real store showed both faults at once:
> `id: "Daytona International Speedway Road Course|PRACTICE|live-1-33|slot-0"`.
> It was already unreconcilable, which is what made changing the scheme free.
>
> `buildStewardDecisionId` in `src/renderer/utils/` is now shared by both views
> so they cannot drift apart on it.
>
> ℹ️ **Traces load one at a time**, over `GET_LIVE_INCIDENT_CONTEXT`, keyed on
> the persisted incident id. They stay out of the per-replay payload because a
> window is ~100 KB and a race holds hundreds. The dossier deliberately shows
> **no loading state**: the derived evidence rides the incident row and is
> already in hand, so measurements render at once and the trace chart fills in
> underneath. A spinner over the panel would hide what a steward can already
> act on.
>
> ⚠️ **The dossier shows the replay's normalised time, not the capture's.** The
> built incident's labels are overwritten with the timeline event's, or a replay
> of a session joined late would put a different time on the dossier than on the
> incident it belongs to.

---

## The Live Sessions List

Deliberately minimal. Its job is to stop unlinked evidence being invisible, not to become a second dashboard.

**Should include:**
- Track, session type, date, driver count, incident count
- Link state: linked / unlinked / needs confirmation
- A way to confirm or correct a proposed link
- Delete, since this is user data that accumulates

**Should not include:**
- A parallel incident review UI
- Standings, lap analysis, or anything the replay view does better
- Anything that makes it a plausible place to "do the stewarding"

An unlinked session's incidents can still be inspected — the dossier is a component, not a page — but the moment a link exists, the replay view is the place.

The natural home is alongside the existing replay lists on the Dashboard rather than a new top-level route.

---

## Storage and Volume

Context windows are the only bulky part.

Measured from a real capture: a two-car contact window over `[-6s, +2s]` is roughly **60–80 KB of JSON**, at the sidecar's ~25Hz effective rate. A later Laguna Seca practice capture produced windows up to **~100 KB**, so treat the table below as a floor rather than an estimate.

Confirmed once persistence landed: the incident row and its trace differ by about **100×** — under 1 KB against ~100 KB — which is what justifies keeping traces in their own table.

| Session | Contact incidents | Approx. context storage |
| --- | ---: | ---: |
| Sprint race | ~20 | ~1.5 MB |
| 6-hour race | ~200 | ~15 MB |
| 24-hour race | ~800 | ~60 MB |

Tolerable, and already bounded by an existing decision: **only car-to-car contact gets a context window.** Track limits and solo incidents do not, which removes the highest-count categories.

If it needs shrinking later, the cheapest win by far is storing frames as positional arrays rather than objects with eighteen repeated keys — roughly a 3× reduction with no loss. Not worth doing pre-emptively.

Follow the established table pattern: queryable columns plus a payload blob, upsert never delete, in tables that survive a replay-cache wipe. Live sessions and their incidents are user data, not cache — the same argument that put `career_sessions` and `steward_decisions` in their own tables.


---

## Retention and Deletion

A user setting, phrased as one rule with one exception:

> **Delete captured live session data older than:** 7 / 30 / 90 days, or never.
> **Steward decisions are never deleted.**

Retention applies to the whole live session record — incidents, derived evidence and context windows — and **does not depend on whether the session is linked to a replay.**

> ✅ **Implemented** as `src/main/api/live-retention.ts`, with the setting
> `liveCaptureRetentionDays` (7 / 30 / 90 / `null`, defaulting to 30) beside
> Live Capture in User Settings — retention is the cost of having capture on, so
> it belongs next to the switch that turns it on.
>
> `retentionAnchor` is the later of `startedAt` and `link.linkedAt`, and never
> earlier than capture, so linking cannot extend a session's life indefinitely.
>
> ⚠️ **The retention setting is saved on its own, not through autosave.** Every
> other setting on that screen writes as you change it; this one can delete
> months of evidence, so a shortened window is held until the user has confirmed
> against a summary. Lengthening — and "never" — writes straight through,
> because it takes nothing away.
>
> The sweep runs once per process, behind the launch replay sync when there is
> going to be one and immediately when there is not. Hanging it off the sync
> alone would have meant an install with automatic sync turned off, or one still
> on its first run, never expiring anything at all.

Link state looks like a useful signal and is not. An unlinked session may link later when a replay is imported from another machine; and the user who does not keep replays is precisely the one for whom the live record is the *only* record of a race. Age is the honest axis.

### Why decisions are exempt

A decision is the output of the entire product. It is a few hundred bytes, it may be the subject of an appeal months after the session, and it cannot be reconstructed from anything.

This needs no special machinery, because **a decision already stands alone.** Session, driver, lap, elapsed time and classification are denormalised onto the record — done originally because live incident ids do not survive a sidecar restart, but it means a decision outliving its incident is an already-supported state rather than a new edge case.

What is lost when the session expires is the ability to re-examine the telemetry behind the call. The call, its reasoning and its revision history remain.

> ℹ️ **Expiry removes the link too.** A replay whose live data has aged out
> simply goes back to showing what the XML carries, which is what it showed
> before live capture existed. Nothing breaks; the enrichment is gone.

### Shortening the window is destructive and must be confirmed

Changing retention from 90 days to 7 can delete months of evidence on the next sweep, and a settings dropdown is not where a user expects to destroy data.

Shortening the window must open a confirmation dialog **summarising exactly what will be removed** before anything is deleted — session count, date range, and the tracks involved, so the user recognises what they are about to lose. Lengthening it needs no confirmation.

This follows the existing clear-storage dialog, which already warns specifically about imported replays rather than relying on a generic "cannot be undone".

### Clearing local storage

Clearing local storage removes live session data along with everything else, and **the dialog copy has to say so**.

> 🛑 **Steward decisions are the one thing clearing destroys that exists nowhere
> else and leaves nothing behind.** An imported replay's files remain on disk; a
> deleted decision is simply gone, along with its reasoning and revision history.
> Retention deliberately never touches decisions, which makes it all the more
> important that the one action which *does* delete them says so. The dialog
> should name decisions explicitly and state how many there are, in the same
> shape as the existing imported-replay warning.
>
> It cannot offer to export them first, because there is no bulk decisions
> export — decisions travel inside a *per-replay* session export. Until
> [Surface 2](export-and-decisions-design.md#surface-2--cross-session-decision-export)
> exists there is no practical escape hatch for a user with calls spread across
> forty replays, so **the warning is the only safeguard** and has to be blunt
> rather than reassuring.

---

## Settings and Gating

Live stewarding ships behind the **experimental feature flag**, alongside replay import/export in `EXPERIMENTAL_FEATURES` in `constants.ts`. That list is deliberately the only one — the settings card renders straight from it, so graduating the feature is deleting the entry and removing the gate.

Separately from the flag, capture is a user setting, because **most users want the replay browser and the driver dashboard and have no interest in live stewarding.**

These are two genuinely different switches and should not be collapsed into one:

| Switch | Controls | Default |
| --- | --- | --- |
| Experimental flag | Whether the feature exists in the UI at all | Off |
| Live capture | Whether the sidecar attaches and records | Off |
| Retention | How long recordings are kept | 30 days |

**Capture should default to off**, and not only to respect users who do not want it:

- The sidecar takes a **machine-wide lock shared with every other consumer of LMU's shared memory**, including wheel LED software and motion rigs. Not attaching at all is the strongest possible guarantee of not disturbing them.
- It costs CPU continuously during a session, for data most users will never open.

> ✅ **Implemented.** `configureLiveCapture()` in `main.ts` starts the sidecar
> only when `experimentalFeaturesEnabled && liveCaptureEnabled && !devModeEnabled`,
> and stops it otherwise. It runs at boot and after every `POST_USER_SETTINGS`,
> alongside `configureReplayAutoSync()`, so either switch takes effect without an
> app restart. Transitions are logged (`live-capture: enabled/disabled by
> settings`), guarded by a flag so the per-write calls do not spam the log.
>
> The capture setting is `liveCaptureEnabled` in `DEFAULT_USER_SETTINGS`. The
> renderer's `ApiContext` exposes `liveCaptureEnabled` as the AND of both flags;
> the navbar live indicator is hidden when it is false, because with no sidecar
> the indicator can never leave "unavailable" and reads as breakage.
>
> Verified live: toggling capture on → off → on produced matching log
> transitions with the sidecar's process start time tracking the last enable, no
> restart involved.

### Automatic, not manually armed

Capture should be **all-or-nothing per install, not armed per session.**

A "start recording" button seems more respectful of the user's resources, but it fails at exactly the wrong moment: the incident worth reviewing is the one nobody expected, and a steward who forgot to arm the recording has no evidence of it. The whole premise of live capture is holding the seconds *before* something happened, which is unavailable to anyone who starts recording afterwards.

Off is a real choice. Armed-per-session is a trap.

---

## Carrying Live Data in a Replay Export

A replay archive already carries a manifest (`EXPORT_MANIFEST_NAME` in `replay-export.ts`) so the receiving install can skip pairing entirely. Live session data belongs in that archive for the same reason: **a hand-off should arrive with its evidence.**

Today, exporting a replay to another steward hands over the footage and the log but silently drops the closing speeds, the traces and the on/off-track findings — which is most of what makes the incident adjudicable. The receiving install would show a strictly worse view of the same race.

Size is a non-issue: tens of MB of context alongside a `.Vcr` measured in gigabytes.

> ⚠️ **Traces are more sensitive than the rest of an export.** A session export
> already carries driver names and Steam IDs, which the export document flags.
> Context windows go further: they are per-driver throttle, brake and steering
> inputs. That is telemetry a driver may not expect to be redistributed by a
> third party. Including it should be a visible, opt-in choice at export time
> rather than a silent default, and the archive should record that the choice
> was made.

> ✅ **Implemented** as `src/main/api/live-export.ts`, writing
> `lmu-steward-live.json` beside the replay it belongs to — at the archive root
> for a single export, inside the session directory for a weekend.
>
> **The sensitivity line is drawn between evidence and traces.** Derived
> evidence — closing speeds, off-track, blue-flag duration — always travels: it
> is a summary rather than a recording, and it is most of what makes an incident
> adjudicable on the receiving side. Trace windows are opt-in, default off,
> behind a dialog that says plainly what they are. The manifest records
> `includesLiveTelemetry` either way, so the archive states which way the choice
> went rather than leaving the receiving steward to infer it from absence.
>
> 🛑 **The exporting machine's link is stripped from the payload.** It names a
> replay hash that means nothing on the receiving side; carrying it would
> produce a link pointing at nothing, which is worse than no link because it
> looks like one. The importing install writes its own link instead, recorded as
> `manual` with a null confidence — nothing was scored against a roster here,
> and inventing a confidence would misrepresent where the pairing came from.
> The archive sitting beside the replay *is* the assertion, which is the same
> reasoning that lets a manifest skip pairing entirely.
>
> ⚠️ **A session already on disk is left alone on import.** Re-importing the
> same hand-off must not resurrect evidence the user has since deleted, nor
> overwrite a link they corrected by hand.
>
> The payload's bytes are counted before the free-space check. Traces are
> nothing beside a `.Vcr`, but they are not nothing beside a nearly-full disk.

---

## Sweeping Expired Sessions

Runs **on app start, after the replay log sync completes.**

Expiry is housekeeping, not a mission-critical task. It has no UI, no progress bar and nothing waiting on it, so it must not compete with or delay the work the user actually opened the app for.

Ordering matters for a second reason beyond politeness: `better-sqlite3` is synchronous, so a sweep interleaved with sync would contend for the same connection during the one phase where responsiveness is most visible. Running strictly after sync avoids that without needing any coordination.

Two rules follow from it being non-critical:

- **Silent.** No dialog, no toast, no count in the UI. A log line is worth writing for support, and nothing more.
- **Isolated.** A sweep that throws must not break app start. It is the least important thing happening at that moment and should fail as quietly as it runs.

The sweep also runs when the retention window is shortened, since that is the case where the user has explicitly asked for data to go now — and it is already gated behind the confirmation dialog described above.

> ⚠️ **An install that never restarts never sweeps.** Accepted. The alternative
> is a background timer that exists solely to delete things, which is a poor
> trade for a task nobody is waiting on, and the growth rate for a machine left
> running is the same as for one that is not.

---

---

## Sequencing

| Step | What | Notes |
| --- | --- | --- |
| ~~**1**~~ | ~~Persist live sessions and incidents incrementally~~ | **Done.** `live_sessions` + `live_incidents`, written per record as they arrive |
| ~~**2**~~ | ~~Persist evidence and context windows~~ | **Done.** Evidence rides the incident row; traces are in `live_incident_contexts` |
| ~~**3**~~ | ~~Session identity + a live sessions list~~ | **Done.** Captured Sessions on the Dashboard, with delete. Link state deferred to step 4 |
| ~~**4**~~ | ~~Matching, with proposed links confirmed by a human~~ | **Done.** `live-replay-match.ts`, over the now-generic `rankRosterCandidates` |
| ~~**5**~~ | ~~Merge onto the replay view's incidents~~ | **Done.** `liveIncidentMerge.ts`, keyed on `et` + incident text, with a mirror key |
| ~~**6**~~ | ~~Dossier + seek + decide on the replay view~~ | **Done.** `ReplayIncidentDossier`, over a now-shared decision identity |
| ~~**7**~~ | ~~Retroactive matching when a replay appears later~~ | **Done with 4** — the pass runs on each list load, so a later replay is just a new candidate |
| ~~**8**~~ | ~~Retention setting, expiry sweep, and clearing local storage removing live data~~ | **Done.** `live-retention.ts`, swept once per process after the launch sync |
| ~~**9**~~ | ~~Live data in the replay archive export~~ | **Done.** `live-export.ts`; traces opt-in, and import restores and links |

The experimental flag and the capture setting were **step 0** — they gate everything above and had to land before any of it shipped. **Done**; see [Settings and Gating](#settings-and-gating). The retention setting is not part of step 0 and remains unbuilt (step 8).

Steps 1 and 2 are worth doing regardless of whether linking is ever built, because they close a real hole: **live evidence currently does not survive the session that produced it.**

---

## Resolved Decisions

Settled 2026-08-03.

### A replay with no matched log falls back to live data

If a replay has no result log but *does* have matched live data, **the live data is used and the replay view says so plainly** — that no log was found, and that it is showing a limited view derived from the live session.

This is the one place live incidents are rendered **directly rather than as enrichment**, because there is no authoritative list to defer to. It is a separate code path, not a flag, and it should be built as such.

Expected to be rare: LMU writes the session XML when the replay is created, so a replay without one usually means the log was moved, deleted, or never copied across on an import.

**Session export is disabled in this state**, with a tooltip saying why. A live-only view has no final standings and no finishing statuses — both come from the XML — so an export produced from it would be a race report missing the result. Better to refuse than to emit something that looks authoritative and is not.

The mechanism already exists: `ReplayActions` takes a `sessionDataDisabledReason`, which the export uses today to disable itself when a session has no synced standings. This is a second reason string on the same control, not new plumbing.

The view itself must also **state plainly that it is showing limited data**, not merely omit things. A steward who does not know the log is missing will read absent incidents as "nothing happened".

### Retention expires whole live sessions, by age

7 / 30 / 90 days or never, defaulting to 30, applied to the whole live session record regardless of link state. Steward decisions are exempt.

An earlier draft of this document proposed expiring only the context windows and keeping the smaller derived evidence. That was dropped as over-engineered: traces are essentially all of the disk growth, so the extra tier bought nothing while adding a rule the user has to hold in their head.

Shortening the window must be confirmed against a summary of what will be deleted. See [Retention and Deletion](#retention-and-deletion).

### Links survive a re-hash

Live links must not break when a replay re-hashes, because the app does not otherwise delete replays — so a link that silently dropped would look like data loss with no cause.

Reuse the existing secondary-identity pattern: `ArchivedReplayRecord.identityKey` already exists for exactly this, mirroring the replay cache's own fallback lookup so a replay that re-hashes stays archived rather than reappearing. Live links should carry the same fallback key.

This is also what raised [Carrying Live Data in a Replay Export](#carrying-live-data-in-a-replay-export): if a link can survive a re-hash locally, it should survive a hand-off to another install too.

### An offline AI grid is a stronger limitation than roster churn

Recorded after step 4 landed, because it turned out to bite harder than the case
below it.

Every offline quick race at one track fields the **same AI roster**, so roster
overlap scores 1.00 against every replay of that track and separates none of
them. This is not a degraded signal like open-practice churn — it is no signal
at all, and it is the common case for a single-player install.

Incident agreement carries those sessions, and does so well when there are
incidents to compare. A **clean** offline session at a track with several
replays is therefore expected to stay unlinked until a human picks, and that is
the correct outcome rather than a gap to close: nothing in the data
distinguishes those replays.

### Roster churn in open practice is accepted

Drivers join and leave constantly in open practice, which weakens roster-overlap matching for those sessions. Accepted rather than solved: **open practice is not protestable and is not stewarded as a league race.** Matching quality matters for league races, which have stable rosters and are exactly the case the scoring handles well.

Worth stating as a known limitation rather than a bug to be reported later.

### The live sessions list shows sessions that recorded nothing

A captured session with no incidents is listed like any other. It is evidence of nothing, but **non-information beats no information**: an absent row is indistinguishable from capture having silently failed, which is a far worse thing for a steward to discover after a race.

### Decisions do not require live evidence

A post-session decision can be made on any incident, with or without a captured context. Most incidents will have none — track limits and solo incidents never get a context window at all — so the decision layer must not assume evidence exists.

### Linking resets the retention clock

A session that gains a replay to be reviewed against has become more useful, not less, so expiring it on its original schedule would delete evidence at the moment it became worth keeping. Retention is therefore measured from the later of capture and link. Linking is a one-time event, so this cannot extend a session's life indefinitely.

### No decisions-only export

Decisions travel inside the **per-replay session export** that already exists, in the CSV and JSON output. No separate decisions-only surface is introduced.

The consequence is recorded under [Clearing local storage](#clearing-local-storage): the clear-storage warning cannot offer an export as an escape hatch, because there is no bulk one. The warning itself is the safeguard until cross-session decision export exists.

### The export format must not preclude multi-steward merging

Carrying live data in a replay archive means two stewards can end up holding decisions on the same incident from different installs. Reconciling that is out of scope and stays out of scope — but the export format should not make it impossible later. Decisions already carry a stable id, a steward author and a revision history, which is the minimum needed for a future merge to be tractable.

---
