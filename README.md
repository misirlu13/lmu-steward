# LMU Steward

LMU Steward is a companion desktop application for **Le Mans Ultimate (LMU)** that lets you review, replay, and deeply analyze your race sessions — all without leaving a clean, purpose-built interface.

---

## Table of Contents

- [Requirements](#requirements)
- [Getting Started](#getting-started)
- [Application Overview](#application-overview)
- [Dashboard](#dashboard)
  - [Sorting & Filtering](#sorting--filtering)
- [Session Analysis](#session-analysis)
  - [Session Summary](#session-summary)
  - [Incident Timeline](#incident-timeline)
  - [Incident Heatmap](#incident-heatmap)
  - [Driver Standings](#driver-standings)
  - [Session Chat Log](#session-chat-log)
  - [Quick View Mode](#quick-view-mode)
- [Driver Analysis](#driver-analysis)
  - [Overview Card](#overview-card)
  - [Incident History Timeline](#incident-history-timeline)
  - [Performance Metrics](#performance-metrics)
  - [Fault Analysis](#fault-analysis)
  - [Lap-by-Lap Breakdown](#lap-by-lap-breakdown)
- [User Settings](#user-settings)
  - [Profile](#profile)
  - [File Paths](#file-paths)
  - [Replay Sync](#replay-sync)
  - [Privacy & Cache](#privacy--cache)
  - [Application Behavior](#application-behavior)
- [Tips & Troubleshooting](#tips--troubleshooting)
- [License](#license)

---

## Requirements

- **Le Mans Ultimate** installed and configured on your PC
- **Windows** operating system
- LMU Steward runs as a standalone desktop application — no browser or additional software required

---

## Getting Started

1. Download the latest release installer from the Releases page and run it.
2. Launch **LMU Steward**. The app should automatically detect your LMU installation.
3. If prompted, open **User Settings** (gear icon in the top-right corner) and point the app to your LMU executable and replay directory.
4. Click **Sync Now** in User Settings to load your existing replays, or enable **Automatic Sync** to have the app keep itself up to date in the background.
5. Your replays will appear on the **Dashboard** — click any session to start reviewing it.

> **Windows trust warning (SmartScreen):** LMU Steward is currently distributed without a code-signing certificate. Windows may show a "Windows protected your PC" or "Unknown publisher" warning when you run the installer or app for the first time. If you downloaded LMU Steward from the official release page, click **More info** and then **Run anyway**.

---

## Release Workflow

This repository uses Conventional Commits + semantic-release.

- Use `npm run commit` to open the Commitizen CLI and compose a conventional commit message.
- Push commits to `main`.
- `.github/workflows/release.yml` runs semantic-release, calculates the next version, updates `CHANGELOG.md`, and bumps `release/app/package.json` + `release/app/package-lock.json`.
- semantic-release creates a Git tag in the form `vX.Y.Z`.
- `.github/workflows/publish.yml` runs on version tags (`v*`) and publishes the Windows build artifacts.

Useful commands:

- `npm run release:dry` to preview the next release locally.
- `npm run commitlint:last` to validate the latest commit message format.

---

## Application Overview

LMU Steward connects directly to LMU in the background. While you race or review, the app continuously monitors your session data and keeps your replay library up to date. The navigation bar at the top of every screen shows your LMU profile name and avatar initials, and gives you quick access to the Settings page via the gear icon.

---

## Dashboard

The Dashboard is your home screen and the starting point for all replay activity. It displays your recorded sessions grouped by track event — if a track weekend included Practice, Qualifying, and a Race, those sessions appear together under a single track card.

Each track card shows:
- **Track name and location**
- **Date and time** the session took place
- A table of all sessions in that event weekend, each row showing:
  - Session type (Race, Qualifying, Practice)
  - Total incidents (collisions, track limit violations, and penalties)
  - Session duration
  - Car classes present
  - An **Incident Severity** badge (Low / Medium / High) based on average incidents per driver
- An **Analyze** button to open the full Session Analysis for a specific session

The footer of the Dashboard shows totals for replays loaded and sessions available.

### Sorting & Filtering

Use the controls at the top-right of the Dashboard to organize your replay list:

**Sort By:**
- Session Date
- Track Name
- Total Incidents

**Sort Direction:** Ascending or Descending

**Filters** (click the filter icon):
- **Date Range** — narrow down to a specific time window
- **Track** — show only sessions at a particular circuit
- **Session Type** — Race, Qualifying, or Practice
- **Session Length** — Short (≤20 min), Medium (≤120 min), or Long
- **Car Class** — filter to a specific car class
- **Field Size** — Small (≤10), Medium (≤30), or Large grids
- **Class Format** — Single Class or Multi-Class
- **Incident Count** — filter by severity level

When filters are active, a badge appears on the filter button and the footer shows how many replays matched your criteria.

---

## Session Analysis

Click **Analyze** on any session from the Dashboard to open the Session Analysis view. This is the core of LMU Steward — a comprehensive breakdown of everything that happened during that session.

The header shows the track name, session type (color-coded: Red for Race, Yellow for Qualifying, Green for Practice), date, location, and a breadcrumb trail so you always know where you are.

> **Note:** If a replay was captured after the live session was already in progress, a **Partial Replay Data** warning will appear. Incident timing in that case may be approximate.

### Session Summary

A row of info cards at the top gives you an at-a-glance overview:

| Card | Details |
|------|---------|
| **Laps Completed** | How many laps were completed and the percentage of race distance finished |
| **Duration** | Total session run time |
| **Drivers** | Number of drivers on the grid |
| **Incidents** | Total incident count with an average score per driver |
| **Car Classes** | All car classes that competed, with driver counts per class |
| **Weather** | Track and air temperature with weather conditions |

### Incident Timeline

A chronological, scrollable list of every incident that occurred during the session. Each entry includes:
- Timestamp of the incident
- Incident type: **Collision**, **Track Limit**, or **Penalty**
- Drivers involved and their car numbers
- A **Jump To** button that instantly seeks LMU's replay camera to that exact moment

You can filter the timeline by incident type using the toggle buttons above the list. Clicking a row highlights it and pre-selects it for replay jumping.

### Incident Heatmap

A visual overlay of the track map showing where incidents were concentrated during the session. Spots are color-coded by severity:
- **Minor** — lighter color
- **Serious** — medium color
- **Critical** — bright/intense color

Use this to quickly identify problem corners and high-risk sections of the circuit.

### Driver Standings

A full standings table showing the final classification for all drivers, including:
- **Finishing position**
- **Driver name** and car number
- **Car class** (with color-coded badge)
- **Fastest lap** time
- **Total incidents**
- **Risk Index** — a calculated score reflecting how frequently a driver was involved in incidents relative to the field
- A **Analyze Driver** button to open the Driver Analysis view for that individual

### Session Chat Log

Click the **Chat** button (in the top-right of the Session Analysis page) to open a side panel showing all in-game chat messages exchanged during the session, with driver names and message content.

### Quick View Mode

If you haven't yet loaded a replay into LMU's replay player, LMU Steward enters **Quick View** mode for that session. In this mode:
- The session summary, incident timeline, heatmap, and driver standings are all available
- Replay jump controls (Jump To Incident buttons, the Jump Bar) are disabled until you load the replay in LMU
- A blue **View Replay** button appears at the top — click it to trigger LMU to load the replay, which then unlocks full playback controls

---

## Driver Analysis

From the Driver Standings in Session Analysis, click **Analyze Driver** on any driver to open their individual Driver Analysis page. This view gives you a complete picture of one driver's session from every angle.

AI-controlled drivers are identified with an **AI** badge next to their name.

### Overview Card

A summary card at the top showing the driver's name, car number, car class, finishing position, and team name.

### Incident History Timeline

A detailed, filterable log of every incident this driver was involved in during the session. Each entry shows:
- Timestamp
- Incident type (Collision, Track Limit, Penalty)
- Other drivers involved (if a collision)
- Penalty reason (if a penalty)
- A **View Incident** button that jumps the LMU replay to that moment
- A **Jump To** bar for quick scrubbing through incidents chronologically

Use the toggle buttons above the list to show or hide specific incident types.

### Performance Metrics

A card showing three key stats for the driver:
- **Fastest Lap** — their personal best lap time during the session
- **Total Incidents** — number of incidents they appeared in
- **Risk Index** — how their incident rate compared to the rest of the field (higher = more incidents per lap/driver)

### Fault Analysis

When you click on an incident in the timeline, the Fault Analysis card updates to show a detailed breakdown of that specific event:
- **Fault Risk Index** — a score indicating likely fault attribution (subject vs. secondary party in a collision)
- **Dominant Incident Type** — the type of incident this driver was most involved in overall
- **Collision Statistics** — percentage breakdown of Subject (likely at fault) vs. Secondary (hit by another driver) across all their collisions
- **Top Counterparty** — the driver this driver collided with most often
- **Top Penalty Reason** — the most common reason they received a penalty

When no incident is selected, the card shows overall session-wide statistics for that driver.

### Lap-by-Lap Breakdown

A table showing performance data for each individual lap the driver completed, helping you spot where they lost time or where incidents occurred in context with their lap pace.

---

## User Settings

Access settings by clicking the **gear icon** in the top-right corner of the navigation bar.

### Profile

Displays your LMU player profile pulled directly from LMU, including:
- **Name** and **Nickname**
- **Steam ID**
- **Nationality** (shown with flag)
- **Language**

Profile data is read-only — changes to your name or nationality must be made within LMU itself. Use **Sync Profile** to refresh this information from your current LMU account.

### File Paths

These paths tell LMU Steward where to find LMU on your system:
- **LMU Executable Path** — the full path to your `LMU.exe` file. Used to launch LMU directly from the app.
- **LMU Replay Directory Path** — the folder where LMU stores your recorded replays.

If your LMU is installed in a non-standard location, update these paths and click **Save** to apply the changes.

### Replay Sync

Controls how LMU Steward keeps your replay library up to date:

| Setting | Description |
|---------|-------------|
| **Automatic Sync** | Automatically reads new replays in the background while the app is open |
| **Sync on App Launch** | Performs a sync every time you start LMU Steward |
| **Sync Interval** | How often (in minutes) automatic sync checks for new replays |
| **Sync Now** | Manually trigger an immediate sync |

The last sync timestamp is displayed so you always know how current your data is.

### Privacy & Cache

| Setting | Description |
|---------|-------------|
| **Anonymize Driver Data** | Replaces real driver names with anonymized placeholders throughout the app |
| **Telemetry Cache** | Caches replay telemetry data locally so previously-viewed sessions load faster |
| **Clear Cache on Exit** | Automatically deletes cached telemetry data each time the app closes |
| **Clear Stored Data** | Manually wipe all locally stored app data (requires confirmation) |

### Application Behavior

| Setting | Description |
|---------|-------------|
| **Quick View Mode** | When enabled, session data is available to browse before loading a replay in LMU. Jump controls are locked until the replay is loaded. |
| **Close LMU When Steward Exits** | If LMU is running when you close LMU Steward, this option will also close LMU |
| **Launch LMU** | Start LMU directly from within LMU Steward without switching to your desktop |

Settings with toggles (on/off switches) save automatically. Settings that require text input (file paths) require you to click **Save** to apply.

---

## Tips & Troubleshooting

**The app says "LMU Disconnected"**
- This means LMU Steward cannot reach the LMU backend. Make sure LMU is running, or check that your paths in User Settings are correct.
- You can still access User Settings while disconnected.

**No replays appear on the Dashboard**
- Go to User Settings and confirm the **LMU Replay Directory Path** points to the correct folder.
- Click **Sync Now** to force a fresh scan.
- If filters are active, try clearing them — a filter badge on the filter button indicates active filters.

**Jump To Incident buttons are greyed out**
- The replay isn't loaded in LMU yet. Click **View Replay** at the top of the Session Analysis page to load it, then the jump controls will become available.

**Replay data shows a "Partial Replay" warning**
- This happens when recording started after the session was already underway. Incident timestamps may be slightly off from where they appear in playback — this is expected.

**Profile shows "Unknown Steward"**
- LMU may not be running, or your player profile hasn't been synced yet. Launch LMU, then return to User Settings and click **Sync Profile**.

---

## License

MIT
