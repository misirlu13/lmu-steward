/**
 * Jest project for the live-API contract tests.
 *
 * These tests talk to a running Le Mans Ultimate on localhost:6397. They are a
 * SEPARATE project, not a tag or a skip, so that the default `npx jest` cannot
 * collect them even by accident — a contract test that goes red on every CI run
 * teaches everyone to ignore it, which is worse than not having it.
 *
 * Run them deliberately:  npm run test:live-api
 *
 * The suffix is `.live.test.ts`, NOT `.contract.test.ts`: that name was already
 * taken by `session.contract.test.ts`, an offline fixture-shape test that
 * belongs in the default suite. Claiming it here would have silently evicted
 * that file from `npx jest`.
 *
 * The base config lives in package.json. Everything below is an override, and
 * `testPathIgnorePatterns` is spelled out in full on purpose: setting it here
 * REPLACES the project's list rather than extending it, so dropping a pattern
 * silently drags the compiled copies under .erb/dll into the run.
 */
const baseConfig = require('./package.json').jest;

module.exports = {
  ...baseConfig,

  // No DOM: this suite is main-process code and HTTP, with no renderer in it.
  testEnvironment: 'node',

  // The default setup asserts a webpack build exists. Irrelevant here, and it
  // would fail the run for a reason that has nothing to do with the contract.
  setupFiles: [],

  // The ONLY files this project collects.
  testMatch: ['<rootDir>/src/**/*.live.test.ts'],

  // All three patterns or none — see the note above.
  testPathIgnorePatterns: ['release/app/dist', '.erb/dll', '.claude'],

  // A cold LMU can take a moment on the first connection (~2 s of setup on a
  // fresh pool, which is the connection and not the endpoint).
  testTimeout: 30000,
};
