# Linux Port — Feasibility & Plan

**Status:** Investigation complete, no code written
**Date:** 2026-07-28
**Scope:** What it would take to support Linux in addition to Windows

---

## Summary

The port is more feasible than it first appears. There are **four real blockers** across roughly
ten files. The architecture is already ~90% platform-neutral because nearly all game interaction
goes over a localhost REST API rather than the filesystem or process handles.

Estimated effort: **~9–12 dev days**, of which 2–3 are validation on a real Linux + Proton box.
The code is the cheap half.

Note that on Linux, Le Mans Ultimate itself is still a Windows game running under Proton/Wine.
The "Linux version" of LMU Steward is a **native Linux Electron app that talks to a Proton-hosted
game** — which is what creates blocker #4 below.

---

## What already works unchanged

This is the reason the estimate is low, and it's worth stating explicitly so we don't
re-investigate it later:

- **All game control is HTTP.** `LMU_API_BASE_URL: 'http://localhost:6397'` (`constants.ts:2`).
  Under Proton, Wine shares the host network stack, so a native Linux build reaches the game's
  REST server on loopback with no changes. Everything in `api-status.ts`, `camera.ts`,
  `session.ts`, `profile.ts`, and all replay playback/seek/HUD control in `replay.ts` is portable
  as-is.
- **One `process.platform` check in the entire app** — `main.ts:595`, and it's the standard macOS
  quit idiom.
- **Storage is already cross-platform.** `local-data-store.ts:39` uses `app.getPath('userData')`.
  better-sqlite3 only needs a per-platform native rebuild, already wired through
  `electron-rebuild`.
- **electron-builder already declares a Linux target** (`linux: { target: ["AppImage"] }` in
  `package.json`).
- **`closeLmu` is already portable** — it's an HTTP `NAV_EXIT` call, not a process kill.

---

## The four blockers

### 1. Hardcoded Windows default paths

**Where:** `constants.ts:3-6`, consumed at `user-settings.ts:11-12` and as UI placeholders at
`UserSettings.tsx:965,984`.

```
'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\...'
```

On Linux the game files live natively at `~/.steam/steam/steamapps/common/Le Mans Ultimate/`.
Steam installs Windows games to the host filesystem; only the registry/AppData live inside the
`compatdata/<appid>/pfx` prefix.

There are at least four plausible Steam roots, so a single constant will not do:

- `~/.steam/steam`
- `~/.local/share/Steam`
- `~/.var/app/com.valvesoftware.Steam/data/Steam` (Flatpak)
- Any additional library listed in `libraryfolders.vdf`

**Fix:** replace the constants with a resolver that enumerates candidate roots.

### 2. Path validation is Windows-only and fails hard

**Where:** `user-settings.ts:34-77`

`normalizeWindowsPath` rewrites `/` → `\` and lowercases. Validation then requires a `.exe`
basename, a literal `\le mans ultimate\` segment, and a `userdata\replays` substring.

This is not merely cosmetic. On POSIX, backslash is not a path separator, so
`path.basename('c:\\...\\le mans ultimate.exe')` returns **the entire string**. The executable
check can therefore never pass, and every settings save is rejected.

This is the single most load-bearing function to rewrite.

**Verifiable today:** the existing test at `user-settings.test.ts:31` ("accepts valid path with
mixed separators and casing") passes on Windows and would **fail** on Linux for exactly this
reason. See "Order of operations" below.

### 3. Launching the game

**Where:** `lmu-launch.ts`

`spawn(executablePath)` on a `.exe` (`lmu-launch.ts:85`) does nothing on Linux. The whole
"executable path" concept is wrong there — the correct action is handing
`steam://rungameid/<appid>` to `shell.openExternal`, which lets Steam apply the user's own
Proton version and launch options.

Related surface:

- File picker filters `extensions: ['exe']` — `lmu-launch.ts:161`
- `normalizeExecutablePath` appends `Le Mans Ultimate.exe` to any directory — `lmu-launch.ts:23-34`

**Fix:** introduce a launch-target abstraction rather than a path; strategy differs per platform.

### 4. The game's own API returns Wine paths — the subtle one

**Where:** `replay.ts:1040`

`/rest/watch/replays` is served *by the game*, so under Proton it reports Windows paths
regardless of host OS:

```json
"replayDirectory": "C:\\Program Files (x86)\\...\\UserData\\Replays\\"
```

The consuming code does:

```ts
const logDataDirectory = resolve(replayDirectory, '../Log/Results');
```

On Linux `path.resolve` treats backslashes as ordinary characters, producing
`<cwd>/C:\Program Files...\Replays\Log/Results`. `readdir` throws, `findBestLogFile` fails, and
`getReplayLogData` swallows the error and returns `null` (`replay.ts:1057`).

**Failure mode:** the app runs and looks completely fine, but every replay shows zero incidents
and zero penalties — i.e. the entire product silently does nothing. Because it fails silently,
this layer needs to be built defensively and log loudly.

**Fix:** a Wine → host path translation layer (map `C:\` to the prefix's `drive_c`, resolve `Z:\`
to `/`, swap separators).

**Side effect to remember:** `replayDirectory` is part of the replay cache identity key
(`replay.ts:152`), so changing translation invalidates cached replays. Bump
`REPLAY_CACHE_SCHEMA_VERSION` when this lands.

---

## Smaller items

| Item | Location |
|---|---|
| `asarUnpack: "**\\*.{node,dll}"` uses backslashes — won't match on Linux, so the better-sqlite3 `.node` binary stays inside the asar and fails to load | `package.json` |
| UI helper text hardcodes `Le Mans Ultimate.exe` and `UserData\Replays` | `UserSettings.tsx:946-947` |
| `areSystemPathsAtDefaults` compares against the Windows constants | `useUserSettingsDerivedState.ts:147-149` |
| ~11 test assertions hardcode Windows paths | `user-settings.test.ts`, `UserSettings.integration.test.tsx` |
| CI publishes `windows-latest` / `--win` only | `.github/workflows/publish.yml` |
| Test CI runs `windows-latest` only | `.github/workflows/test.yml` |
| README states Windows as a requirement | `README.md:41` |

---

## Proposed structure

Add `src/main/platform/` with three modules and route everything else through them:

- **`game-paths.ts`** — `getDefaultInstallRoots()`, `resolveSteamLibraries()` (parses
  `libraryfolders.vdf`), `getDefaultExecutablePath()`, `getDefaultReplayDirectory()`.
  Replaces the two constants.
- **`wine-paths.ts`** — `toHostPath(winePath)`, `getPrefixRoot()`. Identity function on Windows;
  real translation on Linux. Pure and fully unit-testable without a Linux machine.
- **`launcher.ts`** — `launchGame()`, with a spawn-exe strategy on Windows and a
  `steam://rungameid` strategy on Linux.

Then rewrite validation as a platform-aware predicate (normalize separators per-OS,
case-insensitive segment match, accept a bare `Le Mans Ultimate` binary name on Linux), and make
the Settings UI render labels and placeholders from the platform module instead of literals.

### The key design constraint

**Pass the target platform in as a parameter; do not read `process.platform` inside the logic.
Use `path.win32` / `path.posix` explicitly rather than bare `path`.**

Both sub-modules are available on every OS. Bare `path` is ambient and untestable cross-platform.
This one decision is what makes the majority of the port testable from a Windows dev machine:

```ts
describe.each(['win32', 'linux'] as const)('resolveGamePaths on %s', (platform) => { ... });
```

---

## Testing strategy

### Testable from Windows, single repo, no separate environment

Given the design constraint above:

- Wine → host path translation (pure string logic, 100% coverage)
- Path validation for both platforms
- Default path resolution and `libraryfolders.vdf` parsing (inject an fs port, or use `memfs` to
  simulate a Linux Steam tree)
- Launch *strategy selection* (assert it picks `steam://` vs `spawn`; mock the side effect)
- All renderer/UI tests

### Needs a Linux environment — but GitHub Actions covers most of it free

Adding `ubuntu-latest` to the `test.yml` matrix is a one-line change and catches:

- better-sqlite3 compiling and loading on Linux
- AppImage packaging producing a working binary (this is where the `asarUnpack` backslash bug
  surfaces)
- Any test that accidentally depends on Windows path semantics
- Real `app.getPath('userData')` values

### Needs real hardware

- `shell.openExternal` handing off to Steam (needs a real desktop session)
- The live REST API against a running game
- True end-to-end

---

## Do we need to dual-boot?

Not to start, and possibly not at all. Each tier buys a specific chunk of confidence:

**Tier 0 — free.** The only thing that genuinely cannot be derived by reasoning is *what string
LMU returns in `replayDirectory` under Proton*. That's one JSON payload. Ask a Linux user (GitHub
issue / LMU Discord) to run `curl http://localhost:6397/rest/watch/replays` and paste the output.
This unblocks the design of blocker #4, which is the riskiest of the four. No hardware needed.

**Tier 1 — a VM, a few hours.** Install Linux + Steam + LMU in VirtualBox/VMware/Hyper-V without
GPU passthrough. LMU won't *run*, but it will **install**, creating the real `steamapps/common`
tree, the real `compatdata/<appid>/pfx` prefix, and a real `libraryfolders.vdf`. Validates
default-path discovery, Steam library enumeration, path validation, AppImage packaging, native
module loading, and the settings UI end-to-end. Roughly 70% of the work. **This is the
recommended tier** — cheap and reversible.

**Tier 2 — real hardware, for the last 30%.** Live REST API against a running game,
`steam://rungameid` launch, true end-to-end. If we go here, use a **separate SSD** rather than
repartitioning the Windows drive: same result, far less risk to the working install. A persistent
live USB technically works, but LMU is a large re-download, so it's a poor fit.

**Realistic path:** Tier 0 + Tier 1 gets to a releasable beta. Ship it as "Linux support —
experimental" and let a Linux user close the loop on Tier 2. This is a normal way to ship a port
for a game you can't run locally.

---

## Effort estimate

| Phase | Days |
|---|---|
| Platform modules + default path resolution | 1.5 |
| Rewrite path validation + fix tests | 1 |
| Launch abstraction (Steam URL) | 1 |
| Wine path translation + cache version bump | 2–3 |
| Packaging fix, Linux CI job, AppImage/deb targets | 1 |
| Settings UI strings + README/docs | 0.5 |
| Validation on real Linux + Proton + LMU | 2–3 |

**Total: ~9–12 dev days.** The last row is the gate — blockers 3 and 4 cannot be fully confirmed
without a machine running LMU under Proton.

---

## Open questions — verify before committing

1. **The Steam AppID for Le Mans Ultimate.** Believed to be `2399420`, but **unverified**. The
   entire launch path depends on it.
2. **Whether LMU's REST server binds reachably from the host under Proton.** Wine normally shares
   the host network stack, so this should work — but it is the load-bearing assumption for the
   whole native-Linux approach. It's a 10-minute `curl localhost:6397/rest/watch/replays` test
   that either validates or kills the plan. **Do this first.**
3. **AppImage auto-update.** electron-updater supports AppImage, but the AppImage must run from a
   writable location. `.deb` does not auto-update. Decide which targets to ship.

---

## Order of operations

1. **Add `ubuntu-latest` to the `test.yml` matrix.** One line. Confirms the diagnosis with real
   output rather than analysis — `user-settings.test.ts:31` should go red for the reason described
   in blocker #2. Cheapest possible way to validate this document.
2. Ask a Linux LMU user for the `/rest/watch/replays` payload (Tier 0).
3. Build the platform modules with injected platform + `path.win32`/`path.posix`; test both
   platforms from Windows.
4. Spin up the VM once the code exists, to validate discovery and packaging (Tier 1).
5. Decide on real hardware only if we want end-to-end before release (Tier 2).

---

## The alternative worth keeping on the table

Ship the **existing Windows build** and document running it inside the same Proton prefix as the
game. Zero code changes, zero path translation — the app sees the same Windows filesystem the
game does.

Costs: worse install story, no auto-update, Wine-rendered Electron UI.

It's not a good product, but it's a legitimate stopgap that gauges actual Linux demand before
spending two weeks. Worth choosing if Linux users are currently hypothetical rather than asking.
