# Export & Steward Decisions — Design

**Status:** Steps 0a and 0b implemented; cross-session export (0c) not started
**Date:** 2026-07-28, updated 2026-08-03
**Companion documents:**
- [Live Capture Investigation](live-capture-investigation.md) — technical feasibility, shared memory contract, sidecar architecture
- [Live Mode — Product Design](live-mode-product-design.md) — what live mode should be
- [Live ↔ Replay Reconciliation](live-replay-reconciliation-design.md) — persisting live capture and linking it to a replay for post-session review

**Question:** How does session data — including steward decisions — get out of the app and into a league's own spreadsheet, database, or published results post?

---

## Table of Contents

- [Summary](#summary)
- [Why Export Belongs to the Replay View](#why-export-belongs-to-the-replay-view)
- [Three Export Surfaces](#three-export-surfaces)
- [Surface 1 — Session Export](#surface-1--session-export)
- [Surface 2 — Cross-Session Decision Export](#surface-2--cross-session-decision-export)
- [Surface 3 — Provisional Decision Board](#surface-3--provisional-decision-board)
- [The Decision Layer](#the-decision-layer)
  - [Design Stance](#design-stance)
  - [Decision Lifecycle](#decision-lifecycle)
  - [Assignment Under Time Pressure](#assignment-under-time-pressure)
  - [Revisions and Audit Trail](#revisions-and-audit-trail)
  - [The Decision Record](#the-decision-record)
- [Live to Post-Session Reconciliation](#live-to-post-session-reconciliation)
- [Configurable Penalty Tariff](#configurable-penalty-tariff)
- [Formats](#formats)
- [Storage Considerations](#storage-considerations)
- [Sequencing](#sequencing)
- [Open Questions](#open-questions)

---

## Summary

Leagues need session data out of the app and into their own systems — results spreadsheets, licence-point databases, published stewarding reports.

Three points drive this design:

1. **Export is a property of the complete session record**, which is why it belongs to the replay view rather than live mode.
2. **Steward decisions are one section of a session export**, not the whole thing. A league publishing a stewarding report wants the session, not just the calls.
3. **There are two distinct export scopes** — one session, or decisions across many sessions — and they want different homes in the UI.

---

## Why Export Belongs to the Replay View

This is a structural constraint, not a UI preference.

**Live mode cannot produce a session export, because mid-race there is no completed session.** No final standings, no finishing statuses, no total lap count, no complete incident list — every one of those is only knowable at the checkered flag.

Export serializes the *authoritative session record*, and that record only exists after `SME_END_SESSION` fires and the XML syncs to the DB. This is the same constraint that drives the whole live/post split: live mode captures decisions under time pressure, the replay view owns the authoritative record, and export is a property of the record.

---

## Three Export Surfaces

| | **Session export** | **Cross-session decision export** | **Provisional board** |
| --- | --- | --- | --- |
| Scope | One session, everything | Decisions across many sessions | Decisions so far, this session |
| Answers | "What happened in this race?" | "What are Driver X's points this season?" | "What have we called so far?" |
| Home | **Replay view** | **Dashboard** | **Live mode** |
| Completeness | Authoritative | Authoritative | **Provisional** |

---

## Surface 1 — Session Export

The primary surface. Lives on the replay view, operating on one synced session.

**Contents:**

- Session metadata — track, session type, date, server, weather, duration, laps
- Final standings and finishing statuses
- All incidents, track limits, and penalties — **including ones that received no decision**
- Per-driver statistics — laps, best lap, sector times, incidents, pit stops
- Steward decisions, as one section

**This is largely a serialization of view models that already exist.** The replay view already computes essentially all of it — see `replaySummaryViewModel.ts`, `useReplayDerivedData`, and the standings and timeline components. That makes session export substantially cheaper to build than a from-scratch feature, and it means **it can ship before the decision layer exists**, with decisions appearing as an additional section once that layer lands.

**Scope options within a session:** whole session (the standard case), or single driver (for issuing an individual notice).

> ✅ **Built 2026-08-03.** Whole-session scope only; single-driver is not built.
> The record is assembled in `src/renderer/utils/sessionExportModel.ts` and
> serialized by `sessionExportFormats.ts` — one model, three formats, so CSV,
> Markdown and JSON can never disagree about what a session contained. The
> renderer never picks a path: it sends a suggested filename that the main
> process reduces to a basename before the save dialog sees it.
>
> Two things the implementation had to get right that the design did not call out:
>
> - **`driver_steam_id` is frequently absent.** LMU reports `0` for AI entries
>   and offline sessions, so the export omits the field rather than writing `0`
>   — a league joining on it would otherwise merge a whole field into one
>   driver. See the identity warning in the companion capture document.
> - **CSV needs a UTF-8 BOM.** Driver names are user-supplied UTF-8
>   (`José María López`, `S F#7575`) and Excel assumes the system code page
>   without one.
>
> The control is deliberately labelled **Export Data**, next to the existing
> **Export Replay** — one produces a report, the other an archive of replay
> files, and conflating them means someone posts a zip where they meant results.

---

## Surface 2 — Cross-Session Decision Export

Not a session export at all — a **query over the decision layer**, spanning many sessions.

This is what a league needs for season administration: licence points totals, repeat-offender records, disciplinary history for a driver across a championship.

**Home: the Dashboard**, which already has the machinery. `DashboardFilter` renders a `DateRangePicker` (see `src/renderer/components/Dashboard/DashboardFilter.tsx:222`), so date-ranged and driver-scoped export has somewhere to live without new filtering plumbing.

**This surface is the concrete argument for relational storage.** A season-long points query spans every session in a date range — a key-value blob cannot serve it without loading and scanning everything. See [Storage Considerations](#storage-considerations).

---

## Surface 3 — Provisional Decision Board

The one export-shaped thing live mode *can* produce: the running list of calls made so far.

Useful in practice — leagues broadcast, and a live penalty board for a stream overlay or a Discord post has real value. But it is a **different artifact** from a session export:

- Decisions only — no standings, no final results, no complete incident list
- Must be **clearly marked provisional** wherever it is rendered or copied
- Every entry is subject to revision once the session ends and the replay is available

Keeping this distinct matters. Conflating it with session export invites a half-finished race report being published as a final one.

---

## The Decision Layer

Decisions feed all three export surfaces. The layer is shared between the replay view and live mode — **live mode is one writer, not the owner.**

### Design Stance

**The app proposes, the steward disposes.**

The application never assigns a penalty autonomously. It classifies the incident, identifies the likely at-fault party, and pre-fills a suggested penalty from the league's own tariff — but a human steward confirms or overrides every call, and the record captures who decided and on what basis.

This is what makes the tool adoptable:

- **Appeals.** "A named steward decided, and here is the reasoning and evidence" is defensible. "The app decided" is not.
- **Imperfect data.** Partial-session capture, AI versus human participants (`mControl`), and the SDK's own warning that `mInPits` is unreliable for remote vehicles mean confident automation would occasionally be confidently wrong.
- **Leagues own their rulebooks.** A tool that overrules the panel gets rejected. One that arms it gets adopted.

The classification exists to make the steward's decision **fast and well-evidenced**, not to make it for them.

### Decision Lifecycle

Under time pressure the most common honest action is *"that looked bad, come back to it"* — so the model needs a park state.

```
NEW ──────────► FLAGGED ──────────► DECIDED
 │              (park it,           (penalty / no action / note)
 │               keep watching)          │
 │                   │                   │
 │                   ▼                   ▼
 └──────────────► DEFERRED          REVISED
                (to post-session     (changed on later review)
                 review)                 │
                                         ▼
                                   FINAL / APPEALED / OVERTURNED
```

**`FLAGGED` is expected to be the most common live action, not `DECIDED`.** This gives the live triage queue a second responsibility: ensuring nothing parked is forgotten by the checkered flag. An end-of-session prompt listing unresolved flags is a small feature with outsized value.

### Assignment Under Time Pressure

Assigning a penalty mid-race is a fundamentally different interaction from doing it at leisure. **If a call takes more than a couple of seconds, stewards will abandon the tool and go back to a notepad.**

- **Pre-filled from classification** — the steward confirms in one click
- **Preset tariff buttons** — one-tap application of the league's configured penalties
- **Keyboard shortcuts** — flag, decide, next
- **Reasoning optional at time of call** — prompt for it during post-session review instead
- **One-key park**, because `FLAGGED` is the most frequent action

Post-session assignment has no such constraint and can use a fuller form.

### Revisions and Audit Trail

**A decision is a record with revisions, not a row that gets overwritten.**

| Revision | Decision | Reasoning | Steward | Status |
| --- | --- | --- | --- | --- |
| 1 | 5s time penalty | "contact at T1" | Steward A | provisional (live) |
| 2 | No action | "replay shows he was squeezed" | Steward A | final (post-review) |

Being able to show *"we called it live, reviewed it after, and changed it for this reason"* is precisely what makes league stewarding defensible under appeal. Cheap to build now, expensive to retrofit once decisions are being written.

### The Decision Record

Proposed shape. Field names are indicative, not final.

> ⚠️ **Not every penalty stems from a single incident.** A driver who crosses the
> track-limit threshold earns a penalty tied to *accumulation across many
> incidents*, not to any one of them. The same applies to a conduct penalty issued
> for repeated contact. A schema that requires `incident_id` cannot express either,
> and this surfaces the moment penalty assignment appears anywhere other than the
> incident dossier — for example on the driver detail view.
>
> Hence `basis`, a nullable `incident_id`, and `contributing_incident_ids` below.
> Cheap now, a migration later.

```
decision
├── id                     stable, generated at capture
├── basis                  incident | accumulation | conduct
├── incident_id            required when basis = incident; null otherwise
├── contributing_incident_ids[]   populated when basis = accumulation
├── replay_hash            null while live; populated after sync
├── session_track
├── session_type           RACE / QUALIFY / PRACTICE
├── session_date
├── server_name            multiplayer identification
├── driver_steam_id        ← the join key (see below)
├── driver_name            display only; may change
├── involved_parties[]     other drivers + role (at-fault / affected)
├── lap
├── session_time
├── et_seconds             ← enables replay jump
├── corner_or_sector
├── classification         contact / track limits / blue flag / unsafe rejoin / …
├── penalty_type           from league tariff
├── penalty_value          e.g. 5, 10, 30 (seconds) or points
├── reasoning              free text
├── steward_author         ← present from day one, even single-steward
├── decided_at
├── state                  NEW / FLAGGED / DECIDED / DEFERRED
└── status                 provisional / final / appealed / overturned

decision_revision
├── decision_id
├── revision_number
├── penalty_type, penalty_value, reasoning, status
├── steward_author
└── revised_at
```

> 🛑 **Verified against a real export 2026-08-03: a replay-sourced export has no
> Steam ID at all.** The session XML's `<Driver>` block carries no identity
> element — name, team, car number, positions and laps, but no id. The value the
> replay view exposes as `driverSid` resolves from the live standings API, so it
> is empty for a synced replay, and where it is present it is a short numeric
> LMU driver id (e.g. `3532`), not a 17-digit Steam ID.
>
> The export column is therefore labelled **Driver ID**, and the practical join
> keys for a replay-sourced export are **car number and team**. Real Steam IDs
> reach an export only through the decision layer, which gets them from live
> capture's `mSteamID`.
>
> ⚠️ **`<ServerName>` is empty in every multiplayer log inspected — all of which
> were `<Dedicated>0</Dedicated>`.** The two co-vary, so the field most likely
> only carries a value on a hosted dedicated server, which is what a league
> would run. Unconfirmed: no `Dedicated=1` sample exists to check the positive
> case. The export omits the row when empty and reports `Dedicated server`
> separately, so an absent name reads as "not a hosted server" rather than as
> missing data.
>
> This is a strong argument for
> [live↔replay reconciliation](live-replay-reconciliation-design.md): linking a
> live capture to a replay is what would give a replay-sourced export the stable
> driver identity this section assumes it already has.

**`driver_steam_id` is the most important field in any export.** `mSteamID` from `VehicleScoringInfoV01` is a stable identity that lets a league join an export directly against their existing roster or licence-points database. Name matching breaks on nicknames, duplicate names, and mid-season renames. Slot `mID` is explicitly **not** suitable — the SDK documents it as reused after a driver leaves a multiplayer session.

**`et_seconds` plus `replay_hash` makes an export a review manifest**, not just a log. An appeals panel can open it and jump straight to the moment in the replay. For `basis = accumulation` there is no single moment to jump to — the export should render the contributing incidents as a list of jump points instead.

**`steward_author` should exist from day one** even in single-steward use. Multi-steward panels are the most likely future request; adding the field later means a migration.

---

## Live to Post-Session Reconciliation

Session end is a **promotion step**, not merely a data sync:

1. `SME_END_SESSION` fires; live capture stops
2. LMU writes the session XML; existing sync ingests it to the DB
3. Live decisions are **promoted from provisional to reviewable**, and linked to the now-available `replay_hash`
4. Unresolved `FLAGGED` incidents surface as a review worklist
5. The replay view becomes the **review surface** for calls made live
6. Session export becomes available, now including decisions as a section

---

## Configurable Penalty Tariff

Every league runs its own rulebook. Common penalty types include drive-through, stop-go, time penalties (5s / 10s / 30s), grid drops, licence points, reprimands, warnings, and disqualification — but no two leagues use the same set.

**This must be a user-configurable list backed by settings, not a hardcoded enum.** A fixed penalty vocabulary makes the feature unusable for a large share of the audience.

Per entry, the tariff should define: display label, value type (seconds / points / none), default value, and an optional shortcut key for live assignment.

---

## Formats

### Export is publication, not just interchange

Leagues **publish** stewarding output — Discord announcements, forum posts, shared results sheets visible to drivers. Formatted human-readable output therefore matters as much as machine-readable data.

In practice, **"copy to clipboard as Markdown" may see more real use than any file format.**

| Format | Purpose | Priority |
| --- | --- | --- |
| **CSV** | Universal; opens in Excel and Google Sheets | Ship first |
| **Markdown / clipboard** | Discord, forum posts, publication | Ship first |
| **JSON** | Programmatic import into a league DB | Ship first |
| XLSX | Formatted multi-sheet workbook — a natural fit for session export | Only if requested |
| Google Sheets API | Direct write | **Skip** — OAuth scope for little gain over CSV |

Note that a session export has natural multi-sheet structure (results / incidents / decisions), which is the one case where XLSX earns its complexity. CSV can serve it as multiple files or a flattened single sheet.

---

## Storage Considerations

The current SQLite layer in `src/main/storage/local-data-store.ts` is a **key-value store** (`get(key)` / `set(key, value)`), with the replay cache persisted as blobs under keys.

Decisions are the first genuinely relational-shaped data in the application, and [Surface 2](#surface-2--cross-session-decision-export) is why: querying decisions by driver **across sessions** for season points and repeat-offender history cannot be served by a KV blob without loading and scanning everything.

This warrants a deliberate schema decision rather than storing a decisions array under another key. The existing replay cache already has a schema-versioning and migration mechanism (see CONTRIBUTING.md) whose approach can be followed.

---

## Sequencing

Session export can ship **before** the decision layer, which makes the incremental path better than previously planned:

| Step | What | Why first |
| --- | --- | --- |
| **0a** ✅ | Session export on the replay view | Mostly serializes existing view models; delivers value immediately with no schema decisions |
| **0b** ✅ | Decision layer + decisions section in session export | The schema decision, validated against real league workflow |
| **0c** | Cross-session decision export on the Dashboard | Reuses the existing date-range filter |
| **1+** | Live mode | Inherits a proven decision model; live becomes another writer |

Step 0a is deliberately first: it is the cheapest useful thing in any of these documents, and it exercises the replay view's existing data without committing to a storage design.

**Biggest scope multiplier: multi-steward panels.** Most leagues steward as a panel, so this will be requested. Defer the networking entirely, but **design the decision record with an author field and a stable incident ID from day one** so it can be added later without a migration.

---

## Open Questions

1. **Does the tariff need per-session-type variation?** Some leagues penalise differently in qualifying versus race.
2. **Should licence points accumulate across seasons?** If so, a season boundary concept is needed — and it belongs on Surface 2.
3. **Multi-steward conflict handling.** If two stewards decide the same incident, is that a conflict to resolve or a majority to record? Deferred, but the schema should not preclude either.
4. **Import.** Should the app read back an edited export? Likely not worth it — leagues will diverge in their own systems.
5. **Privacy.** Exports contain Steam IDs and driver names. Worth a note in the UI at export time, especially for publicly posted output.
6. **Session export templating.** Leagues may want their own report layout. A token-based template for the Markdown output may beat a fixed one — worth deferring until there is demand.
