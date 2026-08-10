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
 */

const projectRoot = path.resolve(__dirname, '..', '..');
const spikeDir = path.join(projectRoot, 'tools', 'live-capture-spike');
const buildScript = path.join(spikeDir, 'build.bat');
const output = path.join(spikeDir, 'build', 'lmu-spike.exe');

if (process.platform !== 'win32') {
  console.log(
    chalk.yellow(
      'Skipping the live capture sidecar: it is Windows-only. ' +
        'Live capture will report itself detached in this build.',
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
  console.log(
    chalk.whiteBright.bgRed.bold('Could not run the sidecar build script.'),
  );
  console.log(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.log(`
 ${chalk.whiteBright.bgRed.bold('The live capture sidecar failed to build.')}

 It needs an MSVC toolset. Install "Desktop development with C++" from the
 Visual Studio Installer, or the standalone Build Tools for Visual Studio.

 ${chalk.bold('This is a packaging failure, not a warning.')} A build that
 shipped without it would install cleanly and then never capture anything,
 which is the exact silent failure this step exists to prevent.
 `);
  process.exit(result.status ?? 1);
}

// The build script reports its own success, but electron-builder's
// extraResources entry fails confusingly if the file is missing, so confirm the
// artifact really landed where packaging expects it.
if (!fs.existsSync(output)) {
  console.log(
    chalk.whiteBright.bgRed.bold(
      `The sidecar build reported success but ${path.relative(
        projectRoot,
        output,
      )} does not exist.`,
    ),
  );
  process.exit(1);
}

console.log(
  chalk.green(`Sidecar ready: ${path.relative(projectRoot, output)}`),
);
