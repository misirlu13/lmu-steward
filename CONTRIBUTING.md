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

## Replay Cache Schema Migration

This project uses `electron-store` migrations for replay cache upgrades.

### Critical Notes (Easy To Miss)

- App version bump alone does not clear replay cache.
- Replay cache clears only when `REPLAY_CACHE_SCHEMA_VERSION` changes.
- Use valid semver in root `package.json` (example: `1.2.0-dev.2`, not `1.2.0.-dev.2`).
- If `automaticSyncEnabled` and `syncOnAppLaunch` are true, replay cache can repopulate right after launch.

### Where It Is Implemented

- Replay store initialization and migration hooks: `src/main/api/replay.ts`
- Store type: `types.ts` (`LMUStewardStore`)
- Migration-focused tests: `src/main/api/replay.migration.test.ts`
- Replay behavior tests: `src/main/api/replay.test.ts`

### Current Migration Model

- `electron-store` runs migration steps on application version changes.
- Replay cache invalidation is schema-based, not app-version-based.
- Cache bust happens when stored `replayCacheSchemaVersion` differs from `REPLAY_CACHE_SCHEMA_VERSION`.
- Replay schema enforcement runs on startup, so cache busting no longer depends on whether a range-based migration key is selected for the current app version.
- Migration metadata keys (`replayCacheMigratedFromAppVersion`, `replayCacheMigratedToAppVersion`) are written automatically by `beforeEachMigration`.

### When To Bump The Replay Cache Schema

Bump `REPLAY_CACHE_SCHEMA_VERSION` in `src/main/api/replay.ts` when replay cache structure or semantics change in a way that makes existing cached entries unsafe or stale.

Examples:

- Changing replay cache object shape (adding/removing/renaming persisted fields)
- Changing how replay identity/hash is derived in a non-backward-compatible way
- Changing assumptions that affect correctness of persisted replay analysis fields

Do not bump for unrelated refactors that keep persisted replay data compatible.

### What You Should Not Edit Manually

- Do not manually change `replayCacheMigratedFromAppVersion`.
- Do not manually change `replayCacheMigratedToAppVersion`.

These fields are migration audit metadata and are set automatically.

### Test Checklist (Automated)

Run:

- `npm test -- src/main/api/replay.migration.test.ts src/main/api/replay.test.ts`

Expected coverage:

- Schema mismatch clears `replays` and updates `replayCacheSchemaVersion`.
- Schema match does not clear cache.
- Migration hook records from/to app versions.
- Existing replay API behavior remains green.

### Triggering Migrations In Dev Mode

To reliably trigger `electron-store` migrations in local development:

1. Ensure the root `package.json` has a top-level `version` field.
2. Start the app once (`npm start` or `npm run start:devmode`).
3. Stop the app.
4. Bump `version` in root `package.json` (for example `1.2.0-dev.1` -> `1.2.0-dev.2`).
5. Start the app again.

This triggers an app-version migration pass.

Note: replay cache schema busting is checked on startup regardless of migration-step selection. App-version migration bumps are still useful when validating migration metadata fields.

To force an actual replay cache bust during that pass:

1. Increment `REPLAY_CACHE_SCHEMA_VERSION` in `src/main/api/replay.ts`.
2. Repeat the app version bump and restart flow above.

If you want to observe an empty `replays` object before repopulation:

1. Temporarily disable `syncOnAppLaunch` (or `automaticSyncEnabled`) in user settings.
2. Run the schema bump + app version bump flow.
3. Launch app and inspect store before manual sync.

### Manual Verification In Dev

In Debug mode, use the app menu item that opens `lmu-steward-store.json` and verify:

- `replayCacheSchemaVersion` equals the code constant.
- `replayCacheMigratedFromAppVersion` and `replayCacheMigratedToAppVersion` updated after version bump.
- `replays` is cleared only when schema version changed.
