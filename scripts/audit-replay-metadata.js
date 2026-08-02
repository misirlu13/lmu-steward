#!/usr/bin/env node

/*
 * Parses every .Vcr in the given directories and reports what came back.
 *
 * LMU's replay format is not stable. A single library can hold several header
 * versions and several shapes of metadata blob, and the reader has been broken
 * more than once by a change that no fixture covered — a new blob layout, UTF-8
 * names it rejected as invalid, a content id that was not the expected length.
 *
 * The failure mode that matters is quiet: a replay whose trailer parses but
 * whose roster comes back empty still imports, it just silently stops verifying
 * that the replay and the result log belong together. So an empty roster is
 * reported as a failure here, not a curiosity.
 *
 * Usage:
 *   node scripts/audit-replay-metadata.js [directory...]
 *
 * With no arguments it checks the default LMU replay folder.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_DIRECTORIES = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays',
];

const MAGIC = Buffer.from([0x0a, 0x49, 0x52, 0x53, 0x52]); // "\nIRSR"
const MAGIC_OFFSET = 0x2c;
const VERSION_OFFSET = 0x31;
const POINTER_OFFSET = 0x35;
const HEADER_LENGTH = 0x40;
const MAX_FIELD_LENGTH = 4096;

const readHeader = (filePath) => {
  const fd = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(HEADER_LENGTH);

  try {
    fs.readSync(fd, header, 0, HEADER_LENGTH, 0);
  } finally {
    fs.closeSync(fd);
  }

  return {
    magicOk: header
      .subarray(MAGIC_OFFSET, MAGIC_OFFSET + MAGIC.length)
      .equals(MAGIC),
    version: header[VERSION_OFFSET],
    pointer: header.readUInt32LE(POINTER_OFFSET),
  };
};

const readBlobKeys = (filePath, pointer) => {
  const { size } = fs.statSync(filePath);

  if (pointer <= 0 || pointer >= size) {
    return '(bad pointer)';
  }

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(Math.min(MAX_FIELD_LENGTH, size - pointer));

  try {
    fs.readSync(fd, buffer, 0, buffer.length, pointer);
  } finally {
    fs.closeSync(fd);
  }

  const length = buffer.readUInt32LE(0);
  if (length <= 0 || length > MAX_FIELD_LENGTH) {
    return '(bad length prefix)';
  }

  try {
    const blob = buffer.subarray(4, 4 + length).toString('utf8');
    return Object.keys(JSON.parse(blob)).sort().join(',');
  } catch {
    return '(unparseable blob)';
  }
};

const tally = (counts, key) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const main = async () => {
  const directories = process.argv.slice(2).length
    ? process.argv.slice(2)
    : DEFAULT_DIRECTORIES;

  // Imported lazily: the reader is TypeScript, so this needs ts-node's hooks.
  require('ts-node/register/transpile-only');
  // eslint-disable-next-line global-require
  const { readVcrTrailer } = require('../src/main/api/vcr-metadata');

  const versions = {};
  const blobShapes = {};
  const failures = [];
  let total = 0;

  for (const directory of directories) {
    if (!fs.existsSync(directory)) {
      console.error(`Skipping missing directory: ${directory}`);
      continue;
    }

    const files = fs
      .readdirSync(directory)
      .filter((file) => /\.vcr$/i.test(file));

    for (const file of files) {
      const filePath = path.join(directory, file);
      total += 1;

      const header = readHeader(filePath);
      tally(versions, `magic=${header.magicOk} version=${header.version}`);
      tally(blobShapes, readBlobKeys(filePath, header.pointer));

      // eslint-disable-next-line no-await-in-loop
      const trailer = await readVcrTrailer(filePath);

      if (!trailer) {
        failures.push(`${file} — unreadable (version ${header.version})`);
      } else if (trailer.drivers.length === 0) {
        failures.push(
          `${file} — parsed but empty roster (version ${header.version})`,
        );
      }
    }
  }

  console.log(`Replays scanned: ${total}`);
  console.log('\nHeader versions:');
  Object.entries(versions).forEach(([key, count]) =>
    console.log(`  ${count.toString().padStart(5)}  ${key}`),
  );
  console.log('\nMetadata blob shapes:');
  Object.entries(blobShapes).forEach(([key, count]) =>
    console.log(`  ${count.toString().padStart(5)}  ${key}`),
  );

  console.log(`\nFailures: ${failures.length}`);
  failures.forEach((failure) => console.log(`  ${failure}`));

  if (failures.length > 0) {
    console.log(
      '\nA new header version or blob shape usually means the reader needs' +
        '\nupdating. See src/main/api/vcr-metadata.ts.',
    );
    process.exitCode = 1;
  }
};

main();
