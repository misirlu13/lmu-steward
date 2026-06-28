# Contributing

Thanks for contributing to LMU Steward.

This file is intentionally focused on development workflows so the README can stay product/user focused.

## Prerequisites

- Node.js 22
- npm 10+
- Git

## Common Commands

- Install dependencies: `npm ci`
- Start app (dev): `npm start`
- Start app with LMU dev mode: `npm run start:devmode`
- Run tests: `npm test`
- Run lint: `npm run lint`
- Fix lint issues: `npm run lint:fix`
- Build app bundles: `npm run build`
- Build distributable package locally: `npm run package`

## Release Commands

- Dry-run release (semantic-release): `npm run release:dry`
- Run release (CI): `npm run release`

## Release Flow (CI)

1. Push to `main` or `beta`.
2. `.github/workflows/release.yml` runs semantic-release.
3. semantic-release calculates the next version and creates/pushes a tag (`vX.Y.Z`).
4. `.github/workflows/publish.yml` triggers on tags and publishes Windows artifacts.

## Commit Style

Use Conventional Commits.

Examples:

- `feat: add replay lap filter`
- `fix: handle missing profile avatar`
- `chore: update test fixtures`

## Pull Requests

Before opening a PR:

- Run `npm run lint`
- Run `npm test`
- Verify app starts with `npm start`

Keep PRs focused and include a clear summary of behavior changes.

## Local Data Storage

This project now uses SQLite as the primary local persistence backend.

### Current Storage Model

- Primary backend: `better-sqlite3`
- Database file: `lmu-steward.sqlite` in Electron `userData`
- Compatibility backend: legacy `electron-store` JSON files
- Cutover behavior: immediate SQLite read/write, with automatic fallback to legacy JSON if SQLite initialization or migration fails
- Legacy retention: old JSON files are kept for one release cycle unless the user explicitly clears local storage

### Where It Is Implemented

- Shared storage bootstrap, migration, and fallback: `src/main/storage/local-data-store.ts`
- Replay cache schema enforcement: `src/main/api/replay.ts`
- User settings persistence: `src/main/api/user-settings.ts`
- Profile cache persistence: `src/main/api/profile.ts`
- Storage-focused tests: `src/main/storage/local-data-store.test.ts`

### What Is Migrated

On first SQLite-backed launch, the app imports these legacy `electron-store` files if they exist:

- `lmu-steward-store.json`
- `lmu-steward-profile-cache.json`

Imported domains:

- replay cache
- replay cache schema metadata
- user settings
- cached profile info

The legacy JSON files are not deleted during normal migration.

### Replay Cache Schema

Replay cache invalidation remains schema-based.

- Bump `REPLAY_CACHE_SCHEMA_VERSION` in `src/main/api/replay.ts` when persisted replay data becomes incompatible.
- Replay cache schema enforcement runs on startup.
- App version bumps do not, by themselves, clear replay cache.

Examples of when to bump:

- replay cache object shape changes
- replay hash/identity semantics change incompatibly
- persisted replay-derived fields become unsafe to reuse

### Failure Behavior

If SQLite setup or legacy-to-SQLite migration fails:

- the app automatically falls back to legacy `electron-store`
- app startup should continue
- no user action is required to keep the app functional

### Clearing Local Storage

Clear Local Storage wipes the active backend and removes retained legacy JSON files so stale data is not re-imported on next startup.

### Test Checklist (Automated)

Run:

- `npm test -- src/main/storage/local-data-store.test.ts src/main/api/replay.migration.test.ts src/main/api/replay.test.ts src/main/api/user-settings.test.ts`

Expected coverage:

- legacy JSON migrates into SQLite on first access
- SQLite initialization failure falls back to legacy `electron-store`
- replay schema mismatch clears replay cache on startup
- replay API behavior remains green
- user settings validation and persistence behavior remain green

### Manual Verification In Dev

1. Start the app once.
2. In the Debug menu, open the local data store.
3. Confirm the SQLite file exists at the Electron `userData` path.
4. In renderer devtools, run `await window.electron.debug.getStorageInfo()`.
5. Confirm `backend` is `sqlite` and `primaryPath` points to `lmu-steward.sqlite`.
6. If `backend` is `legacy`, SQLite initialization or migration failed and the app is running on the retained Electron Store fallback.
7. If legacy JSON files already existed, confirm the app still launches and previous data is available.
8. To verify replay cache busting, increment `REPLAY_CACHE_SCHEMA_VERSION` and relaunch.
9. If you want to observe an empty replay cache before repopulation, temporarily disable `syncOnAppLaunch` or `automaticSyncEnabled` in settings.
