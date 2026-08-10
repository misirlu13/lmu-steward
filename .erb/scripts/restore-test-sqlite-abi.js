/**
 * Put the root copy of better-sqlite3 back on the Node ABI after
 * `electron-builder install-app-deps` has run.
 *
 * install-app-deps rebuilds every native module it finds, in the root tree as
 * well as in release/app, so it leaves BOTH copies on the Electron ABI. The
 * jest suites reach real SQLite through the "^better-sqlite3$" moduleNameMapper
 * entry, which points at the root copy, and jest runs under plain Node — so an
 * Electron-ABI root copy fails five storage tests on a fresh clone.
 *
 * release/app is deliberately left alone: it keeps the Electron build the app
 * needs at runtime.
 */
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const rootCopy = path.join(repoRoot, 'node_modules', 'better-sqlite3');

// Constructing is the only honest test. require() succeeds on a wrong-ABI
// module because it only loads the JS wrapper; the .node file is not opened
// until a Database is created.
const probe = `new (require(${JSON.stringify(rootCopy)}))(':memory:').close()`;

function loadsUnderNode() {
  try {
    execFileSync(process.execPath, ['-e', probe], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

if (!fs.existsSync(rootCopy)) {
  // better-sqlite3 is a root devDependency; a production install won't have it.
  process.exit(0);
}

if (!loadsUnderNode()) {
  console.log(
    'Rebuilding node_modules/better-sqlite3 for the Node ABI (jest needs it; release/app keeps the Electron build)...',
  );
  execSync('npm rebuild better-sqlite3', { cwd: repoRoot, stdio: 'inherit' });
}

// @electron/rebuild records what it built in build/Release/.forge-meta and
// skips the module when the marker already matches its target. npm rebuild
// swaps the binary without touching that marker, so leaving it in place would
// leave the root copy claiming an Electron ABI it no longer has. Drop it: a
// later install-app-deps should rebuild this copy and let us undo it again,
// rather than skip it on the strength of a stale claim.
const forgeMeta = path.join(rootCopy, 'build', 'Release', '.forge-meta');
if (fs.existsSync(forgeMeta)) {
  fs.rmSync(forgeMeta);
}

if (!loadsUnderNode()) {
  console.error(
    `
Failed to restore node_modules/better-sqlite3 to the Node ABI.

  jest resolves "better-sqlite3" to the root copy via moduleNameMapper and runs
  under Node (ABI ${process.versions.modules}), so src/main/storage tests will fail until this
  copy loads under Node. Try:

      npm rebuild better-sqlite3

  and check that a Node prebuild is reachable for this platform.
`,
  );
  process.exit(1);
}
