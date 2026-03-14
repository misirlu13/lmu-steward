## 1.1.0 (2026-03-14)

* Merge pull request #3 from misirlu13/feature/replay-match-log-scoring ([d45c624](https://github.com/misirlu13/lmu-steward/commit/d45c624)), closes [#3](https://github.com/misirlu13/lmu-steward/issues/3)
* feat(constants.ts): updated the remaining TRACK_META_DATA alises that were missing ([d5c736a](https://github.com/misirlu13/lmu-steward/commit/d5c736a))
* feat(replay.ts): completely revamped the replay to log algorithm ([de8eea0](https://github.com/misirlu13/lmu-steward/commit/de8eea0))
* docs(readme.md): removed log match threshold from docs ([1839c8d](https://github.com/misirlu13/lmu-steward/commit/1839c8d))
* docs(readme.md): updated readme description removing certain application settings ([2468f13](https://github.com/misirlu13/lmu-steward/commit/2468f13))
* test(replay): updated replay and user setting tests to match new behavior ([c2536c6](https://github.com/misirlu13/lmu-steward/commit/c2536c6))

## 1.0.0 (2026-03-12)

* feat: removed semantic release "release" feature so it doesn't conflict with the public GH action ([599c9f0](https://github.com/misirlu13/lmu-steward/commit/599c9f0))
* feat: updated readme and added contributing document ([85e6e6b](https://github.com/misirlu13/lmu-steward/commit/85e6e6b))
* feat: updating semantic release workflow ([7716ef3](https://github.com/misirlu13/lmu-steward/commit/7716ef3))
* feat(menu.ts): updated about URL paths ([3e0f18c](https://github.com/misirlu13/lmu-steward/commit/3e0f18c))
* feat(package.json): updated package.json description ([f99b451](https://github.com/misirlu13/lmu-steward/commit/f99b451))
* docs(changelog.md): updated auto generated changelog ([722293f](https://github.com/misirlu13/lmu-steward/commit/722293f))
* docs(readme.md): updated readme with screenshots of the application ([f778d4d](https://github.com/misirlu13/lmu-steward/commit/f778d4d))
* Added codeowners file for repo ([9daf9cf](https://github.com/misirlu13/lmu-steward/commit/9daf9cf))
* Added log threshold setting configuration as well as replay cache bust ([7abcb8b](https://github.com/misirlu13/lmu-steward/commit/7abcb8b))
* Added replay sync progress feature to notify users of the overall ([e3944b0](https://github.com/misirlu13/lmu-steward/commit/e3944b0))
* Initial LMU Steward import ([0d662e5](https://github.com/misirlu13/lmu-steward/commit/0d662e5))
* Merge branch 'main' of https://github.com/misirlu13/lmu-steward ([127966d](https://github.com/misirlu13/lmu-steward/commit/127966d))
* Merge branch 'main' of https://github.com/misirlu13/lmu-steward ([0ac65be](https://github.com/misirlu13/lmu-steward/commit/0ac65be))
* Merge branch 'main' of https://github.com/misirlu13/lmu-steward ([9df5a33](https://github.com/misirlu13/lmu-steward/commit/9df5a33))
* Removing codeql workflow ([10c240c](https://github.com/misirlu13/lmu-steward/commit/10c240c))
* Reverting changes from GH actions ([2eb193f](https://github.com/misirlu13/lmu-steward/commit/2eb193f))
* Started working on context menu and updated funding file ([4182c16](https://github.com/misirlu13/lmu-steward/commit/4182c16))
* Trying to fix GH action ([962285e](https://github.com/misirlu13/lmu-steward/commit/962285e))
* Updated github action to only support windows testing ([130d9e8](https://github.com/misirlu13/lmu-steward/commit/130d9e8))
* Updated github actions ([8f3a051](https://github.com/misirlu13/lmu-steward/commit/8f3a051))
* Updated publish workflow permissions and added semantic release ([542e1ff](https://github.com/misirlu13/lmu-steward/commit/542e1ff))
* Updated view header UX and removed duplicated information from navbar. ([3574bfe](https://github.com/misirlu13/lmu-steward/commit/3574bfe))
* Updating publish GH command to publish packaged application ([cf3b577](https://github.com/misirlu13/lmu-steward/commit/cf3b577))
* chore(release): 1.0.0 [skip ci]\n\n## 1.0.0 (2026-03-11) ([8b552ec](https://github.com/misirlu13/lmu-steward/commit/8b552ec))
* chore(release): 1.0.0 [skip ci]\n\n## 1.0.0 (2026-03-11) ([a22e0d6](https://github.com/misirlu13/lmu-steward/commit/a22e0d6))
* chore(release): 1.0.0 [skip ci]\n\n## 1.0.0 (2026-03-12) ([71af6c7](https://github.com/misirlu13/lmu-steward/commit/71af6c7))
* chore(release): 1.0.0 [skip ci]\n\n## 1.0.0 (2026-03-12) ([cb622b9](https://github.com/misirlu13/lmu-steward/commit/cb622b9))
* ci: updated GH actions to allow manual trigger of publish ([a435712](https://github.com/misirlu13/lmu-steward/commit/a435712))

# Changelog

All notable changes to LMU Steward are documented in this file.

## Unreleased

- No unreleased changes yet.

## 1.0.0 (2026-03-12)

### The First Green Flag

LMU Steward rolls onto the grid for its first public release.

This is the debut version of a desktop companion built specifically for Le Mans Ultimate players who want more than a replay list and a vague memory of turn one. LMU Steward turns raw session and replay data into something you can actually review: cleaner race summaries, searchable incidents, driver-by-driver breakdowns, and fast ways to jump straight to the moments that mattered.

### What Is In The Garage

- A replay dashboard that groups sessions by event weekend so Practice, Qualifying, and Race sessions stay together instead of becoming a folder archaeology project.
- Rich sorting and filtering across session date, track, session type, session length, class format, field size, car class, and incident severity.
- Session Analysis views with high-level race context including laps completed, duration, driver count, incidents, car classes, and weather.
- A full incident timeline with timestamps, incident types, involved drivers, and jump controls for moving the LMU replay camera straight to the moment.
- An incident hotspot heatmap so problem corners stop hiding in plain sight.
- Driver standings with class badges, fastest laps, incident totals, and a Risk Index to quickly spot the calm, the chaotic, and the completely unavoidable.
- A dedicated Driver Analysis view with incident history, performance metrics, likely fault patterns, counterparty trends, penalty reasons, and lap-by-lap detail.
- Quick View mode for reviewing session data before a replay is fully loaded in LMU, with clear handoff points for unlocking playback-dependent actions.
- In-session chat viewing so race context includes what was said, not just what happened.
- Replay sync tooling with automatic sync, launch-time sync, manual sync, visible sync progress, and replay library refresh controls.
- User settings for LMU executable paths, replay directory paths, profile sync, cache behavior, and replay browsing preferences.
- Built-in LMU launch support plus disconnected-state handling so the app remains useful even when the game or API is not ready.

### Launch Notes

- The app is purpose-built for Le Mans Ultimate rather than a generic racing log viewer.
- The goal of 1.0.0 is simple: make stewarding, reviewing incidents, and understanding a session dramatically faster than doing it by hand.
