/*
 * Exercises import against a real temp filesystem laid out like an LMU install,
 * with synthetic .Vcr files built from the layout in vcr-metadata.test.ts.
 *
 * Creation-time stamping is mocked. It shells out to PowerShell, which is
 * verified against the running game rather than here — what this suite asserts
 * is that it is called with the event time, and that a failure rolls the row
 * back instead of leaving a mis-dated file behind.
 */
/* eslint-disable import/first */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { ImportedReplayStore } from '@types';
import { generateReplayHash } from '../util';
import {
  deleteImportedReplays,
  fingerprintFile,
  importReplays,
  readLogCandidate,
  scanImportSource,
} from './replay-import';
import * as replayImport from './replay-import';
/* eslint-enable import/first */

const MAGIC_OFFSET = 0x2c;
const POINTER_OFFSET = 0x35;
const HEADER_LENGTH = 0x40;

const lengthPrefixed = (value: string): Buffer => {
  const body = Buffer.from(value, 'latin1');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(body.length, 0);
  return Buffer.concat([prefix, body]);
};

const bytePrefixed = (value: string): Buffer =>
  Buffer.concat([Buffer.from([value.length]), Buffer.from(value, 'latin1')]);

const buildVcr = (
  sceneDesc: string,
  session: string,
  driverNames: string[],
): Buffer => {
  const trailer = Buffer.concat([
    lengthPrefixed(JSON.stringify({ sceneDesc, session })),
    lengthPrefixed(`${sceneDesc}.SCN`),
    lengthPrefixed(`${sceneDesc}.AIW`),
    lengthPrefixed('Monza_2023'),
    lengthPrefixed('1.27'),
    lengthPrefixed('8cd7325da1ec405aa0358a60a7d79fc1616b05041491164ae829aa488'),
    lengthPrefixed(
      'C:\\Games\\Le Mans Ultimate\\Installed\\Locations\\Monza_2023\\1.27\\',
    ),
    Buffer.alloc(24),
  ]);

  const count = Buffer.alloc(4);
  count.writeUInt32LE(driverNames.length, 0);

  const drivers = Buffer.concat([
    count,
    Buffer.from([0x00]),
    ...driverNames.map((name, index) =>
      Buffer.concat([
        bytePrefixed(name),
        bytePrefixed(`${index}_26_TEAM`),
        bytePrefixed(''),
        bytePrefixed(name),
        bytePrefixed(String(index + 1)),
        Buffer.alloc(28),
      ]),
    ),
  ]);

  const body = Buffer.alloc(256, 0x41);
  const header = Buffer.alloc(HEADER_LENGTH);
  header[MAGIC_OFFSET] = 0x0a;
  header.write('IRSR', MAGIC_OFFSET + 1, 'latin1');
  header.writeUInt32LE(HEADER_LENGTH + body.length, POINTER_OFFSET);

  return Buffer.concat([header, body, trailer, drivers]);
};

const buildLog = (
  eventDateTime: number,
  sessionDateTime: number,
  sessionTag: 'Race' | 'Qualify' | 'Practice1',
  driverNames: string[],
): string =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rFactorXML version="1.0">',
    '<RaceResults>',
    `<DateTime>${eventDateTime}</DateTime>`,
    '<TrackVenue>Autodromo Nazionale Monza</TrackVenue>',
    '<TrackCourse>Autodromo Nazionale Monza</TrackCourse>',
    '<TrackEvent>Autodromo Nazionale Monza</TrackEvent>',
    `<${sessionTag}>`,
    `<DateTime>${sessionDateTime}</DateTime>`,
    ...driverNames.map((name) => `<Driver><Name>${name}</Name></Driver>`),
    `</${sessionTag}>`,
    '</RaceResults>',
    '</rFactorXML>',
  ].join('\n');

const EVENT_ONE = 1784396019;
const EVENT_TWO = 1784398360;

const GRID_ONE = ['Anna One', 'Bob Two', 'Cara Three', 'Dan Four', 'Eve Five'];
const GRID_TWO = [
  'Frank Six',
  'Gita Seven',
  'Hal Eight',
  'Iris Nine',
  'Jon Ten',
];

describe('main/replay import', () => {
  let root: string;
  let source: string;
  let replayDirectory: string;
  let logDirectory: string;
  let stampSpy: jest.SpyInstance;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lmu-steward-import-'));
    source = join(root, 'handoff');
    replayDirectory = join(root, 'UserData', 'Replays');
    logDirectory = join(root, 'UserData', 'Log', 'Results');

    mkdirSync(source, { recursive: true });
    mkdirSync(replayDirectory, { recursive: true });
    mkdirSync(logDirectory, { recursive: true });

    writeFileSync(
      join(source, 'Autodromo Nazionale Monza R1 2.Vcr'),
      buildVcr('MONZAWEC', 'RACE', [...GRID_TWO, 'Local Player']),
    );
    writeFileSync(
      join(source, 'event-one-race.xml'),
      buildLog(EVENT_ONE, EVENT_ONE + 1800, 'Race', GRID_ONE),
    );
    writeFileSync(
      join(source, 'event-two-race.xml'),
      buildLog(EVENT_TWO, EVENT_TWO + 2000, 'Race', GRID_TWO),
    );

    stampSpy = jest
      .spyOn(replayImport, 'setFileCreationTime')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    stampSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  const scan = async () =>
    (await scanImportSource({ sourceDirectory: source, imported: {} })).rows;

  it('reads the event DateTime from a log, not the session one', async () => {
    const candidate = await readLogCandidate(
      join(source, 'event-two-race.xml'),
    );

    expect(candidate?.eventDateTime).toBe(EVENT_TWO);
    expect(candidate?.session).toBe('RACE');
    expect(candidate?.driverNames).toEqual(GRID_TWO);
  });

  it('pairs a replay with the log whose grid matches', async () => {
    const rows = await scan();

    expect(rows).toHaveLength(1);
    expect(rows[0].pairing.proposed?.candidate.fileName).toBe(
      'event-two-race.xml',
    );
    expect(rows[0].alreadyImportedHash).toBeNull();
  });

  it('skips an in-progress .tmp recording', async () => {
    writeFileSync(join(source, '_vcr7239104.tmp'), Buffer.alloc(4096));

    const rows = await scan();

    expect(rows.map((row) => row.vcrFileName)).toEqual([
      'Autodromo Nazionale Monza R1 2.Vcr',
    ]);
  });

  it('copies both files and stamps the replay with the event time', async () => {
    const rows = await scan();
    const logPath = rows[0].pairing.proposed!.candidate.filePath;

    const result = await importReplays({
      rows,
      selections: [
        { id: rows[0].id, logPath, method: 'roster', confidence: 0.8 },
      ],
      replayDirectory,
      logDirectory,
      imported: {},
    });

    expect(result.outcomes[0].status).toBe('imported');
    expect(
      existsSync(join(replayDirectory, 'Autodromo Nazionale Monza R1 2.Vcr')),
    ).toBe(true);
    expect(existsSync(join(logDirectory, 'event-two-race.xml'))).toBe(true);

    expect(stampSpy).toHaveBeenCalledWith(
      join(replayDirectory, 'Autodromo Nazionale Monza R1 2.Vcr'),
      EVENT_TWO,
    );

    const record = Object.values(result.imported)[0];
    expect(record).toMatchObject({
      replayName: 'Autodromo Nazionale Monza R1 2',
      sceneDesc: 'MONZAWEC',
      session: 'RACE',
      timestamp: EVENT_TWO,
      vcrFileName: 'Autodromo Nazionale Monza R1 2.Vcr',
      logFileName: 'event-two-race.xml',
    });
  });

  /*
   * Collisions are the normal case, not an edge case: LMU counts replay names
   * per install, so any steward who has raced at a track already holds the
   * names an incoming league replay from that track arrives with.
   */
  describe('name collisions', () => {
    const importOnce = async () => {
      const rows = await scan();
      return importReplays({
        rows,
        selections: [
          {
            id: rows[0].id,
            logPath: rows[0].pairing.proposed!.candidate.filePath,
            method: 'roster',
            confidence: 0.8,
          },
        ],
        replayDirectory,
        logDirectory,
        imported: {},
      });
    };

    it('imports alongside an existing replay rather than overwriting it', async () => {
      const ownRecording = Buffer.from('the users own recording');
      writeFileSync(
        join(replayDirectory, 'Autodromo Nazionale Monza R1 2.Vcr'),
        ownRecording,
      );

      const result = await importOnce();

      expect(result.outcomes[0].status).toBe('imported');

      // The user's own file is untouched.
      expect(
        readFileSync(
          join(replayDirectory, 'Autodromo Nazionale Monza R1 2.Vcr'),
        ),
      ).toEqual(ownRecording);

      expect(
        existsSync(
          join(
            replayDirectory,
            'Autodromo Nazionale Monza R1 2 (imported).Vcr',
          ),
        ),
      ).toBe(true);
    });

    it('keeps the name the user chose when nothing is in the way', async () => {
      const result = await importOnce();
      const record = Object.values(result.imported)[0];

      expect(record.vcrFileName).toBe('Autodromo Nazionale Monza R1 2.Vcr');
      expect(record.originalReplayName).toBe(record.replayName);
    });

    it('counts up when the marked name is taken too', async () => {
      writeFileSync(
        join(replayDirectory, 'Autodromo Nazionale Monza R1 2.Vcr'),
        Buffer.from('own'),
      );
      writeFileSync(
        join(replayDirectory, 'Autodromo Nazionale Monza R1 2 (imported).Vcr'),
        Buffer.from('earlier import'),
      );

      const result = await importOnce();
      const record = Object.values(result.imported)[0];

      expect(record.vcrFileName).toBe(
        'Autodromo Nazionale Monza R1 2 (imported 2).Vcr',
      );
    });

    /**
     * The trap in renaming. LMU reports the destination file name, and the
     * replay hash is built from it — so a hash derived from the source name
     * would never match the live API and the replay would import but refuse to
     * play.
     */
    it('hashes the renamed replay by the name LMU will report', async () => {
      writeFileSync(
        join(replayDirectory, 'Autodromo Nazionale Monza R1 2.Vcr'),
        Buffer.from('own'),
      );

      const result = await importOnce();
      const record = Object.values(result.imported)[0];

      expect(record.replayName).toBe(
        'Autodromo Nazionale Monza R1 2 (imported)',
      );
      expect(record.originalReplayName).toBe('Autodromo Nazionale Monza R1 2');

      expect(record.hash).toBe(
        generateReplayHash({
          metadata: { sceneDesc: record.sceneDesc, session: record.session },
          replayName: record.replayName,
          timestamp: record.timestamp,
          size: record.size,
        }),
      );
    });

    it('stamps the renamed file, not the one already there', async () => {
      const ownPath = join(
        replayDirectory,
        'Autodromo Nazionale Monza R1 2.Vcr',
      );
      writeFileSync(ownPath, Buffer.from('own'));

      await importOnce();

      expect(stampSpy).toHaveBeenCalledWith(
        join(replayDirectory, 'Autodromo Nazionale Monza R1 2 (imported).Vcr'),
        EVENT_TWO,
      );
      expect(stampSpy).not.toHaveBeenCalledWith(ownPath, expect.anything());
    });
  });

  /**
   * A half-written import is worse than a missing one: the leftover file has no
   * record, so the app can neither find nor delete it.
   */
  it('rolls back the copied files when stamping fails', async () => {
    stampSpy.mockRejectedValue(new Error('PowerShell unavailable'));

    const rows = await scan();
    const result = await importReplays({
      rows,
      selections: [
        {
          id: rows[0].id,
          logPath: rows[0].pairing.proposed!.candidate.filePath,
          method: 'roster',
          confidence: 0.8,
        },
      ],
      replayDirectory,
      logDirectory,
      imported: {},
    });

    expect(result.outcomes[0].status).toBe('failed');
    expect(
      existsSync(join(replayDirectory, 'Autodromo Nazionale Monza R1 2.Vcr')),
    ).toBe(false);
    expect(existsSync(join(logDirectory, 'event-two-race.xml'))).toBe(false);
    expect(result.imported).toEqual({});
  });

  it('flags a replay that has already been imported', async () => {
    const rows = await scan();
    const { imported } = await importReplays({
      rows,
      selections: [
        {
          id: rows[0].id,
          logPath: rows[0].pairing.proposed!.candidate.filePath,
          method: 'roster',
          confidence: 0.8,
        },
      ],
      replayDirectory,
      logDirectory,
      imported: {},
    });

    const { rows: rescan } = await scanImportSource({
      sourceDirectory: replayDirectory,
      imported,
    });

    expect(rescan[0].alreadyImportedHash).toBe(Object.keys(imported)[0]);
  });

  /*
   * The two-file flow: the user picks both files, so nothing is proposed, but
   * the pairing is still checked. These assert the end result of that path
   * through the same import machinery the folder flow uses.
   */
  describe('user-supplied pairing', () => {
    /**
     * The event-one log scores worse against this replay's grid — roster
     * pairing would reject it. A user who explicitly picked it must still get
     * what they picked, dated from the log they chose.
     */
    it('honours the chosen log even when another one scores higher', async () => {
      const rows = await scan();

      expect(rows[0].pairing.proposed?.candidate.fileName).toBe(
        'event-two-race.xml',
      );

      const result = await importReplays({
        rows,
        selections: [
          {
            id: rows[0].id,
            logPath: join(source, 'event-one-race.xml'),
            method: 'manual',
            confidence: null,
          },
        ],
        replayDirectory,
        logDirectory,
        imported: {},
      });

      expect(result.outcomes[0].status).toBe('imported');
      expect(stampSpy).toHaveBeenCalledWith(
        join(replayDirectory, 'Autodromo Nazionale Monza R1 2.Vcr'),
        EVENT_ONE,
      );

      const record = Object.values(result.imported)[0];
      expect(record.match.method).toBe('manual');
      expect(record.logFileName).toBe('event-one-race.xml');
    });
  });

  describe('delete', () => {
    const importOne = async (): Promise<ImportedReplayStore> => {
      const rows = await scan();
      const { imported } = await importReplays({
        rows,
        selections: [
          {
            id: rows[0].id,
            logPath: rows[0].pairing.proposed!.candidate.filePath,
            method: 'roster',
            confidence: 0.8,
          },
        ],
        replayDirectory,
        logDirectory,
        imported: {},
      });
      return imported;
    };

    it('removes the exact files the import wrote', async () => {
      const imported = await importOne();
      const hash = Object.keys(imported)[0];

      const result = await deleteImportedReplays([hash], imported);

      expect(result.deleted).toEqual([hash]);
      expect(result.imported).toEqual({});
      expect(
        existsSync(join(replayDirectory, 'Autodromo Nazionale Monza R1 2.Vcr')),
      ).toBe(false);
      expect(existsSync(join(logDirectory, 'event-two-race.xml'))).toBe(false);
    });

    it('leaves a replay alone when its file changed after import', async () => {
      const imported = await importOne();
      const hash = Object.keys(imported)[0];

      writeFileSync(
        imported[hash].vcrPath,
        Buffer.from('something else entirely'),
      );

      const result = await deleteImportedReplays([hash], imported);

      expect(result.deleted).toEqual([]);
      expect(result.skipped[0].reason).toMatch(
        /has changed since it was imported/,
      );
      expect(existsSync(imported[hash].vcrPath)).toBe(true);
      expect(result.imported[hash]).toBeDefined();
    });

    /**
     * Practice, qualifying and race from one weekend share a result log.
     * Deleting one of them must not strip the log data from the others.
     */
    it('keeps a log that another imported replay still references', async () => {
      const imported = await importOne();
      const [hash] = Object.keys(imported);
      const sibling = {
        ...imported[hash],
        hash: 'sibling-hash',
        replayName: 'Autodromo Nazionale Monza Q1 2',
        vcrFileName: 'Autodromo Nazionale Monza Q1 2.Vcr',
        vcrPath: join(replayDirectory, 'Autodromo Nazionale Monza Q1 2.Vcr'),
      };
      writeFileSync(sibling.vcrPath, Buffer.from('sibling replay'));
      sibling.vcrFingerprint = await fingerprintFile(sibling.vcrPath);

      const store: ImportedReplayStore = {
        ...imported,
        'sibling-hash': sibling,
      };

      const result = await deleteImportedReplays([hash], store);

      expect(result.deleted).toEqual([hash]);
      expect(existsSync(join(logDirectory, 'event-two-race.xml'))).toBe(true);
    });

    /**
     * The steward already had this log — they raced in the event, or they
     * exported and re-imported their own replay. Import copied nothing, so
     * delete must not remove it. Taking a file the app never placed would
     * break the one guarantee that makes deleting safe at all.
     */
    it('keeps a log that was already there when the import ran', async () => {
      const rows = await scan();
      const existingLogPath = join(logDirectory, 'event-two-race.xml');

      // Stand in for a log the steward already had from their own racing.
      writeFileSync(
        existingLogPath,
        readFileSync(join(source, 'event-two-race.xml')),
      );

      const { imported } = await importReplays({
        rows,
        selections: [
          {
            id: rows[0].id,
            logPath: rows[0].pairing.proposed!.candidate.filePath,
            method: 'roster',
            confidence: 0.8,
          },
        ],
        replayDirectory,
        logDirectory,
        imported: {},
      });

      const hash = Object.keys(imported)[0];
      expect(imported[hash].logWasWritten).toBe(false);

      const result = await deleteImportedReplays([hash], imported);

      expect(result.deleted).toEqual([hash]);
      expect(existsSync(existingLogPath)).toBe(true);
    });

    /**
     * Records written before logWasWritten existed have it undefined. Leaving a
     * stale log behind is recoverable; deleting someone's own is not.
     */
    it('leaves the log alone for a record that predates the flag', async () => {
      const imported = await importOne();
      const hash = Object.keys(imported)[0];
      const { logWasWritten: _logWasWritten, ...legacyRecord } = imported[hash];

      const result = await deleteImportedReplays([hash], {
        [hash]: legacyRecord as (typeof imported)[string],
      });

      expect(result.deleted).toEqual([hash]);
      expect(existsSync(join(logDirectory, 'event-two-race.xml'))).toBe(true);
    });

    it('refuses a hash that is not an imported replay', async () => {
      const result = await deleteImportedReplays(['not-imported'], {});

      expect(result.deleted).toEqual([]);
      expect(result.skipped[0].reason).toMatch(/not an imported replay/);
    });
  });
});

/*
 * The suite above mocks setFileCreationTime, which is right for testing import
 * orchestration but meant the stamping itself was never executed — and it was
 * broken: `$args` is only populated by PowerShell's -File, so with -Command the
 * path was appended to the script text and parsed as code.
 *
 * Windows-only, since NTFS creation time is the thing under test.
 */
const describeOnWindows =
  process.platform === 'win32' ? describe : describe.skip;

describeOnWindows('main/replay import creation-time stamping', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'lmu-steward-stamp-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const writeProbe = (relativePath: string): string => {
    const filePath = join(root, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, Buffer.from('probe'));
    return filePath;
  };

  it('stamps a plain path', async () => {
    const filePath = writeProbe('plain.Vcr');

    await replayImport.setFileCreationTime(filePath, EVENT_TWO);

    expect(Math.round(statSync(filePath).birthtimeMs / 1000)).toBe(EVENT_TWO);
  });

  /**
   * The shape that broke in the wild: the real LMU install path contains both
   * spaces and parentheses, and `(x86)` is a PowerShell metacharacter.
   */
  it('stamps a path containing spaces and parentheses', async () => {
    const filePath = writeProbe(
      join(
        'Program Files (x86)',
        'Le Mans Ultimate',
        'Autodromo Nazionale Monza R1 100i.Vcr',
      ),
    );

    await replayImport.setFileCreationTime(filePath, EVENT_TWO);

    expect(Math.round(statSync(filePath).birthtimeMs / 1000)).toBe(EVENT_TWO);
  });

  /** Replay names come from other people's machines; none of it is trusted. */
  it("stamps a path containing quotes, dollars and a driver's apostrophe", async () => {
    const filePath = writeProbe("O'Brien $env test `x.Vcr");

    await replayImport.setFileCreationTime(filePath, EVENT_ONE);

    expect(Math.round(statSync(filePath).birthtimeMs / 1000)).toBe(EVENT_ONE);
  });

  it('fails loudly when the file does not exist', async () => {
    await expect(
      replayImport.setFileCreationTime(join(root, 'missing.Vcr'), EVENT_TWO),
    ).rejects.toThrow();
  });
});
