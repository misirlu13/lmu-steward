import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  resolve as resolvePath,
  sep,
} from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { Entry, open, ZipFile } from 'yauzl';

/**
 * Reads the archives export writes, and the ones a steward is handed.
 *
 * yazl, which writes them, cannot read — so this is a second dependency rather
 * than the other half of the same one. Kept apart from the import logic so the
 * zip-slip guard below has one place to live and one place to be tested.
 */

/** A weekend can hold thousands of entries; anything past this is not one. */
const MAX_ENTRIES = 10_000;

export interface ArchiveEntrySummary {
  /** Path inside the archive, exactly as stored. */
  entryName: string;
  uncompressedSize: number;
  isDirectory: boolean;
}

export interface ArchiveSummary {
  entries: ArchiveEntrySummary[];
  /** What extraction will occupy on disk. Drives the free-space check. */
  totalUncompressedBytes: number;
}

const openArchive = (archivePath: string): Promise<ZipFile> =>
  new Promise((resolve, reject) => {
    open(archivePath, { lazyEntries: true, autoClose: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? new Error('That archive could not be opened.'));
        return;
      }

      resolve(zip);
    });
  });

const isDirectoryEntry = (entryName: string): boolean =>
  entryName.endsWith('/');

/**
 * Where an archive entry is allowed to land.
 *
 * A zip entry name is attacker-controlled data — a steward opens archives sent
 * by strangers — and nothing stops one from reading `..\..\Windows\System32\`
 * or `C:\Windows\...`. Rejecting rather than sanitizing: an archive containing
 * such a path is not a Steward export and not a hand-off, and silently
 * rewriting the path would extract a file the sender did not intend anywhere
 * the user could reason about.
 *
 * Returns null for anything that would not land strictly inside the target.
 */
export const resolveArchiveEntryPath = (
  targetDirectory: string,
  entryName: string,
): string | null => {
  // Zip stores forward slashes; a backslash here is either an escape attempt
  // or a non-conforming writer, and both are safer treated as one segment.
  if (entryName.includes('\\') || entryName.includes('\0')) {
    return null;
  }

  if (isAbsolute(entryName) || /^[a-zA-Z]:/.test(entryName)) {
    return null;
  }

  const segments = entryName.split('/').filter(Boolean);

  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    return null;
  }

  const root = resolvePath(targetDirectory);
  const candidate = resolvePath(root, join(...segments));

  /*
   * Re-checked after resolving rather than trusted from the segment scan.
   * Normalisation, trailing dots and Windows' own path rules can all move a
   * path after the fact, and this is the property that actually matters.
   */
  if (candidate !== root && !normalize(candidate).startsWith(root + sep)) {
    return null;
  }

  return candidate;
};

/**
 * Lists what an archive holds without extracting any of it.
 *
 * Reads the central directory only, so it costs nothing on a multi-GB weekend
 * and gives the free-disk check a total to work with before anything is
 * written.
 */
export const inspectArchive = async (
  archivePath: string,
): Promise<ArchiveSummary> => {
  const zip = await openArchive(archivePath);

  return new Promise((resolve, reject) => {
    const entries: ArchiveEntrySummary[] = [];
    let totalUncompressedBytes = 0;

    zip.on('entry', (entry: Entry) => {
      if (entries.length >= MAX_ENTRIES) {
        zip.close();
        reject(
          new Error(
            `That archive holds more than ${MAX_ENTRIES} files, which is more than a replay hand-off ever should.`,
          ),
        );
        return;
      }

      const isDirectory = isDirectoryEntry(entry.fileName);

      entries.push({
        entryName: entry.fileName,
        uncompressedSize: entry.uncompressedSize,
        isDirectory,
      });

      if (!isDirectory) {
        totalUncompressedBytes += entry.uncompressedSize;
      }

      zip.readEntry();
    });

    zip.on('error', reject);
    zip.on('end', () => resolve({ entries, totalUncompressedBytes }));

    zip.readEntry();
  });
};

export interface ExtractProgress {
  bytesWritten: number;
  totalBytes: number;
  currentEntry: string;
}

export interface ExtractResult {
  /** Absolute paths of every file written. */
  files: string[];
  /** Entries refused by the path guard, so the user can be told. */
  rejectedEntries: string[];
}

/**
 * Extracts an archive into a directory this app owns.
 *
 * Entries are written one at a time rather than in parallel: these are 400 MB
 * replays, and several concurrent streams would compete for the same disk for
 * no gain while making progress meaningless.
 */
export const extractArchive = async (
  archivePath: string,
  targetDirectory: string,
  onProgress?: (progress: ExtractProgress) => void,
): Promise<ExtractResult> => {
  const { totalUncompressedBytes } = await inspectArchive(archivePath);
  const zip = await openArchive(archivePath);

  await mkdir(targetDirectory, { recursive: true });

  return new Promise((resolve, reject) => {
    const files: string[] = [];
    const rejectedEntries: string[] = [];
    let bytesWritten = 0;

    const fail = (error: unknown) => {
      zip.close();
      reject(error);
    };

    zip.on('entry', (entry: Entry) => {
      const destination = resolveArchiveEntryPath(
        targetDirectory,
        entry.fileName,
      );

      if (!destination) {
        rejectedEntries.push(entry.fileName);
        zip.readEntry();
        return;
      }

      if (isDirectoryEntry(entry.fileName)) {
        mkdir(destination, { recursive: true })
          .then(() => {
            zip.readEntry();
            return null;
          })
          .catch(fail);
        return;
      }

      zip.openReadStream(entry, (error, readStream) => {
        if (error || !readStream) {
          fail(error ?? new Error(`Could not read ${entry.fileName}.`));
          return;
        }

        /*
         * Bytes are counted by a Transform inside the pipeline, never by a
         * 'data' listener on the read stream.
         *
         * Attaching 'data' switches a stream into flowing mode the moment it is
         * added, so it starts emitting before `pipeline` has attached the
         * writable — and every chunk that arrives in that window is dropped on
         * the floor. It does not error. It silently writes a short file, which
         * for a .Vcr means a replay whose trailer no longer parses and for a
         * manifest means JSON that will not load.
         */
        const countBytes = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytesWritten += chunk.length;
            onProgress?.({
              bytesWritten,
              totalBytes: totalUncompressedBytes,
              currentEntry: entry.fileName,
            });
            callback(null, chunk);
          },
        });

        const write = async () => {
          await mkdir(dirname(destination), { recursive: true });
          await pipeline(
            readStream,
            countBytes,
            createWriteStream(destination),
          );
          files.push(destination);
          zip.readEntry();
        };

        /*
         * yauzl hands the stream back through a callback and expects the next
         * `readEntry` only once this one is drained, so the await has to happen
         * here. Rejections are routed to `fail`, which closes the archive and
         * rejects the outer promise.
         */
        // eslint-disable-next-line promise/no-promise-in-callback
        write().catch(fail);
      });
    });

    zip.on('error', reject);
    zip.on('end', () => resolve({ files, rejectedEntries }));

    zip.readEntry();
  });
};
