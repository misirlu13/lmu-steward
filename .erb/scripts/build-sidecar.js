import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { spawnSync } from 'child_process';

/**
 * Builds the live capture sidecar that electron-builder copies into the
 * packaged app as `resources/lmu-spike.exe`.
 *
 * The sidecar reads Le Mans Ultimate's shared memory, which is a Windows-only
 * facility, so this is a no-op everywhere else — the mac and Linux targets
 * package without it and live capture reports itself detached at runtime.
 *
 * It does NOT need a Le Mans Ultimate installation. The shared memory layout is
 * declared in tools/live-capture-spike/lmu-shared-memory-layout.hpp precisely so
 * a CI runner can produce this binary. It does need an MSVC toolset, which the
 * GitHub windows runners ship with.
 *
 * `--optional` is the development contract, used by `prestart`.
 *
 * Packaging must fail hard when the sidecar cannot be built: a build that
 * shipped without it installs cleanly and then never captures anything, which
 * is the silent failure this step exists to prevent. Starting the app in
 * development is the opposite case — someone working on the renderer should not
 * be blocked by a missing C++ toolset, and an app without a sidecar still runs
 * and reports live capture detached, exactly as the mac and Linux builds do.
 *
 * `--optional` also skips the compile when the binary is already newer than its
 * sources, because `build.bat` has no up-to-date check of its own and this now
 * runs on every `npm start`. Packaging deliberately never takes that shortcut.
 */

const projectRoot = path.resolve(__dirname, '..', '..');
const spikeDir = path.join(projectRoot, 'tools', 'live-capture-spike');
const buildScript = path.join(spikeDir, 'build.bat');
const output = path.join(spikeDir, 'build', 'lmu-spike.exe');

const isOptional = process.argv.includes('--optional');

/** Everything the compiled binary is derived from. */
const sources = [
  path.join(spikeDir, 'main.cpp'),
  path.join(spikeDir, 'lmu-shared-memory-layout.hpp'),
  buildScript,
];

/**
 * Whether the binary already reflects every source it is built from.
 *
 * Compared against the newest source rather than any single one, so editing
 * either the entry point or the vendored layout header rebuilds. A missing
 * source is treated as "cannot tell", which rebuilds rather than skips.
 */
const isUpToDate = () => {
  if (!fs.existsSync(output)) {
    return false;
  }

  try {
    const builtAt = fs.statSync(output).mtimeMs;
    return sources.every((source) => fs.statSync(source).mtimeMs <= builtAt);
  } catch {
    return false;
  }
};

/**
 * Ends the run the way the caller asked for.
 *
 * Development is warned and allowed to continue; packaging stops.
 */
const giveUp = (message) => {
  if (isOptional) {
    console.log(
      chalk.yellow(
        `${message}\nContinuing without it — live capture will report itself detached. ` +
          'Run "npm run build:sidecar" once a C++ toolset is installed.',
      ),
    );
    process.exit(0);
  }

  console.log(chalk.whiteBright.bgRed.bold(message));
  process.exit(1);
};

if (process.platform !== 'win32') {
  console.log(
    chalk.yellow(
      'Skipping the live capture sidecar: it is Windows-only. ' +
        'Live capture will report itself detached in this build.',
    ),
  );
  process.exit(0);
}

if (isOptional && isUpToDate()) {
  console.log(
    chalk.green(
      `Live capture sidecar is up to date: ${path.relative(projectRoot, output)}`,
    ),
  );
  process.exit(0);
}

console.log(chalk.bold('Building the live capture sidecar...'));

const result = spawnSync('cmd.exe', ['/c', buildScript], {
  cwd: spikeDir,
  stdio: 'inherit',
});

if (result.error) {
  console.log(result.error.message);
  giveUp('Could not run the sidecar build script.');
}

if (result.status !== 0) {
  console.log(`
 It needs an MSVC toolset. Install "Desktop development with C++" from the
 Visual Studio Installer, or the standalone Build Tools for Visual Studio.
 `);
  /*
    Fatal when packaging, a warning when starting in development. A build that
    shipped without the sidecar would install cleanly and then never capture
    anything, which is the exact silent failure this step exists to prevent —
    but a developer working on the renderer has no use for it and should not be
    stopped at the door.
  */
  giveUp('The live capture sidecar failed to build.');
}

// The build script reports its own success, but electron-builder's
// extraResources entry fails confusingly if the file is missing, so confirm the
// artifact really landed where packaging expects it.
if (!fs.existsSync(output)) {
  giveUp(
    `The sidecar build reported success but ${path.relative(
      projectRoot,
      output,
    )} does not exist.`,
  );
}

console.log(
  chalk.green(`Sidecar ready: ${path.relative(projectRoot, output)}`),
);
