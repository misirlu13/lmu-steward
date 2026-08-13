## 1.5.0 (2026-08-13)

* Merge pull request #13 from misirlu13/feature/persistent-filter-user-setting ([1c0fe22](https://github.com/misirlu13/lmu-steward/commit/1c0fe22)), closes [#13](https://github.com/misirlu13/lmu-steward/issues/13)
* Merge pull request #14 from misirlu13/feature/delete-replay ([12733d0](https://github.com/misirlu13/lmu-steward/commit/12733d0)), closes [#14](https://github.com/misirlu13/lmu-steward/issues/14)
* Merge pull request #15 from misirlu13/feature/import-replays ([f0aed97](https://github.com/misirlu13/lmu-steward/commit/f0aed97)), closes [#15](https://github.com/misirlu13/lmu-steward/issues/15)
* Merge pull request #16 from misirlu13/feature/driver-dashboard ([2db407b](https://github.com/misirlu13/lmu-steward/commit/2db407b)), closes [#16](https://github.com/misirlu13/lmu-steward/issues/16)
* Merge pull request #17 from misirlu13/fix/clean-install-build ([456fe6b](https://github.com/misirlu13/lmu-steward/commit/456fe6b)), closes [#17](https://github.com/misirlu13/lmu-steward/issues/17)
* Merge pull request #18 from misirlu13/feature/live-steward ([ced8ffd](https://github.com/misirlu13/lmu-steward/commit/ced8ffd)), closes [#18](https://github.com/misirlu13/lmu-steward/issues/18)
* Merge pull request #19 from misirlu13/fix/pre-release-fixes ([839121a](https://github.com/misirlu13/lmu-steward/commit/839121a)), closes [#19](https://github.com/misirlu13/lmu-steward/issues/19)
* Merge pull request #20 from misirlu13/feature/v1.5.0-update ([f5b359f](https://github.com/misirlu13/lmu-steward/commit/f5b359f)), closes [#20](https://github.com/misirlu13/lmu-steward/issues/20)
* docs: drop the design documents that moved to plans/ ([3884503](https://github.com/misirlu13/lmu-steward/commit/3884503))
* docs: point the design-document references at plans/ ([a0e70f9](https://github.com/misirlu13/lmu-steward/commit/a0e70f9))
* docs: rewrite the README around live stewarding, career and hand-offs ([d673f59](https://github.com/misirlu13/lmu-steward/commit/d673f59))
* docs(contributing): document auditing replay files after an LMU update ([0d0a933](https://github.com/misirlu13/lmu-steward/commit/0d0a933))
* docs(live-steward): record what the camera spike found ([2bedcd8](https://github.com/misirlu13/lmu-steward/commit/2bedcd8))
* fix: fixed multiple issues across the app and updated the replay banner to survive a restart ([c434cbc](https://github.com/misirlu13/lmu-steward/commit/c434cbc))
* fix: let an excluded session be counted again ([833517c](https://github.com/misirlu13/lmu-steward/commit/833517c))
* fix: read replay event data on sync, and surface events by type ([7bafda0](https://github.com/misirlu13/lmu-steward/commit/7bafda0))
* fix(build): back the two-copy better-sqlite3 split at install time ([748fcc3](https://github.com/misirlu13/lmu-steward/commit/748fcc3))
* fix(build): back the two-copy better-sqlite3 split at install time ([abc44c8](https://github.com/misirlu13/lmu-steward/commit/abc44c8))
* fix(build): record the optional platform bindings in the lockfile ([ee84f02](https://github.com/misirlu13/lmu-steward/commit/ee84f02))
* fix(build): record the optional platform bindings in the lockfile ([4a1d1d0](https://github.com/misirlu13/lmu-steward/commit/4a1d1d0))
* fix(import): restore captured sessions on every import path ([ab2e8d9](https://github.com/misirlu13/lmu-steward/commit/ab2e8d9))
* fix(live-steward): aim the camera when rewatching an incident ([f219b27](https://github.com/misirlu13/lmu-steward/commit/f219b27))
* fix(live-steward): never persist an incident without a session ([9935fb7](https://github.com/misirlu13/lmu-steward/commit/9935fb7))
* fix(live-steward): stop a captured session splitting in two ([84c476f](https://github.com/misirlu13/lmu-steward/commit/84c476f))
* fix(nav): send replay detail back to the replay list ([a61915f](https://github.com/misirlu13/lmu-steward/commit/a61915f))
* fix(replay): align the close-replay tests with the dedicated button ([3d8b714](https://github.com/misirlu13/lmu-steward/commit/3d8b714))
* fix(replay): match each restarted race to its own result log ([4950685](https://github.com/misirlu13/lmu-steward/commit/4950685))
* fix(replay): match logs on the event DateTime, not the session one ([a4ee544](https://github.com/misirlu13/lmu-steward/commit/a4ee544))
* fix(replay): never delete a result log the import did not write ([28c1e3a](https://github.com/misirlu13/lmu-steward/commit/28c1e3a))
* fix(replay): pass creation-time stamping values through the environment ([206311c](https://github.com/misirlu13/lmu-steward/commit/206311c))
* fix(replay): read replays from current LMU builds ([398b50a](https://github.com/misirlu13/lmu-steward/commit/398b50a))
* fix(replay): read rosters containing accented names and short content ids ([25f84ce](https://github.com/misirlu13/lmu-steward/commit/25f84ce))
* fix(replay): report why a replay file could not be read ([343bfcd](https://github.com/misirlu13/lmu-steward/commit/343bfcd))
* fix(replay): resolve export paths in the main process ([52ef667](https://github.com/misirlu13/lmu-steward/commit/52ef667))
* fix(replay): store the log summary imported replays render from ([29caa07](https://github.com/misirlu13/lmu-steward/commit/29caa07))
* fix(ui): use the muted divider on every segmented button but the last ([d43d938](https://github.com/misirlu13/lmu-steward/commit/d43d938))
* feat: added archive feature on replays and replay dashboard ([703416c](https://github.com/misirlu13/lmu-steward/commit/703416c))
* feat: added bulk import from folder and zip file ([794729a](https://github.com/misirlu13/lmu-steward/commit/794729a))
* feat: added live capture data to export ([192c6e5](https://github.com/misirlu13/lmu-steward/commit/192c6e5))
* feat: added optional note for importing and fixed webpack build issue ([bb3c250](https://github.com/misirlu13/lmu-steward/commit/bb3c250))
* feat: added persistent filter setting to persist filters after application is closed ([2c1a5a7](https://github.com/misirlu13/lmu-steward/commit/2c1a5a7))
* feat: added specific close button on replay and driver view ([91d10e0](https://github.com/misirlu13/lmu-steward/commit/91d10e0))
* feat: added sqllite to moduleMapper ([3d36651](https://github.com/misirlu13/lmu-steward/commit/3d36651))
* feat: added sqllite to moduleMapper ([96644f0](https://github.com/misirlu13/lmu-steward/commit/96644f0))
* feat: added weekend/bulk export on replay dashboard ([81129fb](https://github.com/misirlu13/lmu-steward/commit/81129fb))
* feat: driver career dashboard built from result logs ([648cf8a](https://github.com/misirlu13/lmu-steward/commit/648cf8a))
* feat: explain the career scan controls ([ee51577](https://github.com/misirlu13/lmu-steward/commit/ee51577))
* feat: fixed multiple side car instance from running at a single time ([f216ec6](https://github.com/misirlu13/lmu-steward/commit/f216ec6))
* feat: label the driver dashboard filters ([26fdc1a](https://github.com/misirlu13/lmu-steward/commit/26fdc1a))
* feat: one canonical pass over a result log, producing career facts ([5b66162](https://github.com/misirlu13/lmu-steward/commit/5b66162))
* feat: pace, rivals, habits and milestones on the driver dashboard ([768d6d3](https://github.com/misirlu13/lmu-steward/commit/768d6d3))
* feat: updated live pressure monitor and added live track map ([27c0473](https://github.com/misirlu13/lmu-steward/commit/27c0473))
* feat(build): ship the live capture sidecar ([b251edd](https://github.com/misirlu13/lmu-steward/commit/b251edd))
* feat(live-steward): add the timing screen, session header and camera bar ([05d9fa2](https://github.com/misirlu13/lmu-steward/commit/05d9fa2))
* feat(live-steward): added first pass for live steward feature with exported data ([7bb9ab6](https://github.com/misirlu13/lmu-steward/commit/7bb9ab6))
* feat(live-steward): added pressure monitor ([c7d2e33](https://github.com/misirlu13/lmu-steward/commit/c7d2e33))
* feat(live-steward): ask the game what it is showing ([7fd7aad](https://github.com/misirlu13/lmu-steward/commit/7fd7aad))
* feat(live-steward): draw the field on a live track map ([40a0a8b](https://github.com/misirlu13/lmu-steward/commit/40a0a8b))
* feat(live-steward): filter the incidents queue and record deferrals ([6739ec7](https://github.com/misirlu13/lmu-steward/commit/6739ec7))
* feat(live-steward): gate live capture behind two switches ([cdba30f](https://github.com/misirlu13/lmu-steward/commit/cdba30f))
* feat(live-steward): gate replay loading and badge pending captures ([abb9bee](https://github.com/misirlu13/lmu-steward/commit/abb9bee))
* feat(live-steward): give captured sessions its own view ([e581189](https://github.com/misirlu13/lmu-steward/commit/e581189))
* feat(live-steward): let a league define its own penalty tariff ([ebf5bd5](https://github.com/misirlu13/lmu-steward/commit/ebf5bd5))
* feat(live-steward): list and delete captured sessions ([9f50861](https://github.com/misirlu13/lmu-steward/commit/9f50861))
* feat(live-steward): persist live sessions, incidents and evidence ([f84e1f9](https://github.com/misirlu13/lmu-steward/commit/f84e1f9))
* feat(live-steward): plot steering in the incident trace ([79cfb61](https://github.com/misirlu13/lmu-steward/commit/79cfb61))
* feat(live-steward): read the session fields the sidecar ignored ([c1730cf](https://github.com/misirlu13/lmu-steward/commit/c1730cf))
* feat(live-steward): record decisions under the steward's own name ([c90f9e4](https://github.com/misirlu13/lmu-steward/commit/c90f9e4))
* feat(live-steward): review a past session segment without leaving the live view ([34ce466](https://github.com/misirlu13/lmu-steward/commit/34ce466))
* feat(live-steward): split the live view into a shell with a section rail ([99b2cd3](https://github.com/misirlu13/lmu-steward/commit/99b2cd3))
* feat(live-steward): surface a driver's record and capture reasoning ([758e95a](https://github.com/misirlu13/lmu-steward/commit/758e95a))
* feat(live-steward): testing the live-steward feature ([09fb540](https://github.com/misirlu13/lmu-steward/commit/09fb540))
* feat(replay): add imported_replays store and roster-based log pairing ([5a13d80](https://github.com/misirlu13/lmu-steward/commit/5a13d80))
* feat(replay): export a session from the dashboard row menu ([8475e43](https://github.com/misirlu13/lmu-steward/commit/8475e43))
* feat(replay): import a replay from an explicit .Vcr and log pair ([851a481](https://github.com/misirlu13/lmu-steward/commit/851a481))
* feat(replay): import alongside an existing replay instead of refusing ([299f3a5](https://github.com/misirlu13/lmu-steward/commit/299f3a5))
* feat(replay): import replays into the LMU installation ([c37be21](https://github.com/misirlu13/lmu-steward/commit/c37be21))
* feat(replay): read track and roster metadata from .Vcr files ([bb12d35](https://github.com/misirlu13/lmu-steward/commit/bb12d35))
* feat(replay): wire replay import and export into the dashboard ([32a5c76](https://github.com/misirlu13/lmu-steward/commit/32a5c76))
* feat(settings): add experimental features toggle and disclosure card ([e60461a](https://github.com/misirlu13/lmu-steward/commit/e60461a))
* test(live-api): check what the app believes about LMU against a running LMU ([909a573](https://github.com/misirlu13/lmu-steward/commit/909a573))
* test(storage): hold the legacy-store staleness guard ([675a0cc](https://github.com/misirlu13/lmu-steward/commit/675a0cc))
* test(storage): hold the legacy-store staleness guard ([8d0809b](https://github.com/misirlu13/lmu-steward/commit/8d0809b))
* style: clear the 10 prettier errors lint could never reach ([899ddca](https://github.com/misirlu13/lmu-steward/commit/899ddca))
* chore: merge v1.5.0 branch ([78aaad2](https://github.com/misirlu13/lmu-steward/commit/78aaad2))
* chore(api): delete the dead and broken track-thumbnail channel ([aaa6ab4](https://github.com/misirlu13/lmu-steward/commit/aaa6ab4))
* chore(renderer): delete the dead SVGOptions.pitStroke ([d73a5ce](https://github.com/misirlu13/lmu-steward/commit/d73a5ce))
* chore(replay): delete the dead ReplaySeekBar ([187b8e7](https://github.com/misirlu13/lmu-steward/commit/187b8e7))
* refactor: fixed CI issue ([e9f3e5b](https://github.com/misirlu13/lmu-steward/commit/e9f3e5b))
* refactor(live-steward): drop the incident key from the dossier header ([aa3dffd](https://github.com/misirlu13/lmu-steward/commit/aa3dffd))
* perf: summarise the results directory once per sync instead of once per replay ([4f081d2](https://github.com/misirlu13/lmu-steward/commit/4f081d2))
* perf(live-steward): stop shipping trace windows on every poll tick ([d5fc33f](https://github.com/misirlu13/lmu-steward/commit/d5fc33f))

## 1.4.0 (2026-07-28)

* Merge pull request #12 from misirlu13/feature/lmu-1.4.0-updates ([5b5664e](https://github.com/misirlu13/lmu-steward/commit/5b5664e)), closes [#12](https://github.com/misirlu13/lmu-steward/issues/12)
* feat(constants): added Daytona and Laguna Seca to supported tracks ([ce2b663](https://github.com/misirlu13/lmu-steward/commit/ce2b663))

## 1.3.0 (2026-07-27)

* Merge pull request #11 from misirlu13/feature/performance-updates ([36b39a0](https://github.com/misirlu13/lmu-steward/commit/36b39a0)), closes [#11](https://github.com/misirlu13/lmu-steward/issues/11)
* chore(package.json): fixed build issue when running in test env ([4d06e97](https://github.com/misirlu13/lmu-steward/commit/4d06e97))
* chore(package.json): updated dependencies ([2fdbbe3](https://github.com/misirlu13/lmu-steward/commit/2fdbbe3))
* refactor: added warning text to launch LMU sections ([5f7d288](https://github.com/misirlu13/lmu-steward/commit/5f7d288))
* feat: added crash logger to LMU Steward ([fb1252b](https://github.com/misirlu13/lmu-steward/commit/fb1252b))
* feat(filter): add game type filter to replay list page ([e4c2c52](https://github.com/misirlu13/lmu-steward/commit/e4c2c52))
* feat(performance): improved performance by streaming prased xml ([9d11289](https://github.com/misirlu13/lmu-steward/commit/9d11289))
* fix(launch lmu): fixed an issue where LMU Steward would launch LMU with its window hidden ([bfee7ad](https://github.com/misirlu13/lmu-steward/commit/bfee7ad))

## 1.2.0 (2026-03-31)

* Merge pull request #5 from misirlu13/feature/v1.3.0-lmu-updates ([fe90267](https://github.com/misirlu13/lmu-steward/commit/fe90267)), closes [#5](https://github.com/misirlu13/lmu-steward/issues/5)
* test(usereplayvieworchestration.test): fixed barcelona test ([8d26b53](https://github.com/misirlu13/lmu-steward/commit/8d26b53))
* feat(constants): added support for new tracks and layouts with LMU v1.3.0 ([3609fad](https://github.com/misirlu13/lmu-steward/commit/3609fad))

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
