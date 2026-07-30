# Linux Port — Feasibility & Plan

**Status:** Investigation complete, no code written. The two load-bearing assumptions have been
confirmed against a real Linux/Proton install.
**Date:** 2026-07-28, updated 2026-07-30 with real Proton API payload
**Scope:** What it would take to support Linux in addition to Windows

---

## Summary

The port is more feasible than it first appears. There are **four real blockers** across roughly
ten files. The architecture is already ~90% platform-neutral because nearly all game interaction
goes over a localhost REST API rather than the filesystem or process handles.

Estimated effort: **~7–10 dev days**, of which 2–3 are validation on a real Linux + Proton box.
The code is the cheap half.

On Linux, Le Mans Ultimate itself is still a Windows game running under Proton/Wine. The "Linux
version" of LMU Steward is a **native Linux Electron app that talks to a Proton-hosted game** —
which is what creates blocker #4.

Field data from a Linux user on 2026-07-30 confirmed both risky assumptions and made blocker #4
substantially simpler than first estimated. Original estimate was 9–12 days; it is now 7–10.

---

## Confirmed field data (2026-07-30)

A Linux user running LMU under Proton ran `curl http://localhost:6397/rest/watch/replays`.
Representative entry:

```json
{
  "id": 0,
  "metadata": {
    "eventId": "2ec5a24c-92e5-43ee-8422-ee567603bf98",
    "eventTitle": "WEC-Xperience",
    "eventType": "daily",
    "sceneDesc": "LAGUNASECA",
    "seriesId": "f2c558b0-2a41-463e-8c1d-d30832c02b4a",
    "session": "PRACTICE"
  },
  "replayDirectory": "Z:\\home\\tebro\\.local\\share\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays\\",
  "replayName": "WeatherTech Raceway Laguna Seca P1 1",
  "size": 23634222,
  "timestamp": 1785356626
}
```

### What this confirms

1. **The REST server is reachable from the host.** The user ran a native Linux `curl` against
   `localhost:6397` and got a full response. This was the single assumption that could have killed
   the whole native-Linux approach. It holds. *(Minor caveat: worth one sentence of confirmation
   that they ran it from a normal Linux terminal rather than inside the prefix — but that is
   overwhelmingly the likely case.)*

2. **The game reports `Z:\` paths, not `C:\` paths.** Wine maps `Z:` to the host filesystem root,
   and Proton-installed games live on the host filesystem, so the game sees and reports its own
   location through `Z:`. This is much better than the `C:\` case originally assumed.

3. **The Steam root is `~/.local/share/Steam`**, not `~/.steam/steam`. Confirms that multi-root
   discovery is genuinely required — a single hardcoded Linux default would have been wrong for
   this user.

4. **Game files are on the host filesystem** under `steamapps/common`, not inside the
   `compatdata/<appid>/pfx` prefix. Confirms the original structural analysis.

### Why this shrinks blocker #4

The translation no longer needs to locate the Wine prefix, resolve `compatdata/<appid>/pfx/drive_c`,
or read any Steam config. It is a two-line string transform:

```ts
const host = winePath.replace(/^[Zz]:/, '').replace(/\\/g, '/');
```

Verified locally (Node 22) against the exact payload string:

```
raw from API   : Z:\home\tebro\.local\share\Steam\steamapps\common\Le Mans Ultimate\UserData\Replays\
BROKEN (posix) : /development/lmu-steward/Log/Results          <- what the code does today
translated     : /home/tebro/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Replays/
FIXED (posix)  : /home/tebro/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results
WINDOWS (win32): C:\Program Files (x86)\...\Le Mans Ultimate\UserData\Log\Results   <- unaffected
```

Note how bad the current failure actually is: because backslashes aren't separators on POSIX, the
entire path collapses to a single relative segment, and the `..` in `'../Log/Results'` then pops it
off completely. The result is `<cwd>/Log/Results` — a plausible-looking path with **no trace of the
original directory in it**. It fails `ENOENT`, the error is swallowed at `replay.ts:1057`, and the
user sees replays with zero incidents and zero penalties. Silent and total.

Keep a `C:\` → prefix fallback branch for robustness (unusual drive mappings, non-Steam installs),
but `Z:\` is the expected path and should be the primary case.

### Unrelated finding worth its own ticket

The payload contains metadata fields the codebase does not model: `eventId`, `eventTitle`,
`eventType`, `seriesId`, `splitNo`. These do **not** appear in the repo's Windows fixture
(`fixture-test-set/replay-api-response.json`), so they're new — either a newer LMU build or
online-event replays specifically, not a Linux difference. Also, `LMUReplay.id` is typed `string`
in `types.ts` but the API returns a number.

Neither breaks anything today (extra JSON fields are ignored; `id` is only used in a template
literal at `replay.ts:1343`), but `eventTitle` and `splitNo` look like genuinely useful dashboard
data. **Out of scope for the Linux port — worth a separate look.**

---

## What already works unchanged

The reason the estimate is low. Stated explicitly so we don't re-investigate later:

- **All game control is HTTP.** `LMU_API_BASE_URL: 'http://localhost:6397'` (`constants.ts:2`).
  Confirmed reachable from the Linux host under Proton. Everything in `api-status.ts`,
  `camera.ts`, `session.ts`, `profile.ts`, and all replay playback/seek/HUD control in `replay.ts`
  is portable as-is.
- **One `process.platform` check in the entire app** — `main.ts:595`, the standard macOS quit idiom.
- **Storage is already cross-platform.** `local-data-store.ts:39` uses `app.getPath('userData')`.
  better-sqlite3 only needs a per-platform native rebuild, already wired through `electron-rebuild`.
- **electron-builder already declares a Linux target** (`linux: { target: ["AppImage"] }`).
- **`closeLmu` is already portable** — an HTTP `NAV_EXIT` call, not a process kill.

---

## The four blockers

### 1. Hardcoded Windows default paths

**Where:** `constants.ts:3-6`, consumed at `user-settings.ts:11-12`, UI placeholders at
`UserSettings.tsx:965,984`.

```
'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\...'
```

Field data confirms at least these Linux roots must be probed:

- `~/.local/share/Steam` ← **confirmed in use**
- `~/.steam/steam`
- `~/.var/app/com.valvesoftware.Steam/data/Steam` (Flatpak)
- Any additional library listed in `libraryfolders.vdf`

**Fix:** replace the constants with a resolver that enumerates candidate roots.

### 2. Path validation is Windows-only and fails hard

**Where:** `user-settings.ts:34-77`

`normalizeWindowsPath` rewrites `/` → `\` and lowercases. Validation then requires a `.exe`
basename, a literal `\le mans ultimate\` segment, and a `userdata\replays` substring.

Not merely cosmetic: on POSIX, backslash is not a separator, so
`path.basename('c:\\...\\le mans ultimate.exe')` returns **the entire string**. The executable
check can never pass, and every settings save is rejected.

The single most load-bearing function to rewrite.

**Verifiable today:** the existing test at `user-settings.test.ts:31` ("accepts valid path with
mixed separators and casing") passes on Windows and would **fail** on Linux for exactly this
reason. See "Order of operations".

### 3. Launching the game

**Where:** `lmu-launch.ts`

`spawn(executablePath)` on a `.exe` (`lmu-launch.ts:85`) does nothing on Linux. The whole
"executable path" concept is wrong there — the correct action is handing
`steam://rungameid/<appid>` to `shell.openExternal`, letting Steam apply the user's own Proton
version and launch options.

Related surface:

- File picker filters `extensions: ['exe']` — `lmu-launch.ts:161`
- `normalizeExecutablePath` appends `Le Mans Ultimate.exe` to any directory — `lmu-launch.ts:23-34`

**Fix:** a launch-target abstraction rather than a path; strategy differs per platform.

### 4. The game's own API returns Wine paths

**Where:** `replay.ts:1040`

```ts
const logDataDirectory = resolve(replayDirectory, '../Log/Results');
```

With `replayDirectory` being a `Z:\...` Wine path, this silently resolves to `<cwd>/Log/Results`
on Linux. `readdir` throws, `findBestLogFile` fails, `getReplayLogData` swallows it and returns
`null` (`replay.ts:1057`). The app looks fine and reports zero incidents for every replay.

**Fix:** the `Z:` → `/` transform documented above, applied at the API boundary. Because the
failure is silent, this layer must log loudly on translation failure rather than returning null.

**Remember:** `replayDirectory` is part of the replay cache identity key (`replay.ts:152`), so
changing translation invalidates cached replays. Bump `REPLAY_CACHE_SCHEMA_VERSION` when this
lands.

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
- **`wine-paths.ts`** — `toHostPath(winePath)`. Identity on Windows; `Z:` transform on Linux with a
  `C:` → prefix fallback. Pure, fully unit-testable without a Linux machine.
- **`launcher.ts`** — `launchGame()`, spawn-exe on Windows, `steam://rungameid` on Linux.

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

- Wine → host path translation (pure string logic, 100% coverage — and we now have a real payload
  to use as a fixture)
- Path validation for both platforms
- Default path resolution and `libraryfolders.vdf` parsing (inject an fs port, or use `memfs` to
  simulate a Linux Steam tree)
- Launch *strategy selection* (assert it picks `steam://` vs `spawn`; mock the side effect)
- All renderer/UI tests

### Needs a Linux environment — but GitHub Actions covers most of it free

Adding `ubuntu-latest` to the `test.yml` matrix is a one-line change and catches:

- better-sqlite3 compiling and loading on Linux
- AppImage packaging producing a working binary (where the `asarUnpack` backslash bug surfaces)
- Any test that accidentally depends on Windows path semantics
- Real `app.getPath('userData')` values

### Needs real hardware

- `shell.openExternal` handing off to Steam (needs a real desktop session)
- Live end-to-end against a running game

---

## Do we need to dual-boot?

Not to start, and possibly not at all.

**Tier 0 — free. ✅ DONE (2026-07-30).** Obtained the real `/rest/watch/replays` payload from a
Linux user. This answered the two highest-risk unknowns and simplified blocker #4. See "Confirmed
field data".

**Tier 1 — a VM, a few hours. ← recommended next.** Install Linux + Steam + LMU in
VirtualBox/VMware/Hyper-V without GPU passthrough. LMU won't *run*, but it will **install**,
creating the real `steamapps/common` tree, the `compatdata/<appid>/pfx` prefix, and a real
`libraryfolders.vdf`. Validates default-path discovery, Steam library enumeration, path
validation, AppImage packaging, native module loading, and the settings UI. Roughly 70% of the
work. Cheap and reversible.

**Tier 2 — real hardware, for the remainder.** `steam://rungameid` launch and true end-to-end
against a running game. If we go here, use a **separate SSD** rather than repartitioning the
Windows drive: same result, far less risk to the working install. A persistent live USB
technically works, but LMU is a large re-download, so it's a poor fit.

**Realistic path:** Tier 0 + Tier 1 gets to a releasable beta. Ship as "Linux support —
experimental" and let a Linux user close the loop on Tier 2. Normal way to ship a port for a game
you can't run locally. We already have a willing Linux user in the loop — worth asking whether
they'd beta test.

---

## Effort estimate

| Phase | Days |
|---|---|
| Platform modules + default path resolution | 1.5 |
| Rewrite path validation + fix tests | 1 |
| Launch abstraction (Steam URL) | 1 |
| Wine path translation + cache version bump | ~1 *(was 2–3, reduced by field data)* |
| Packaging fix, Linux CI job, AppImage/deb targets | 1 |
| Settings UI strings + README/docs | 0.5 |
| Validation on real Linux + Proton + LMU | 2–3 |

**Total: ~7–10 dev days.**

---

## Open questions

1. ~~**Whether LMU's REST server binds reachably from the host under Proton.**~~
   ✅ **RESOLVED 2026-07-30** — confirmed by a successful native `curl` from a Linux host.
2. ~~**What path format the game reports under Proton.**~~
   ✅ **RESOLVED 2026-07-30** — `Z:\` Wine drive paths. Two-line transform, no prefix lookup.
3. **The Steam AppID for Le Mans Ultimate.** Believed to be `2399420`, still **unverified**. The
   entire launch path depends on it. Easy to confirm with the same Linux contact, or from a Steam
   store URL.
4. **AppImage auto-update.** electron-updater supports AppImage, but the AppImage must run from a
   writable location. `.deb` does not auto-update. Decide which targets to ship.

---

## Order of operations

1. **Add `ubuntu-latest` to the `test.yml` matrix.** One line. Confirms the diagnosis with real CI
   output rather than analysis — `user-settings.test.ts:31` should go red for the reason in
   blocker #2.
2. ~~Ask a Linux LMU user for the `/rest/watch/replays` payload.~~ ✅ Done.
3. Confirm the Steam AppID (open question #3) — same contact, one message.
4. Build the platform modules with injected platform + `path.win32`/`path.posix`; test both
   platforms from Windows. Use the captured payload above as a test fixture.
5. Spin up the VM once the code exists, to validate discovery and packaging (Tier 1).
6. Ask the Linux contact to beta test (Tier 2), rather than buying hardware.

---

## The alternative worth keeping on the table

Ship the **existing Windows build** and document running it inside the same Proton prefix as the
game. Zero code changes, zero path translation — the app sees the same Windows filesystem the game
does.

Costs: worse install story, no auto-update, Wine-rendered Electron UI.

Not a good product, but a legitimate stopgap to gauge Linux demand before spending two weeks.
Weaker now that the native path has been de-risked, but keep it as a fallback if the port stalls.
