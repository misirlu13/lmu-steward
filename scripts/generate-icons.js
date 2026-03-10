const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(projectRoot, 'assets');
const iconsDir = path.join(assetsDir, 'icons');
const sourceIcon = path.join(assetsDir, '_icon.png');

if (!fs.existsSync(sourceIcon)) {
  throw new Error(`Source icon not found: ${sourceIcon}`);
}

if (fs.existsSync(iconsDir)) {
  fs.rmSync(iconsDir, { recursive: true, force: true });
}

execFileSync(
  process.execPath,
  [
    path.join(projectRoot, 'node_modules', 'electron-icon-builder', 'index.js'),
    '--input',
    sourceIcon,
    '--output',
    assetsDir,
    '--flatten',
  ],
  {
    stdio: 'inherit',
    cwd: projectRoot,
  },
);

const generatedIconIco = path.join(iconsDir, 'icon.ico');
const generatedIconIcns = path.join(iconsDir, 'icon.icns');
const generatedBasePng = path.join(iconsDir, '512x512.png');

if (!fs.existsSync(generatedIconIco) || !fs.existsSync(generatedIconIcns)) {
  throw new Error('electron-icon-builder did not generate expected icon files');
}

if (!fs.existsSync(generatedBasePng)) {
  throw new Error('electron-icon-builder did not generate 512x512.png');
}

fs.copyFileSync(generatedIconIco, path.join(assetsDir, 'icon.ico'));
fs.copyFileSync(generatedIconIcns, path.join(assetsDir, 'icon.icns'));
fs.copyFileSync(generatedBasePng, path.join(assetsDir, 'icon.png'));

const obsoleteSvgIcon = path.join(assetsDir, 'icon.svg');
if (fs.existsSync(obsoleteSvgIcon)) {
  fs.rmSync(obsoleteSvgIcon, { force: true });
}

console.log('Electron icons generated from assets/_icon.png');
