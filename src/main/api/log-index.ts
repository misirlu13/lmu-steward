import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { SessionType } from '@types';
import { getTrackAliases, tracksLikelyMatch } from './track-matching';

/**
 * One parse of the results directory, shared by everything that needs it.
 *
 * Log matching used to read and parse the whole directory once per replay: a
 * first sync of 193 replays against 388 logs is 74 884 parses of the same
 * files. That was survivable while a log was ~80 KB, which is what the v1.3.0
 * streaming parser bought. It stops being survivable now that LMU records
 * 24-hour races — a 62-car 24h result log measures around 29 MB, so the same
 * sync would read on the order of a terabyte.
 *
 * So the directory is summarised once and matched against in memory. Summaries
 * are cached per file and reused while the file's size and mtime are unchanged,
 * which means the expensive logs are parsed exactly once no matter how many
 * replays are synced or how often a replay is opened.
 *
 * The summary is deliberately small — the handful of fields matching needs, and
 * whatever the cheap parser produced. Nothing here should ever hold a full
 * parsed document; that is what made the previous version dangerous.
 */

/** The fields log matching reads. Structurally satisfied by ParsedRaceResults. */
export interface LogSummaryFields {
  DateTime?: number;
  TrackVenue?: string;
  TrackCourse?: string;
  TrackEvent?: string;
  Race?: unknown;
  Qualify?: unknown;
  Practice1?: unknown;
}

export interface ParsedLogDocument<
  T extends LogSummaryFields = LogSummaryFields,
> {
  rFactorXML?: { RaceResults?: T };
}

export type LogSummaryParser<T extends LogSummaryFields> = (
  filePath: string,
) => Promise<ParsedLogDocument<T>>;

export interface LogFileSummary<T extends LogSummaryFields = LogSummaryFields> {
  fileName: string;
  filePath: string;
  dateTime: number | null;
  sessionCode: SessionType | null;
  trackVenue: string;
  trackCourse: string;
  trackEvent: string;
  /** File mtime in seconds, used to separate restarted races. */
  writtenAt: number | null;
  logData: T | null;
}

export interface LogFileIndex<T extends LogSummaryFields = LogSummaryFields> {
  logDir: string;
  summaries: LogFileSummary<T>[];
}

/**
 * How many logs are parsed at once.
 *
 * Not unbounded, which is what this replaced. Reading eight 24h logs in
 * parallel measured at 230 MB RSS doing nothing but reading; the streaming
 * parser keeps each one cheap, but only if a bounded number are in flight.
 */
const LOG_PARSE_CONCURRENCY = 4;

interface CachedSummary<T extends LogSummaryFields> {
  fingerprint: string | null;
  summary: LogFileSummary<T>;
}

const summaryCache = new Map<string, Map<string, CachedSummary<never>>>();

const cacheKeyForDirectory = (logDir: string): string => logDir.toLowerCase();

/** Clears memoised summaries. Tests reuse directory paths across cases. */
export const resetLogIndexCacheForTests = (): void => {
  summaryCache.clear();
};

/**
 * Size and mtime, or null when the file cannot be stat'ed.
 *
 * Null means "assume changed" — a fingerprint that cannot be read must never
 * be treated as a match, or a rewritten log would be served from cache forever.
 */
const fingerprintFile = async (filePath: string): Promise<string | null> => {
  try {
    const { size, mtimeMs } = await stat(filePath);
    return `${size}:${mtimeMs}`;
  } catch {
    return null;
  }
};

/**
 * File modification time in seconds, or null when it cannot be read.
 *
 * Deliberately forgiving. This only refines a tiebreak, so a filesystem that
 * will not answer should fall back to the previous ordering rather than fail
 * the whole match.
 */
export const safeModifiedAtSeconds = async (
  filePath: string,
): Promise<number | null> => {
  try {
    const { mtimeMs } = await stat(filePath);
    return Number.isFinite(mtimeMs) ? mtimeMs / 1000 : null;
  } catch {
    return null;
  }
};

export const getSessionCodeFromFileName = (
  fileName: string,
): SessionType | null => {
  const match = String(fileName ?? '').match(/([RQP])\d+\.xml$/i);
  if (!match) {
    return null;
  }

  const code = match[1].toUpperCase();
  if (code === 'R') {
    return 'RACE';
  }
  if (code === 'Q') {
    return 'QUALIFY';
  }

  return 'PRACTICE';
};

export const getLogDataSessionType = (
  logData: ParsedLogDocument | null | undefined,
): SessionType | null => {
  const raceResultsKeys = Object.keys(logData?.rFactorXML?.RaceResults || {});

  if (raceResultsKeys.includes('Race')) {
    return 'RACE';
  }
  if (raceResultsKeys.includes('Qualify')) {
    return 'QUALIFY';
  }
  if (raceResultsKeys.includes('Practice1')) {
    return 'PRACTICE';
  }
  return null;
};

/** Runs `worker` over `items`, at most `limit` at a time, skipping failures. */
const mapWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  limit: number,
  worker: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> => {
  const results: TResult[] = [];
  let cursor = 0;

  const runner = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }

      try {
        results.push(await worker(items[index]));
      } catch {
        // One unreadable log must not fail the directory.
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runner),
  );

  return results;
};

/**
 * Summarises every result log in `logDir`, reusing cached summaries for files
 * whose size and mtime are unchanged.
 *
 * `parseSummary` must be the cheap streaming parser. Passing a whole-document
 * parser here is what used to make opening a single replay parse the entire
 * directory through xml2js.
 */
export const buildLogFileIndex = async <T extends LogSummaryFields>(
  logDir: string,
  parseSummary: LogSummaryParser<T>,
): Promise<LogFileIndex<T>> => {
  let files: string[];

  try {
    files = (await readdir(logDir)).filter((file) => file.endsWith('.xml'));
  } catch {
    return { logDir, summaries: [] };
  }

  const cacheKey = cacheKeyForDirectory(logDir);
  const cached = (summaryCache.get(cacheKey) ?? new Map()) as Map<
    string,
    CachedSummary<T>
  >;
  const nextCache = new Map<string, CachedSummary<T>>();

  const summaries = await mapWithConcurrency(
    files,
    LOG_PARSE_CONCURRENCY,
    async (fileName) => {
      const filePath = join(logDir, fileName);
      const fingerprint = await fingerprintFile(filePath);
      const previous = cached.get(fileName);

      if (
        previous &&
        fingerprint !== null &&
        previous.fingerprint === fingerprint
      ) {
        nextCache.set(fileName, previous);
        return previous.summary;
      }

      const logDocument = await parseSummary(filePath);
      const raceResults = logDocument?.rFactorXML?.RaceResults;
      const summary: LogFileSummary<T> = {
        fileName,
        filePath,
        dateTime: raceResults?.DateTime ?? null,
        sessionCode:
          getLogDataSessionType(logDocument) ||
          getSessionCodeFromFileName(fileName),
        trackVenue: raceResults?.TrackVenue || '',
        trackCourse: raceResults?.TrackCourse || '',
        trackEvent: raceResults?.TrackEvent || '',
        writtenAt: await safeModifiedAtSeconds(filePath),
        logData: raceResults ?? null,
      };

      nextCache.set(fileName, { fingerprint, summary });
      return summary;
    },
  );

  summaryCache.set(
    cacheKey,
    nextCache as unknown as Map<string, CachedSummary<never>>,
  );

  /*
   * Completion order out of the pool is not input order, and ranking's last
   * tiebreak is the file name — so sort here rather than leave the index in
   * whatever order the filesystem answered in.
   */
  summaries.sort((left, right) => left.fileName.localeCompare(right.fileName));

  return { logDir, summaries };
};

interface SelectionReplay {
  timestamp: number;
  metadata: { sceneDesc?: string; session?: SessionType };
  replayName?: string;
}

/**
 * Picks the log belonging to `replay`, or null when the directory holds none of
 * the right session type.
 *
 * Ranking is unchanged from when this lived inside findBestLogFile: track match
 * first, then closeness of the event DateTime, then — for a restarted weekend,
 * where every session shares an event time, track and grid — how close the log
 * was written to the moment the replay was flushed.
 */
export const selectBestLogSummary = <T extends LogSummaryFields>(
  index: LogFileIndex<T>,
  replay: SelectionReplay,
  replayFlushedAt: number | null,
): LogFileSummary<T> | null => {
  const replayTimestamp = replay.timestamp;
  const replaySessionType = replay.metadata?.session;
  const replayTrackAliases = getTrackAliases(
    replay.metadata?.sceneDesc ?? '',
    replay.replayName ?? '',
  );

  const candidates = index.summaries.filter(
    (log) =>
      log.sessionCode === replaySessionType &&
      log.dateTime !== null &&
      log.dateTime !== undefined,
  );

  if (candidates.length === 0) {
    return null;
  }

  const ranked = candidates
    .map((log) => {
      const fileNameTsMatch = log.fileName.match(
        /^(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})-/,
      );
      let fileNameTs = null;
      if (fileNameTsMatch) {
        const dt = new Date(
          Date.UTC(
            Number(fileNameTsMatch[1]),
            Number(fileNameTsMatch[2]) - 1,
            Number(fileNameTsMatch[3]),
            Number(fileNameTsMatch[4]),
            Number(fileNameTsMatch[5]),
            Number(fileNameTsMatch[6]),
          ),
        );
        fileNameTs = Math.floor(dt.getTime() / 1000);
      }

      return {
        log,
        diffSec: Math.abs(replayTimestamp - Number(log.dateTime)),
        trackMatch: tracksLikelyMatch(
          replayTrackAliases,
          log.trackVenue,
          log.trackCourse,
          log.trackEvent,
        ),
        fileNameTs,
      };
    })
    .sort((a, b) => {
      if (a.trackMatch !== b.trackMatch) return b.trackMatch ? 1 : -1;
      if (a.diffSec !== b.diffSec) return a.diffSec - b.diffSec;
      if (
        replayFlushedAt !== null &&
        a.log.writtenAt !== null &&
        b.log.writtenAt !== null
      ) {
        const aFlushDelta = Math.abs(replayFlushedAt - a.log.writtenAt);
        const bFlushDelta = Math.abs(replayFlushedAt - b.log.writtenAt);
        if (aFlushDelta !== bFlushDelta) {
          return aFlushDelta - bFlushDelta;
        }
      }
      if (
        a.fileNameTs !== null &&
        b.fileNameTs !== null &&
        a.fileNameTs !== b.fileNameTs
      ) {
        return (
          Math.abs(replayTimestamp - a.fileNameTs) -
          Math.abs(replayTimestamp - b.fileNameTs)
        );
      }
      return a.log.fileName.localeCompare(b.log.fileName);
    });

  return ranked[0]?.log ?? null;
};
