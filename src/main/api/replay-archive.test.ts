/**
 * The suite default is jsdom, which has no `setImmediate` — yazl's write pump
 * needs it, so this file runs against node.
 *
 * @jest-environment node
 */

/*
 * Writes a real archive to a real temp directory and reads its bytes back.
 *
 * yazl is write-only, so this walks the zip's local file headers directly
 * rather than extracting. That is enough to assert the two properties the
 * layout depends on and that nothing else here can check: the entries land in
 * the directory structure the layout decided on, and the replay data goes in
 * stored rather than deflated.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ArchiveEntry, writeArchive } from './replay-export';

const LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP64_END_OF_CENTRAL_DIRECTORY = Buffer.from([0x50, 0x4b, 0x06, 0x06]);

const COMPRESSION_METHOD_OFFSET = 8;
const FILE_NAME_LENGTH_OFFSET = 26;
const FILE_NAME_OFFSET = 30;

interface ArchivedEntry {
  name: string;
  /** 0 is stored, 8 is deflate. */
  compressionMethod: number;
}

/**
 * Reads the entry name and compression method out of every local file header.
 *
 * Sizes are not read: yazl streams, so it writes them as zero in the local
 * header and follows the data with a descriptor. The test content is chosen so
 * the header signature cannot occur inside it.
 */
const readArchivedEntries = (archive: Buffer): ArchivedEntry[] => {
  const entries: ArchivedEntry[] = [];
  let offset = archive.indexOf(LOCAL_FILE_HEADER);

  while (offset !== -1) {
    const nameLength = archive.readUInt16LE(offset + FILE_NAME_LENGTH_OFFSET);

    entries.push({
      name: archive
        .subarray(
          offset + FILE_NAME_OFFSET,
          offset + FILE_NAME_OFFSET + nameLength,
        )
        .toString('utf8'),
      compressionMethod: archive.readUInt16LE(
        offset + COMPRESSION_METHOD_OFFSET,
      ),
    });

    offset = archive.indexOf(LOCAL_FILE_HEADER, offset + FILE_NAME_OFFSET);
  }

  return entries;
};

describe('main/archive writing', () => {
  let workingDirectory = '';

  beforeEach(() => {
    workingDirectory = mkdtempSync(join(tmpdir(), 'lmu-steward-archive-'));
  });

  afterEach(() => {
    rmSync(workingDirectory, { recursive: true, force: true });
  });

  const buildEntries = (): { entries: ArchiveEntry[]; replay: Buffer } => {
    const replay = Buffer.alloc(4096, 0x5a);
    const log = Buffer.from('<RaceResults></RaceResults>', 'utf8');

    const replayPath = join(workingDirectory, 'Monza R1 2.Vcr');
    const logPath = join(workingDirectory, '2026_07_18_22_37_06-39R1.xml');

    writeFileSync(replayPath, replay);
    writeFileSync(logPath, log);

    return {
      replay,
      entries: [
        {
          source: { buffer: Buffer.from('{"kind":"weekend"}') },
          entryName: 'lmu-steward-export.json',
        },
        {
          source: { filePath: replayPath },
          entryName: '03 Race - Monza R1 2/Monza R1 2.Vcr',
        },
        {
          source: { filePath: logPath },
          entryName: '03 Race - Monza R1 2/2026_07_18_22_37_06-39R1.xml',
        },
      ],
    };
  };

  it('writes each session into its own directory inside the archive', async () => {
    const { entries } = buildEntries();
    const destination = join(workingDirectory, 'weekend.zip');

    await writeArchive(entries, destination);

    const archived = readArchivedEntries(readFileSync(destination));

    expect(archived.map((entry) => entry.name)).toEqual([
      'lmu-steward-export.json',
      '03 Race - Monza R1 2/Monza R1 2.Vcr',
      '03 Race - Monza R1 2/2026_07_18_22_37_06-39R1.xml',
    ]);
  });

  /**
   * .Vcr data is already packed, so deflating several GB of it would be a long
   * freeze for no meaningful size win. Method 0 is stored; 8 would be deflate.
   */
  it('stores entries rather than deflating them', async () => {
    const { entries, replay } = buildEntries();
    const destination = join(workingDirectory, 'weekend.zip');

    await writeArchive(entries, destination);

    const archive = readFileSync(destination);

    expect(
      readArchivedEntries(archive).map((entry) => entry.compressionMethod),
    ).toEqual([0, 0, 0]);
    // Stored means the replay's bytes are in the archive unchanged.
    expect(archive.includes(replay)).toBe(true);
  });

  /**
   * A single .Vcr can approach the 4 GB boundary and a weekend passes it
   * comfortably, past which the classic end-of-central-directory cannot address
   * the archive. Forced on regardless of size, so it cannot depend on whether
   * the boundary happened to be crossed.
   */
  it('writes a zip64 end of central directory', async () => {
    const { entries } = buildEntries();
    const destination = join(workingDirectory, 'weekend.zip');

    await writeArchive(entries, destination);

    expect(
      readFileSync(destination).includes(ZIP64_END_OF_CENTRAL_DIRECTORY),
    ).toBe(true);
  });

  /**
   * Several 400 MB files take minutes, so the window has to show something
   * moving. Progress is byte-based because yazl reports nothing per entry.
   */
  it('reports bytes as they are written', async () => {
    const { entries } = buildEntries();
    const destination = join(workingDirectory, 'weekend.zip');
    const reported: number[] = [];

    await writeArchive(entries, destination, (bytesWritten) =>
      reported.push(bytesWritten),
    );

    expect(reported.length).toBeGreaterThan(0);
    // Monotonic, and it ends at the size of the file on disk.
    expect([...reported].sort((a, b) => a - b)).toEqual(reported);
    expect(reported[reported.length - 1]).toBe(
      readFileSync(destination).length,
    );
  });
});
