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
