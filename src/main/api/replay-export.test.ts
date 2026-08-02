/*
 * Export path resolution.
 *
 * The renderer used to assemble these paths by string concatenation, which is
 * how a template-literal escaping slip produced a log path containing the
 * literal text "${currentReplay.logDataFileName}" and made every export fail.
 * Paths are now resolved here, and these assert that they land where the files
 * actually are.
 */
/* eslint-disable import/first */
const settings: Record<string, unknown> = {
  lmuReplayDirectoryPath: 'C:\\LMU\\UserData\\Replays',
};

import { join } from 'path';
import { ImportedReplayStore } from '@types';
import {
  buildExportManifest,
  ExportReplayRequest,
  resolveExportPaths,
} from './replay-import-handlers';
import {
  buildWeekendFileName,
  buildWeekendLayout,
  buildWeekendManifest,
  resolveProgressStep,
  sanitizeArchiveName,
  WeekendSessionSource,
} from './replay-export';

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({
    get: () => undefined,
    set: () => {},
    clear: () => {},
  }),
}));

jest.mock('./user-settings', () => ({
  readUserSettings: async () => settings,
}));
/* eslint-enable import/first */

const buildRequest = (
  overrides: Partial<ExportReplayRequest> = {},
): ExportReplayRequest => ({
  hash: 'own-hash',
  replayName: 'Autodromo Nazionale Monza R1 2',
  sceneDesc: 'MONZAWEC',
  session: 'RACE',
  timestamp: 1784398360,
  logDataFileName: '2026_07_18_22_37_06-39R1.xml',
  ...overrides,
});

describe('main/replay export paths', () => {
  it('resolves a replay the user recorded from the configured folder', async () => {
    const { vcrPath, logPath } = await resolveExportPaths(buildRequest(), {});

    expect(vcrPath).toBe(
      join('C:\\LMU\\UserData\\Replays', 'Autodromo Nazionale Monza R1 2.Vcr'),
    );
    expect(logPath).toBe(
      join('C:\\LMU\\UserData\\Log\\Results', '2026_07_18_22_37_06-39R1.xml'),
    );
    // The separator is real, not a stray literal from string concatenation.
    expect(logPath).not.toContain('${');
  });

  /**
   * An imported replay may carry an "(imported)" marker in its name and its log
   * lives wherever the import wrote it, so its record is the only reliable
   * source — rebuilding the path from the replay name would miss both.
   */
  it('takes an imported replay straight from its record', async () => {
    const imported: ImportedReplayStore = {
      'imported-hash': {
        hash: 'imported-hash',
        replayName: 'Autodromo Nazionale Monza R1 2 (imported)',
        originalReplayName: 'Autodromo Nazionale Monza R1 2',
        sceneDesc: 'MONZAWEC',
        session: 'RACE',
        timestamp: 1784398360,
        vcrFileName: 'Autodromo Nazionale Monza R1 2 (imported).Vcr',
        vcrPath: 'D:\\Elsewhere\\Autodromo Nazionale Monza R1 2 (imported).Vcr',
        size: 10,
        logFileName: 'event-two-race.xml',
        logPath: 'D:\\Elsewhere\\Logs\\event-two-race.xml',
        logWasWritten: true,
        vcrFingerprint: 'a',
        logFingerprint: 'b',
        importedAt: 1,
        logData: null,
        origin: {
          trackFolder: 'Monza_2023',
          trackVersion: '1.27',
          trackContentHash: 'abc',
          installPath: 'E:\\LMU',
        },
        match: { method: 'manual', confidence: null, rosterOverlap: null },
      },
    };

    const { vcrPath, logPath } = await resolveExportPaths(
      buildRequest({ hash: 'imported-hash' }),
      imported,
    );

    expect(vcrPath).toBe(imported['imported-hash'].vcrPath);
    expect(logPath).toBe(imported['imported-hash'].logPath);
  });

  it('refuses a replay with no result log', async () => {
    await expect(
      resolveExportPaths(buildRequest({ logDataFileName: '' }), {}),
    ).rejects.toThrow(/no result log/);
  });

  it('names the files in the manifest as they appear in the archive', () => {
    const manifest = buildExportManifest(
      buildRequest(),
      'C:\\LMU\\UserData\\Replays\\Autodromo Nazionale Monza R1 2.Vcr',
      'C:\\LMU\\UserData\\Log\\Results\\2026_07_18_22_37_06-39R1.xml',
    );

    expect(manifest).toMatchObject({
      createdBy: 'lmu-steward',
      version: 1,
      // The event time is the point of the manifest: it lets the receiving
      // copy stamp the exact creation time and skip pairing entirely.
      timestamp: 1784398360,
      vcrFileName: 'Autodromo Nazionale Monza R1 2.Vcr',
      logFileName: '2026_07_18_22_37_06-39R1.xml',
    });
  });
});

/*
 * Weekend export.
 *
 * The sessions below are taken from a real Daytona weekend in the library this
 * feature was built against: a practice, a qualifying, and four races from
 * restarts, all sharing one event time and one grid.
 */
const REPLAY_DIRECTORY = 'C:\\LMU\\UserData\\Replays';
const LOG_DIRECTORY = 'C:\\LMU\\UserData\\Log\\Results';

const buildSource = (
  replayName: string,
  session: string,
  logFileName: string,
  overrides: Partial<WeekendSessionSource> = {},
): WeekendSessionSource => ({
  request: buildRequest({
    hash: replayName,
    replayName,
    sceneDesc: 'DAYTONA',
    session,
    logDataFileName: logFileName,
  }),
  vcrPath: join(REPLAY_DIRECTORY, `${replayName}.Vcr`),
  logPath: join(LOG_DIRECTORY, logFileName),
  vcrSize: 1000,
  logSize: 100,
  ...overrides,
});

const DAYTONA = 'Daytona International Speedway Road Course';

const daytonaWeekend = (): WeekendSessionSource[] => [
  buildSource(`${DAYTONA} R1 2`, 'RACE', '2026_07_30_23_09_50-12R1.xml'),
  buildSource(`${DAYTONA} P1 4`, 'PRACTICE', '2026_07_30_23_03_05-46P1.xml'),
  buildSource(`${DAYTONA} R1 5`, 'RACE', '2026_07_30_23_16_01-71R1.xml'),
  buildSource(`${DAYTONA} Q1 2`, 'QUALIFY', '2026_07_30_23_03_16-16Q1.xml'),
  buildSource(`${DAYTONA} R1 3`, 'RACE', '2026_07_30_23_10_40-76R1.xml'),
  buildSource(`${DAYTONA} R1 4`, 'RACE', '2026_07_30_23_11_34-17R1.xml'),
];

describe('main/weekend export layout', () => {
  /**
   * The point of a directory per session. A layout keyed on session type would
   * put four of these six at "Race/", losing three races silently — and a
   * restarted race is exactly the case a steward is reviewing.
   */
  it('gives every session of a restarted-race weekend its own directory', () => {
    const { entries } = buildWeekendLayout(daytonaWeekend());

    const directories = entries.map((entry) => entry.directory);

    expect(new Set(directories).size).toBe(6);
    expect(directories).toEqual([
      `01 Practice - ${DAYTONA} P1 4`,
      `02 Qualifying - ${DAYTONA} Q1 2`,
      `03 Race - ${DAYTONA} R1 2`,
      `04 Race - ${DAYTONA} R1 3`,
      `05 Race - ${DAYTONA} R1 4`,
      `06 Race - ${DAYTONA} R1 5`,
    ]);
  });

  it('files each session with its own replay and log', () => {
    const { entries } = buildWeekendLayout(daytonaWeekend());
    const race = entries[2];

    expect(race.vcrEntryName).toBe(
      `03 Race - ${DAYTONA} R1 2/${DAYTONA} R1 2.Vcr`,
    );
    expect(race.logEntryName).toBe(
      `03 Race - ${DAYTONA} R1 2/2026_07_30_23_09_50-12R1.xml`,
    );
    expect(race.manifestEntryName).toBe(
      `03 Race - ${DAYTONA} R1 2/lmu-steward-export.json`,
    );
  });

  /**
   * Restarts run past nine on a bad night, and "R1 10" sorts before "R1 9" as
   * text. The numeric prefix is only worth having if it follows the order the
   * sessions actually ran in.
   */
  it('orders restarts by their counter rather than as text', () => {
    const { entries } = buildWeekendLayout([
      buildSource(`${DAYTONA} R1 10`, 'RACE', 'ten.xml'),
      buildSource(`${DAYTONA} R1 9`, 'RACE', 'nine.xml'),
    ]);

    expect(entries.map((entry) => entry.request.replayName)).toEqual([
      `${DAYTONA} R1 9`,
      `${DAYTONA} R1 10`,
    ]);
  });

  /**
   * Sibling sessions routinely resolve to one result XML. The copy is
   * duplicated so each session directory is a complete export on its own, and
   * the manifest is what stops that reading as three unrelated logs.
   */
  it('records which sessions share a result log', () => {
    const shared = '2026_07_30_23_03_05-46P1.xml';
    const { entries } = buildWeekendLayout([
      buildSource(`${DAYTONA} P1 4`, 'PRACTICE', shared),
      buildSource(`${DAYTONA} Q1 2`, 'QUALIFY', shared),
      buildSource(`${DAYTONA} R1 2`, 'RACE', '2026_07_30_23_09_50-12R1.xml'),
    ]);

    expect(entries[0].logSharedWith).toEqual([
      `02 Qualifying - ${DAYTONA} Q1 2`,
    ]);
    expect(entries[1].logSharedWith).toEqual([`01 Practice - ${DAYTONA} P1 4`]);
    expect(entries[2].logSharedWith).toEqual([]);

    // Duplicated rather than stored once, so pulling one directory out of the
    // archive never yields a .Vcr with no log.
    expect(entries[0].logEntryName).toBe(
      `01 Practice - ${DAYTONA} P1 4/${shared}`,
    );
    expect(entries[1].logEntryName).toBe(
      `02 Qualifying - ${DAYTONA} Q1 2/${shared}`,
    );
  });

  it('totals the bytes the archive will hold', () => {
    const { totalBytes } = buildWeekendLayout([
      buildSource('a', 'RACE', 'a.xml', { vcrSize: 400, logSize: 40 }),
      buildSource('b', 'PRACTICE', 'b.xml', { vcrSize: 60, logSize: 6 }),
    ]);

    expect(totalBytes).toBe(506);
  });

  it('names the sessions and what was left out in the weekend manifest', () => {
    const sources = daytonaWeekend().slice(0, 2);
    const { entries } = buildWeekendLayout(sources);

    const manifest = buildWeekendManifest(
      {
        weekendLabel: DAYTONA,
        timestamp: 1785495847,
        sessions: sources.map((source) => source.request),
      },
      entries,
      [
        {
          replayName: `${DAYTONA} P1 5`,
          session: 'PRACTICE',
          reason: 'This replay has no result log, so it cannot be exported.',
        },
      ],
    );

    expect(manifest).toMatchObject({
      createdBy: 'lmu-steward',
      version: 2,
      kind: 'weekend',
      weekendLabel: DAYTONA,
      sessionCount: 2,
    });
    expect(manifest.sessions[0]).toMatchObject({
      directory: `01 Practice - ${DAYTONA} P1 4`,
      vcrFileName: `${DAYTONA} P1 4.Vcr`,
      logFileName: '2026_07_30_23_03_05-46P1.xml',
      logSharedWith: [],
    });
    // A partial weekend has to be distinguishable from a complete one.
    expect(manifest.omittedSessions).toHaveLength(1);
  });

  /**
   * The label reaches the archive from track metadata rather than from a file
   * name, so it is the one string in the layout that has not already been
   * proven safe as a path.
   */
  it('keeps a separator in the weekend label out of the archive name', () => {
    expect(sanitizeArchiveName('../../etc', 'Race weekend')).toBe('.. .. etc');
    expect(sanitizeArchiveName('   ', 'Race weekend')).toBe('Race weekend');
    expect(sanitizeArchiveName('Spa 24h.', 'Race weekend')).toBe('Spa 24h');
  });

  it('names the archive for the track and the date', () => {
    expect(buildWeekendFileName(DAYTONA, 1785495847)).toBe(
      `${DAYTONA} - 2026-07-31.zip`,
    );
  });
});

describe('main/export progress', () => {
  /**
   * yazl reports nothing per entry, so the session being written is worked out
   * from the bytes that have left its output stream.
   */
  const steps = [
    { label: 'practice', bytes: 100 },
    { label: 'qualifying', bytes: 10 },
    { label: 'race', bytes: 50 },
  ];

  it('names the session the stream is currently inside', () => {
    expect(resolveProgressStep(steps, 0)).toEqual({
      processed: 0,
      currentLabel: 'practice',
    });
    expect(resolveProgressStep(steps, 99)).toEqual({
      processed: 0,
      currentLabel: 'practice',
    });
    expect(resolveProgressStep(steps, 100)).toEqual({
      processed: 1,
      currentLabel: 'qualifying',
    });
    expect(resolveProgressStep(steps, 115)).toEqual({
      processed: 2,
      currentLabel: 'race',
    });
  });

  /**
   * The zip's own central directory follows the last entry, so the byte count
   * runs past the total the sessions add up to.
   */
  it('reports everything done once the entries are past', () => {
    expect(resolveProgressStep(steps, 100_000)).toEqual({
      processed: 3,
      currentLabel: 'race',
    });
  });

  it('survives an empty archive', () => {
    expect(resolveProgressStep([], 0)).toEqual({
      processed: 0,
      currentLabel: '',
    });
  });
});
