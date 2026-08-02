/*
 * The results directory is summarised once and matched against in memory. What
 * these cover is the part that used to be wrong rather than slow: matching read
 * and parsed every log in the directory once per replay, and asking for full
 * log data swapped in a whole-document parser while doing it.
 *
 * Real files on a temp directory, because the summary cache keys on size and
 * mtime — mocking fs would test the mock rather than the invalidation.
 */
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LMUReplay, SessionType } from '@types';
import {
  buildLogFileIndex,
  resetLogIndexCacheForTests,
  selectBestLogSummary,
} from './log-index';
import { parseResultLogFromString, ResultLogRecord } from './result-log';

const buildLogXml = (
  eventDateTime: number,
  venue: string,
  sessionTag: 'Race' | 'Qualify' | 'Practice1',
): string =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rFactorXML version="1.0">',
    '<RaceResults>',
    '<Setting>Multiplayer</Setting>',
    `<DateTime>${eventDateTime}</DateTime>`,
    `<TrackVenue>${venue}</TrackVenue>`,
    `<TrackCourse>${venue}</TrackCourse>`,
    `<TrackEvent>6 Hours of Monza</TrackEvent>`,
    `<${sessionTag}>`,
    `<DateTime>${eventDateTime + 600}</DateTime>`,
    `</${sessionTag}>`,
    '</RaceResults>',
    '</rFactorXML>',
  ].join('\n');

/**
 * Stands in for the streaming summary parser, and counts calls so a test can
 * assert how many times a file was actually read.
 */
const createCountingParser = () => {
  const calls: string[] = [];

  const parse = async (filePath: string): Promise<ResultLogRecord> => {
    calls.push(filePath);
    const { readFileSync } = await import('fs');
    return parseResultLogFromString(readFileSync(filePath, 'utf-8'));
  };

  return { parse, calls };
};

const buildReplay = (
  replayName: string,
  session: SessionType,
  timestamp: number,
): LMUReplay =>
  ({
    hash: 'test',
    metadata: { sceneDesc: 'MONZAWEC', session },
    replayName,
    replayDirectory: 'C:/lmu/UserData/Replays',
    size: 0,
    timestamp,
  }) as unknown as LMUReplay;

describe('main/log-index', () => {
  const EVENT_ONE = 1784396019;
  const EVENT_TWO = 1784398360;
  let logDir: string;

  beforeEach(() => {
    resetLogIndexCacheForTests();
    logDir = mkdtempSync(join(tmpdir(), 'lmu-log-index-'));
    writeFileSync(
      join(logDir, '2026_07_18_09_13_39-31R1.xml'),
      buildLogXml(EVENT_ONE, 'Autodromo Nazionale Monza', 'Race'),
    );
    writeFileSync(
      join(logDir, '2026_07_18_09_52_40-31R1.xml'),
      buildLogXml(EVENT_TWO, 'Autodromo Nazionale Monza', 'Race'),
    );
    writeFileSync(
      join(logDir, '2026_07_18_09_20_11-31Q1.xml'),
      buildLogXml(EVENT_ONE, 'Autodromo Nazionale Monza', 'Qualify'),
    );
  });

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  it('parses each log once per build and returns them in a stable order', async () => {
    const { parse, calls } = createCountingParser();

    const index = await buildLogFileIndex(logDir, parse);

    expect(calls).toHaveLength(3);
    expect(index.summaries.map((summary) => summary.fileName)).toEqual([
      '2026_07_18_09_13_39-31R1.xml',
      '2026_07_18_09_20_11-31Q1.xml',
      '2026_07_18_09_52_40-31R1.xml',
    ]);
    expect(index.summaries[0]).toMatchObject({
      dateTime: EVENT_ONE,
      sessionCode: 'RACE',
      trackVenue: 'Autodromo Nazionale Monza',
    });
  });

  /*
   * The reason this module exists. Matching used to rebuild the directory for
   * every replay, so a sync of N replays parsed every log N times.
   */
  it('reuses summaries across rebuilds instead of re-parsing unchanged logs', async () => {
    const { parse, calls } = createCountingParser();

    await buildLogFileIndex(logDir, parse);
    expect(calls).toHaveLength(3);

    await buildLogFileIndex(logDir, parse);
    await buildLogFileIndex(logDir, parse);

    expect(calls).toHaveLength(3);
  });

  it('re-parses only the logs whose contents changed', async () => {
    const { parse, calls } = createCountingParser();

    await buildLogFileIndex(logDir, parse);
    calls.length = 0;

    const changed = join(logDir, '2026_07_18_09_13_39-31R1.xml');
    writeFileSync(
      changed,
      buildLogXml(EVENT_ONE + 5, 'Circuit de Spa-Francorchamps', 'Race'),
    );

    const index = await buildLogFileIndex(logDir, parse);

    expect(calls).toEqual([changed]);
    expect(index.summaries[0].trackVenue).toBe('Circuit de Spa-Francorchamps');
  });

  it('picks up new logs and drops ones that were deleted', async () => {
    const { parse } = createCountingParser();

    await buildLogFileIndex(logDir, parse);

    rmSync(join(logDir, '2026_07_18_09_52_40-31R1.xml'));
    writeFileSync(
      join(logDir, '2026_07_18_10_30_00-31R1.xml'),
      buildLogXml(EVENT_TWO + 900, 'Autodromo Nazionale Monza', 'Race'),
    );

    const index = await buildLogFileIndex(logDir, parse);

    expect(index.summaries.map((summary) => summary.fileName)).toEqual([
      '2026_07_18_09_13_39-31R1.xml',
      '2026_07_18_09_20_11-31Q1.xml',
      '2026_07_18_10_30_00-31R1.xml',
    ]);
  });

  it('survives an unreadable log rather than failing the directory', async () => {
    const failing = join(logDir, '2026_07_18_09_20_11-31Q1.xml');
    const parse = async (filePath: string): Promise<ResultLogRecord> => {
      if (filePath === failing) {
        throw new Error('malformed XML log');
      }
      return createCountingParser().parse(filePath);
    };

    const index = await buildLogFileIndex(logDir, parse);

    expect(index.summaries.map((summary) => summary.fileName)).toEqual([
      '2026_07_18_09_13_39-31R1.xml',
      '2026_07_18_09_52_40-31R1.xml',
    ]);
  });

  it('returns an empty index for a directory that cannot be read', async () => {
    const { parse } = createCountingParser();

    const index = await buildLogFileIndex(
      join(logDir, 'does-not-exist'),
      parse,
    );

    expect(index.summaries).toEqual([]);
  });

  describe('selection', () => {
    it('matches a replay to the log of its own event, not the neighbouring one', async () => {
      const { parse } = createCountingParser();
      const index = await buildLogFileIndex(logDir, parse);

      const first = selectBestLogSummary(
        index,
        buildReplay('Autodromo Nazionale Monza R1 1', 'RACE', EVENT_ONE),
        null,
      );
      const second = selectBestLogSummary(
        index,
        buildReplay('Autodromo Nazionale Monza R1 2', 'RACE', EVENT_TWO),
        null,
      );

      expect(first?.fileName).toBe('2026_07_18_09_13_39-31R1.xml');
      expect(second?.fileName).toBe('2026_07_18_09_52_40-31R1.xml');
    });

    it('never crosses session types', async () => {
      const { parse } = createCountingParser();
      const index = await buildLogFileIndex(logDir, parse);

      const qualifying = selectBestLogSummary(
        index,
        buildReplay('Autodromo Nazionale Monza Q1 1', 'QUALIFY', EVENT_ONE),
        null,
      );

      expect(qualifying?.fileName).toBe('2026_07_18_09_20_11-31Q1.xml');
    });

    it('separates restarted races by when each log was written', async () => {
      const { parse } = createCountingParser();
      // A restart shares the event DateTime with the race it replaced, so the
      // only thing left to separate them is the write time.
      const restarted = join(logDir, '2026_07_18_09_40_00-31R1.xml');
      writeFileSync(
        restarted,
        buildLogXml(EVENT_ONE, 'Autodromo Nazionale Monza', 'Race'),
      );
      const restartedWrittenAt = new Date((EVENT_ONE + 3600) * 1000);
      utimesSync(restarted, restartedWrittenAt, restartedWrittenAt);

      const original = join(logDir, '2026_07_18_09_13_39-31R1.xml');
      const originalWrittenAt = new Date((EVENT_ONE + 900) * 1000);
      utimesSync(original, originalWrittenAt, originalWrittenAt);

      const index = await buildLogFileIndex(logDir, parse);

      expect(
        selectBestLogSummary(
          index,
          buildReplay('Autodromo Nazionale Monza R1 1', 'RACE', EVENT_ONE),
          EVENT_ONE + 3600,
        )?.fileName,
      ).toBe('2026_07_18_09_40_00-31R1.xml');

      expect(
        selectBestLogSummary(
          index,
          buildReplay('Autodromo Nazionale Monza R1 1', 'RACE', EVENT_ONE),
          EVENT_ONE + 900,
        )?.fileName,
      ).toBe('2026_07_18_09_13_39-31R1.xml');
    });

    it('returns null when the directory holds no log of that session type', async () => {
      const { parse } = createCountingParser();
      const index = await buildLogFileIndex(logDir, parse);

      expect(
        selectBestLogSummary(
          index,
          buildReplay('Autodromo Nazionale Monza P1 1', 'PRACTICE', EVENT_ONE),
          null,
        ),
      ).toBeNull();
    });
  });
});
