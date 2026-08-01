/*
 * Log matching over real files on disk. `replay.test.ts` mocks `fs` wholesale,
 * which is right for unit work but cannot express what this suite exists for:
 * choosing between two events at the same track on the same evening, where the
 * only thing separating them is which <DateTime> the parser kept.
 *
 * The first block writes its own logs to a temp directory, so it runs anywhere,
 * including CI. The second block runs the same expectations against the real
 * hand-off in `fixture-test-set/`, which is gitignored — it is skipped rather
 * than failed when that directory is not present.
 *
 * These declarations must stay above the imports, for the reason given in
 * replay.test.ts — importing ./replay evaluates the module, which reads the
 * store at import time.
 */
/* eslint-disable import/first */
const replayStoreData: Record<string, unknown> = { replays: {} };

import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LMUReplay, SessionType } from '@types';
import { findBestLogFile } from './replay';
import { parseResultLog } from './result-log';

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({
    get: (key: string) => replayStoreData[key],
    set: (key: string, value: unknown) => {
      replayStoreData[key] = value;
    },
    clear: () => {},
  }),
}));
/* eslint-enable import/first */

/**
 * The two Monza events of 18 July 2026, as LMU actually recorded them. Both are
 * multiplayer weekends at one track roughly forty minutes apart, each with its
 * own practice, qualifying and race log.
 *
 * A replay's `timestamp` is its .Vcr's creation time, which LMU sets when it
 * creates the event — so it equals the log's *root* <DateTime>, not the session
 * <DateTime> nested inside <Race>.
 */
const EVENT_ONE = 1784396019;
const EVENT_TWO = 1784398360;

const buildReplay = (
  replayName: string,
  session: SessionType,
  timestamp: number,
): LMUReplay =>
  ({
    hash: 'fixture',
    metadata: { sceneDesc: 'MONZAWEC', session },
    replayName,
    replayDirectory: 'C:/lmu/UserData/Replays',
    size: 0,
    timestamp,
  }) as unknown as LMUReplay;

interface SyntheticLog {
  fileName: string;
  eventDateTime: number;
  sessionDateTime: number;
  sessionTag: 'Race' | 'Qualify' | 'Practice1';
  venue: string;
}

/**
 * Mirrors the shape of a real LMU result log: a root <DateTime> for the event,
 * and a second <DateTime> inside the session element. That pairing is the whole
 * point — a parser that keeps the last one it sees reads every log as later
 * than it is.
 */
const buildLogXml = (log: SyntheticLog): string =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rFactorXML version="1.0">',
    '<RaceResults>',
    '<Setting>Multiplayer</Setting>',
    `<DateTime>${log.eventDateTime}</DateTime>`,
    `<TrackVenue>${log.venue}</TrackVenue>`,
    `<TrackCourse>${log.venue}</TrackCourse>`,
    `<TrackEvent>${log.venue}</TrackEvent>`,
    `<${log.sessionTag}>`,
    `<DateTime>${log.sessionDateTime}</DateTime>`,
    '<Minutes>20</Minutes>',
    '<Driver><Name>A Driver</Name></Driver>',
    `</${log.sessionTag}>`,
    '</RaceResults>',
    '</rFactorXML>',
  ].join('\n');

const MONZA = 'Autodromo Nazionale Monza';

const SYNTHETIC_LOGS: SyntheticLog[] = [
  // Event one — the earlier weekend.
  {
    fileName: '2026_07_18_20_45_52-32P1.xml',
    eventDateTime: EVENT_ONE,
    sessionDateTime: 1784396500,
    sessionTag: 'Practice1',
    venue: MONZA,
  },
  {
    fileName: '2026_07_18_21_02_35-97Q1.xml',
    eventDateTime: EVENT_ONE,
    sessionDateTime: 1784397000,
    sessionTag: 'Qualify',
    venue: MONZA,
  },
  {
    fileName: '2026_07_18_21_12_13-45R1.xml',
    eventDateTime: EVENT_ONE,
    sessionDateTime: 1784397822,
    sessionTag: 'Race',
    venue: MONZA,
  },
  // Event two — starts while event one's race is still being written.
  {
    fileName: '2026_07_18_21_25_51-18P1.xml',
    eventDateTime: EVENT_TWO,
    sessionDateTime: 1784398800,
    sessionTag: 'Practice1',
    venue: MONZA,
  },
  {
    fileName: '2026_07_18_21_44_56-30Q1.xml',
    eventDateTime: EVENT_TWO,
    sessionDateTime: 1784399500,
    sessionTag: 'Qualify',
    venue: MONZA,
  },
  {
    fileName: '2026_07_18_22_37_06-39R1.xml',
    eventDateTime: EVENT_TWO,
    sessionDateTime: 1784400388,
    sessionTag: 'Race',
    venue: MONZA,
  },
  // Decoys: another track the same evening, and Monza on another day.
  {
    fileName: '2026_07_18_21_30_00-11R1.xml',
    eventDateTime: 1784398400,
    sessionDateTime: 1784398450,
    sessionTag: 'Race',
    venue: 'Circuit de Spa-Francorchamps',
  },
  {
    fileName: '2026_07_21_14_35_51-13R1.xml',
    eventDateTime: 1784631629,
    sessionDateTime: 1784633000,
    sessionTag: 'Race',
    venue: MONZA,
  },
];

/*
 * A restarted race produces several sessions that are identical to everything
 * matching normally looks at: same event DateTime, same track, same session
 * type, same grid. Taken from a real weekend where four races shared one event.
 */
const RESTART_EVENT = 1785469409;
const RESTART_FLUSH_TIMES = [1785470990, 1785471040, 1785471094, 1785471361];

describe('main/replay restarted races', () => {
  let logDir: string;
  let replayDir: string;

  beforeAll(() => {
    logDir = mkdtempSync(join(tmpdir(), 'lmu-steward-restart-logs-'));
    replayDir = mkdtempSync(join(tmpdir(), 'lmu-steward-restart-replays-'));

    RESTART_FLUSH_TIMES.forEach((flushedAt, index) => {
      const logPath = join(
        logDir,
        `2026_07_30_23_0${index}_00-1${index}R1.xml`,
      );
      writeFileSync(
        logPath,
        buildLogXml({
          fileName: '',
          eventDateTime: RESTART_EVENT,
          sessionDateTime: flushedAt - 600,
          sessionTag: 'Race',
          venue: 'Daytona International Speedway',
        }),
        'utf-8',
      );
      // The log is written the moment the replay is flushed.
      utimesSync(logPath, flushedAt, flushedAt);

      const replayPath = join(replayDir, `Daytona R1 ${index + 2}.Vcr`);
      writeFileSync(replayPath, Buffer.from('replay'));
      utimesSync(replayPath, flushedAt, flushedAt);
    });
  });

  afterAll(() => {
    rmSync(logDir, { recursive: true, force: true });
    rmSync(replayDir, { recursive: true, force: true });
  });

  /**
   * Every one of these shares a creation time, so the event DateTime cannot
   * separate them. Before the flush-time tiebreak they all resolved to whichever
   * log sorted last, meaning three of four races showed a different race's
   * incidents, laps and standings.
   */
  it.each([0, 1, 2, 3])('matches restart %i to its own log', async (index) => {
    const replay = {
      hash: 'restart',
      metadata: { sceneDesc: 'DAYTONA', session: 'RACE' },
      replayName: `Daytona R1 ${index + 2}`,
      replayDirectory: replayDir,
      size: 0,
      timestamp: RESTART_EVENT,
    } as unknown as LMUReplay;

    const result = await findBestLogFile(logDir, replay, parseResultLog);

    expect(result?.logDataFileName).toBe(
      `2026_07_30_23_0${index}_00-1${index}R1.xml`,
    );
  });
});

describe('main/replay log matching', () => {
  let logDir: string;

  beforeAll(() => {
    logDir = mkdtempSync(join(tmpdir(), 'lmu-steward-logmatch-'));
    SYNTHETIC_LOGS.forEach((log) => {
      writeFileSync(join(logDir, log.fileName), buildLogXml(log), 'utf-8');
    });
  });

  afterAll(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  it('reads the event DateTime rather than the session one', async () => {
    const parsed = await parseResultLog(
      join(logDir, '2026_07_18_22_37_06-39R1.xml'),
    );

    expect(parsed.summary.DateTime).toBe(EVENT_TWO);
  });

  /**
   * The regression this exists for. Both races are Monza, both on the same
   * evening. Keeping the session <DateTime> puts event one's race 538s from
   * this replay and event two's — the correct one — 2028s away, so the match
   * lands on the wrong league entirely.
   */
  it('picks the race from its own event, not the neighbouring one', async () => {
    const result = await findBestLogFile(
      logDir,
      buildReplay('Autodromo Nazionale Monza R1 2', 'RACE', EVENT_TWO),
      parseResultLog,
    );

    expect(result?.logDataFileName).toBe('2026_07_18_22_37_06-39R1.xml');
  });

  it.each([
    ['PRACTICE', EVENT_ONE, '2026_07_18_20_45_52-32P1.xml'],
    ['QUALIFY', EVENT_ONE, '2026_07_18_21_02_35-97Q1.xml'],
    ['RACE', EVENT_ONE, '2026_07_18_21_12_13-45R1.xml'],
    ['PRACTICE', EVENT_TWO, '2026_07_18_21_25_51-18P1.xml'],
    ['QUALIFY', EVENT_TWO, '2026_07_18_21_44_56-30Q1.xml'],
    ['RACE', EVENT_TWO, '2026_07_18_22_37_06-39R1.xml'],
  ])(
    'matches a %s replay from event %d to its own log',
    async (session, timestamp, expectedLogFileName) => {
      const result = await findBestLogFile(
        logDir,
        buildReplay(
          'Autodromo Nazionale Monza R1 1',
          session as SessionType,
          timestamp,
        ),
        parseResultLog,
      );

      expect(result?.logDataFileName).toBe(expectedLogFileName);
    },
  );
});

/*
 * The same expectations against the real hand-off a steward sent in: nine .Vcr
 * files and 190 result logs, most of them the recipient's own. `fixture-test-set`
 * is gitignored, so this only runs on a machine that has it.
 */
const REAL_FIXTURE_LOG_DIR = join(
  __dirname,
  '../../../fixture-test-set/import-replay-data-set/Results',
);

const describeWithRealFixtures = existsSync(REAL_FIXTURE_LOG_DIR)
  ? describe
  : describe.skip;

describeWithRealFixtures(
  'main/replay log matching against the real hand-off fixtures',
  () => {
    jest.setTimeout(120_000);

    it.each([
      [
        'Autodromo Nazionale Monza P1 12',
        'PRACTICE',
        EVENT_ONE,
        '2026_07_18_20_45_52-32P1.xml',
      ],
      [
        'Autodromo Nazionale Monza Q1 1',
        'QUALIFY',
        EVENT_ONE,
        '2026_07_18_21_02_35-97Q1.xml',
      ],
      [
        'Autodromo Nazionale Monza P1 13',
        'PRACTICE',
        EVENT_TWO,
        '2026_07_18_21_25_51-18P1.xml',
      ],
      [
        'Autodromo Nazionale Monza Q1 2',
        'QUALIFY',
        EVENT_TWO,
        '2026_07_18_21_44_56-30Q1.xml',
      ],
      // R1 1 and R1 2 are the same race recorded on two different PCs, so both
      // correctly resolve to the same log.
      [
        'Autodromo Nazionale Monza R1 1',
        'RACE',
        EVENT_TWO,
        '2026_07_18_22_37_06-39R1.xml',
      ],
      [
        'Autodromo Nazionale Monza R1 2',
        'RACE',
        EVENT_TWO,
        '2026_07_18_22_37_06-39R1.xml',
      ],
    ])(
      'matches %s to its own event log',
      async (replayName, session, timestamp, expectedLogFileName) => {
        const result = await findBestLogFile(
          REAL_FIXTURE_LOG_DIR,
          buildReplay(replayName, session as SessionType, timestamp),
          parseResultLog,
        );

        expect(result?.logDataFileName).toBe(expectedLogFileName);
      },
    );
  },
);
