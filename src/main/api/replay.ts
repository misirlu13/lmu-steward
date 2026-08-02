import { CONSTANTS } from '@constants';
import {
  ArchivedReplayRecord,
  ArchivedReplayStore,
  ArchiveReplaysRequest,
  GetReplaysRequest,
  ImportedReplayStore,
  LMUReplay,
  SessionType,
} from '@types';
import { readFile } from 'fs/promises';
import { resolve as resolvePath, join } from 'path';
import { parseStringPromise } from 'xml2js';
import { generateReplayHash } from '../util';
import { readUserSettings, writeUserSettings } from './user-settings';
import { getMainPersistentStore } from '../storage/local-data-store';
import {
  buildLogFileIndex,
  getLogDataSessionType as getLogDataSessionTypeFromIndex,
  LogFileIndex,
  safeModifiedAtSeconds,
  selectBestLogSummary,
} from './log-index';
import {
  parseResultLog,
  ParsedLogXml,
  ParsedRaceResults,
  ResultLogParser,
} from './result-log';
import {
  createCareerLogParser,
  ensureCareerIdentity,
  scanCareer,
} from './career';

const FIRST_RUN_GET_REPLAYS_DELAY_MS = 3000;
const DEFAULT_REPLAY_LOG_MATCH_THRESHOLD_MS = 120_000;
/*
 * Bumped to 2 so the restarted-race fix reaches replays that are already
 * cached. Sync skips any replay it has seen by hash, so without this an
 * existing library would keep the pairings it was given before the fix — and
 * for a restarted weekend those point three of four races at another race's
 * results. Archive state and imported replays live outside this cache and are
 * unaffected; the cost is one resync.
 *
 * Bumped to 3 for the TrackLimitCount fix. Both previous parsers matched the
 * element as `tracklimit` where the log writes `<TrackLimits>`, so every cached
 * replay carries an undefined count and the dashboard renders zero track limits
 * for it. Cached entries are never re-parsed, so only a reset reaches them.
 */
export const REPLAY_CACHE_SCHEMA_VERSION = 3;

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

interface ReplayMetadata {
  sceneDesc?: string;
  session?: SessionType;
}

interface ReplayCacheEntry {
  id?: string;
  metadata?: ReplayMetadata;
  replayDirectory?: string;
  replayName?: string;
  timestamp?: number;
  size?: number;
  hash?: string;
  multiplayer?: boolean;
  logData?: ParsedRaceResults | null;
  logDataLoaded?: boolean;
  archived?: boolean;
  archivedAt?: number;
  archiveNote?: string;
}

interface ReplayStore {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}

interface ReplaySyncProgress {
  processed: number;
  total: number;
  percentage: number;
}

interface ReplaySyncOptions {
  forceReplayCacheReset?: boolean;
}

const isMultiplayerSetting = (setting: unknown): boolean =>
  String(setting ?? '')
    .trim()
    .toLowerCase() === 'multiplayer';

const getReplayMultiplayerFromLogData = (
  logData: ParsedRaceResults | null | undefined,
): boolean => isMultiplayerSetting(logData?.Setting);

const matchesReplayGameTypeFilter = (
  replay: ReplayCacheEntry,
  gameType: GetReplaysRequest['gameType'],
): boolean => {
  if (!gameType) {
    return true;
  }

  const isMultiplayer = Boolean(replay.multiplayer);
  return gameType === 'multiplayer' ? isMultiplayer : !isMultiplayer;
};

export const filterReplaysByGameType = (
  replays: ReplayCacheEntry[],
  gameType: GetReplaysRequest['gameType'],
): ReplayCacheEntry[] =>
  replays.filter((replay) => matchesReplayGameTypeFilter(replay, gameType));

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? 'Unknown error');
};

const store: ReplayStore | null = getMainPersistentStore();

const getReplayStore = (): ReplayStore => {
  if (!store) {
    throw new Error('Replay store is not initialized');
  }

  return store;
};

const buildReplayCacheIdentityKey = (replay: ReplayCacheEntry) => {
  return [
    String(replay?.metadata?.sceneDesc ?? '')
      .trim()
      .toLowerCase(),
    String(replay?.metadata?.session ?? '')
      .trim()
      .toLowerCase(),
    String(replay?.replayName ?? '')
      .trim()
      .toLowerCase(),
    String(replay?.timestamp ?? '').trim(),
    String(replay?.replayDirectory ?? '')
      .trim()
      .toLowerCase(),
  ].join('|');
};

const enforceReplayCacheSchemaVersion = (replayStore: ReplayStore) => {
  const cachedSchemaVersion = Number(
    replayStore.get('replayCacheSchemaVersion') ?? 0,
  );

  if (cachedSchemaVersion !== REPLAY_CACHE_SCHEMA_VERSION) {
    replayStore.set('replays', {});
    replayStore.set('replayCacheSchemaVersion', REPLAY_CACHE_SCHEMA_VERSION);
  }
};

enforceReplayCacheSchemaVersion(store);

const ARCHIVED_REPLAYS_STORE_KEY = 'archivedReplays';
const IMPORTED_REPLAYS_STORE_KEY = 'importedReplays';

export const readImportedReplays = (): ImportedReplayStore => {
  const stored = getReplayStore().get(IMPORTED_REPLAYS_STORE_KEY);

  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return {};
  }

  return stored as ImportedReplayStore;
};

/**
 * Absolute path LMU would report a replay at, used to recognise our own
 * imports in the replay API's listing.
 *
 * Matched on path rather than hash deliberately. A hash is derived from the
 * timestamp, and an import that is later re-paired gets re-stamped and
 * re-hashed; the path it was written to does not move.
 */
const buildReplayFilePath = (replay: {
  replayDirectory?: string;
  replayName?: string;
}): string =>
  join(
    String(replay?.replayDirectory ?? ''),
    `${String(replay?.replayName ?? '')}.Vcr`,
  ).toLowerCase();

const buildImportedPathIndex = (imported: ImportedReplayStore): Set<string> =>
  new Set(
    Object.values(imported).map((record) => record.vcrPath.toLowerCase()),
  );

const readArchivedReplays = (): ArchivedReplayStore => {
  const stored = getReplayStore().get(ARCHIVED_REPLAYS_STORE_KEY);

  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return {};
  }

  return stored as ArchivedReplayStore;
};

const writeArchivedReplays = (archived: ArchivedReplayStore): void => {
  getReplayStore().set(ARCHIVED_REPLAYS_STORE_KEY, archived);
};

const hasUsableIdentityKey = (identityKey: string): boolean =>
  identityKey.replace(/\|/g, '').length > 0;

const buildArchivedIdentityIndex = (
  archived: ArchivedReplayStore,
): Map<string, string> => {
  const index = new Map<string, string>();

  Object.entries(archived).forEach(([key, record]) => {
    if (record?.identityKey && hasUsableIdentityKey(record.identityKey)) {
      index.set(record.identityKey, key);
    }
  });

  return index;
};

/**
 * Resolves the archive record for a replay, falling back to the identity key
 * when the hash misses. Sync itself uses the same two-tier lookup, so a replay
 * whose hash shifts stays archived rather than quietly reappearing.
 */
const findArchivedRecord = (
  replay: ReplayCacheEntry,
  archived: ArchivedReplayStore,
  identityIndex: Map<string, string>,
): ArchivedReplayRecord | undefined => {
  if (replay.hash && archived[replay.hash]) {
    return archived[replay.hash];
  }

  const identityKey = buildReplayCacheIdentityKey(replay);
  if (!hasUsableIdentityKey(identityKey)) {
    return undefined;
  }

  const matchedKey = identityIndex.get(identityKey);
  return matchedKey ? archived[matchedKey] : undefined;
};

/**
 * Decorates cached replays with their archive state. The dashboard receives
 * every replay and decides which view to show, so switching between active and
 * archived costs nothing — no sync, no round trip to the game.
 */
export const applyArchiveState = (
  replays: ReplayCacheEntry[],
  archived: ArchivedReplayStore,
): ReplayCacheEntry[] => {
  const identityIndex = buildArchivedIdentityIndex(archived);

  return replays.map((replay) => {
    const record = findArchivedRecord(replay, archived, identityIndex);

    return {
      ...replay,
      archived: Boolean(record),
      archivedAt: record?.archivedAt,
      archiveNote: record?.note,
    };
  });
};

const readStoredReplays = (): Record<string, ReplayCacheEntry> =>
  (getReplayStore().get('replays') as Record<string, ReplayCacheEntry>) || {};

/**
 * Builds the dashboard's replay list straight from the cache. Deliberately does
 * not sync: the archive actions operate on data that was already synced, and
 * getReplays' full fetch-and-parse pass is far too expensive to run every time
 * a user archives a row.
 */
const readDecoratedReplays = (
  gameType?: GetReplaysRequest['gameType'],
): ReplayCacheEntry[] =>
  applyArchiveState(
    filterReplaysByGameType(Object.values(readStoredReplays()), gameType),
    readArchivedReplays(),
  ).sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0));

const normalizeHashes = (hashes: unknown): string[] => {
  if (!Array.isArray(hashes)) {
    return [];
  }

  return [
    ...new Set(
      hashes
        .map((hash) => String(hash ?? '').trim())
        .filter((hash) => hash.length > 0),
    ),
  ];
};

const normalizeNote = (note: unknown): string => String(note ?? '').trim();

/**
 * Finds the archive store key holding a replay's record, by hash first and
 * identity key second.
 */
const resolveArchivedKey = (
  hash: string,
  storedReplays: Record<string, ReplayCacheEntry>,
  archived: ArchivedReplayStore,
  identityIndex: Map<string, string>,
): string | null => {
  if (archived[hash]) {
    return hash;
  }

  const replay = storedReplays[hash];
  if (!replay) {
    return null;
  }

  const identityKey = buildReplayCacheIdentityKey(replay);
  if (!hasUsableIdentityKey(identityKey)) {
    return null;
  }

  return identityIndex.get(identityKey) ?? null;
};

/**
 * Log Directory - C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Log\Results
 * Replay Directory - C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Replays
 */

/**
 * The session summary, in the shape the dashboard and the replay cache expect.
 *
 * A thin view over the canonical single-pass extractor, which produces this and
 * the career facts together. Kept because the import path and the replay cache
 * only want the summary half.
 */
export const parseLogXml = async (filePath: string): Promise<ParsedLogXml> => {
  const record = await parseResultLog(filePath);

  return { rFactorXML: { RaceResults: record.summary } };
};

export const parseLogXmlFull = async (filePath: string) => {
  const xml = await readFile(filePath, 'utf-8');

  return (await parseStringPromise(xml, {
    explicitArray: false,
    mergeAttrs: true,
  })) as ParsedLogXml;
};

/** Re-exported from log-index, which needs it to summarise a directory. */
export const getLogDataSessionType = (
  logData: ParsedLogXml,
): SessionType | null => getLogDataSessionTypeFromIndex(logData);

interface LogFileData {
  logDataFileName: string | null;
  logData: ParsedLogXml | null;
}

/**
 * When a race is restarted, the weekend produces several sessions that are
 * identical to everything matching looks at: same event DateTime, same track,
 * same session type, same grid. The only thing that separates them is when each
 * one finished — and a replay is flushed at the same moment its result log is
 * written, to within a second.
 *
 * Compared as absolute times rather than by parsing the log's file name, which
 * is local time and would need the recording machine's offset to be meaningful.
 */
const getReplayFlushedAt = (replay: LMUReplay): Promise<number | null> =>
  safeModifiedAtSeconds(
    join(replay.replayDirectory ?? '', `${replay.replayName}.Vcr`),
  );

/**
 * Selects the log belonging to a replay.
 *
 * Retained for callers that hold no index — chiefly the tests, which exercise
 * ranking a directory at a time. Anything syncing or opening more than one
 * replay should build an index once and pass it to getReplayLogData instead;
 * this rebuilds the directory summary on every call.
 */
export const findBestLogFile = async (
  logDir: string,
  replay: LMUReplay,
  parser: ResultLogParser = parseResultLog,
): Promise<LogFileData | null> => {
  try {
    const index = await buildLogFileIndex(logDir, parser);
    const best = selectBestLogSummary(
      index,
      replay,
      await getReplayFlushedAt(replay),
    );

    if (!best) {
      return { logDataFileName: null, logData: null };
    }

    return {
      logDataFileName: best.fileName,
      logData: { rFactorXML: { RaceResults: best.record.summary } },
    };
  } catch {
    return { logDataFileName: null, logData: null };
  }
};

interface LogMetaData {
  logData: ParsedRaceResults | null;
  logDataDirectory: string;
  logDataFileName: string;
}

export const resolveLogDirectoryForReplay = (replay: LMUReplay): string =>
  resolvePath(replay.replayDirectory, '../Log/Results');

/**
 * Builds the results-directory index for a replay's install.
 *
 * Callers that touch more than one replay should build this once and pass it
 * down. Summaries are memoised per file, so a rebuild after nothing changed
 * costs a stat per file rather than a parse.
 */
export const buildReplayLogIndex = (replay: LMUReplay): Promise<LogFileIndex> =>
  buildLogFileIndex(resolveLogDirectoryForReplay(replay));

export const getReplayLogData = async (
  replay: LMUReplay,
  options?: { fullData?: boolean; index?: LogFileIndex },
): Promise<LogMetaData | null> => {
  try {
    const logDataDirectory = resolveLogDirectoryForReplay(replay);
    /*
     * Selection always runs on the cheap streaming summaries, never on whole
     * documents. Asking for full data used to swap the parser for xml2js — for
     * every log in the directory, in parallel, to choose one of them. That is
     * seconds and hundreds of megabytes per replay opened once a 24h log is in
     * the folder.
     */
    const index =
      options?.index?.logDir === logDataDirectory
        ? options.index
        : await buildLogFileIndex(logDataDirectory);

    const best = selectBestLogSummary(
      index,
      replay,
      await getReplayFlushedAt(replay),
    );

    if (!best) {
      return null;
    }

    // Only the one log the replay actually belongs to is read in full.
    const logData = options?.fullData
      ? ((await parseLogXmlFull(best.filePath))?.rFactorXML?.RaceResults ??
        null)
      : best.record.summary;

    if (!logData) {
      return null;
    }

    return {
      logData,
      logDataDirectory,
      logDataFileName: best.fileName,
    };
  } catch {
    return null;
  }
};

/**
 * Cached replays, with just the fields the career needs to pair a session to a
 * replay it can read an event title out of.
 *
 * Deliberately the cache rather than the replay folder: a career enrichment
 * pass must never walk a directory of multi-gigabyte files, and a replay the
 * game no longer lists has nothing to add anyway.
 */
export const getCachedReplaysForCareer = (): {
  logDataFileName?: string;
  replayDirectory?: string;
  replayName?: string;
}[] => {
  const stored =
    (getReplayStore().get('replays') as Record<string, ReplayCacheEntry>) || {};

  return Object.values(stored).map((replay) => ({
    logDataFileName: (replay as { logDataFileName?: string }).logDataFileName,
    replayDirectory: replay.replayDirectory,
    replayName: replay.replayName,
  }));
};

export const getReplayData = async (): Promise<LMUReplay[]> => {
  const response = await fetch(
    `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/replays`,
  );

  if (!response.ok) {
    throw new Error(`API responded with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Replay API returned non-array payload');
  }

  return payload as LMUReplay[];
};

export const syncReplayData = async (
  options?: ReplaySyncOptions & {
    onProgress?: (progress: ReplaySyncProgress) => void;
  },
): Promise<void> => {
  const settings = await readUserSettings();
  const configuredThresholdMs = Number(settings?.replayLogMatchThresholdMs);
  const _replayLogMatchThresholdMs = Number.isFinite(configuredThresholdMs)
    ? Math.max(1_000, configuredThresholdMs)
    : DEFAULT_REPLAY_LOG_MATCH_THRESHOLD_MS;

  const data = await getReplayData();
  const totalReplayCount = data.length;
  let processedReplayCount = 0;

  const reportProgress = () => {
    const percentage =
      totalReplayCount <= 0
        ? 1
        : Math.min(1, processedReplayCount / totalReplayCount);

    options?.onProgress?.({
      processed: processedReplayCount,
      total: totalReplayCount,
      percentage,
    });
  };

  reportProgress();

  const replayStore = getReplayStore();
  const storedReplay = options?.forceReplayCacheReset
    ? {}
    : (replayStore.get('replays') as Record<string, ReplayCacheEntry>) || {};
  const storedReplayEntries = Object.values(storedReplay);
  const storedReplayByIdentity = new Map<string, ReplayCacheEntry>();

  storedReplayEntries.forEach((existingReplay) => {
    const identityKey = buildReplayCacheIdentityKey(existingReplay);
    if (identityKey.replace(/\|/g, '').length > 0) {
      storedReplayByIdentity.set(identityKey, existingReplay);
    }
  });

  const markReplayProcessed = () => {
    processedReplayCount += 1;
    reportProgress();
  };

  /*
   * Imported replays live in their own store and their own dashboard view. The
   * .Vcr is physically in the replay folder, so the game lists it like any
   * other — without this they would be cached here as well and show up twice.
   *
   * Applied regardless of whether experimental features are enabled: turning
   * the flag off must not dump already-imported replays into the active list.
   */
  const importedPaths = buildImportedPathIndex(readImportedReplays());

  /*
   * Built once for the whole sync, not once per replay.
   *
   * Every replay in a run shares an install and therefore a results directory,
   * so re-deriving it per replay meant re-reading and re-parsing the same
   * directory for each one — a first sync of 193 replays against 388 logs is
   * 74 884 parses of the same files. Lazily, because a sync that finds nothing
   * new should not touch the directory at all.
   */
  let logIndex: LogFileIndex | null = null;
  const getLogIndex = async (replay: LMUReplay) => {
    const logDir = resolveLogDirectoryForReplay(replay);
    if (logIndex?.logDir !== logDir) {
      /*
       * Parsed with the career's own parser so this one pass serves both
       * consumers. Matching reads only the session summary, which is identical
       * either way; the career needs its driver names bound in, because
       * isPlayer marks every human on the grid rather than the local one.
       */
      ensureCareerIdentity();
      logIndex = await buildLogFileIndex(logDir, createCareerLogParser());
    }

    return logIndex;
  };

  // Add hash to each replay and store in electron-store
  for (const replay of data) {
    if (importedPaths.has(buildReplayFilePath(replay))) {
      markReplayProcessed();
      await yieldToEventLoop();
      continue;
    }

    const hash = generateReplayHash(replay);
    const identityKey = buildReplayCacheIdentityKey(replay);

    (replay as LMUReplay).hash = hash;
    (replay as LMUReplay).multiplayer = false;
    delete replay.id; // Remove the original ID as it's no longer needed

    const existingReplayByHash = storedReplay[hash];
    if (existingReplayByHash) {
      if (typeof existingReplayByHash.multiplayer !== 'boolean') {
        storedReplay[hash] = {
          ...existingReplayByHash,
          multiplayer: getReplayMultiplayerFromLogData(
            existingReplayByHash.logData,
          ),
        };
      }
      markReplayProcessed();
      await yieldToEventLoop();
      continue;
    }

    const existingReplayByIdentity = storedReplayByIdentity.get(identityKey);
    if (existingReplayByIdentity) {
      const mergedReplayByIdentity: ReplayCacheEntry = {
        ...existingReplayByIdentity,
        ...replay,
        hash,
      };
      storedReplay[hash] = {
        ...mergedReplayByIdentity,
        multiplayer:
          typeof mergedReplayByIdentity.multiplayer === 'boolean'
            ? mergedReplayByIdentity.multiplayer
            : getReplayMultiplayerFromLogData(mergedReplayByIdentity.logData),
      };
      markReplayProcessed();
      await yieldToEventLoop();
      continue;
    }

    if (!storedReplay[hash]) {
      const logMetaData = await getReplayLogData(replay, {
        index: await getLogIndex(replay),
      });

      if (logMetaData) {
        replay.logData = logMetaData.logData;
        replay.logDataDirectory = logMetaData.logDataDirectory;
        replay.logDataFileName = logMetaData.logDataFileName;
        replay.multiplayer = getReplayMultiplayerFromLogData(
          logMetaData.logData,
        );
        replay.logDataLoaded = false;
        storedReplay[hash] = replay;
        storedReplayByIdentity.set(identityKey, replay);
      }
    }

    markReplayProcessed();

    await yieldToEventLoop();
  }

  replayStore.set('replays', storedReplay);

  /*
   * The career rides the index this sync already built, so it costs no extra
   * filesystem work. Deliberately after the replay cache is written and behind
   * its own guard: a career scan that fails must not lose a completed sync.
   *
   * Skipped when the sync never needed the directory — every replay was already
   * cached — because the career is rescanned explicitly from its own page and
   * has nothing new to read either.
   */
  if (logIndex) {
    try {
      await scanCareer({
        index: logIndex,
        /*
         * Only logs this app actually wrote. Importing a replay of a race the
         * user also drove copies no log — theirs is already there — and
         * excluding those would drop their own sessions from their career.
         */
        importedLogPaths: new Set(
          Object.values(readImportedReplays())
            .filter((record) => record.logWasWritten)
            .map((record) => record.logPath)
            .filter((path): path is string => Boolean(path)),
        ),
      });
    } catch {
      // Career data is rebuilt on demand; a failure here is not a sync failure.
    }
  }
};

/**
 * GET
 * Gets all of the available replays
 * /rest/watch/replays
 *
 * RESPONSE
 * [{"id":0,"metadata":{"sceneDesc":"SEBRINGWEC","session":"RACE"},"replayDirectory":"C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays\\","replayName":"Sebring International Raceway R1 9","size":130114953,"timestamp":1771050720},{"id":1,"metadata":{"sceneDesc":"SEBRINGWEC","session":"QUALIFY"},"replayDirectory":"C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays\\","replayName":"Sebring International Raceway Q1 9","size":40256309,"timestamp":1771050720},{"id":2,"metadata":{"sceneDesc":"SEBRINGWEC","session":"PRACTICE"},"replayDirectory":"C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays\\","replayName":"Sebring International Raceway P1 24","size":8675228,"timestamp":1771050720}]
 */
export const getReplays = async (
  event: Electron.IpcMainEvent,
  request?: GetReplaysRequest,
) => {
  let latestProgress: ReplaySyncProgress = {
    processed: 0,
    total: 0,
    percentage: 0,
  };

  try {
    const publishReplaySyncStatus = (payload: {
      status: 'idle' | 'in-progress' | 'success' | 'error';
      percentage: number;
      processed: number;
      total: number;
      message?: string;
    }) => {
      event.reply(CONSTANTS.API.PUSH_REPLAY_SYNC_STATUS, payload);
    };

    try {
      const settings = await readUserSettings();
      const isFirstRun = Boolean(settings?.firstRun ?? true);

      if (isFirstRun) {
        await delay(FIRST_RUN_GET_REPLAYS_DELAY_MS);
        await writeUserSettings({
          firstRun: false,
        });
      }
    } catch (firstRunError) {
      console.warn('Unable to evaluate first-run replay delay:', firstRunError);
    }

    publishReplaySyncStatus({
      status: 'in-progress',
      percentage: 0,
      processed: 0,
      total: 0,
    });

    await syncReplayData({
      forceReplayCacheReset: Boolean(request?.forceReplayCacheReset),
      onProgress: (progress) => {
        latestProgress = progress;
        publishReplaySyncStatus({
          status: 'in-progress',
          percentage: progress.percentage,
          processed: progress.processed,
          total: progress.total,
        });
      },
    });

    publishReplaySyncStatus({
      status: 'success',
      percentage: 1,
      processed: latestProgress.total,
      total: latestProgress.total,
    });

    try {
      await writeUserSettings({
        lastReplaySyncAt: Date.now(),
      });
    } catch (settingsError) {
      console.error('Unable to persist replay sync timestamp:', settingsError);
    }

    event.reply(CONSTANTS.API.GET_REPLAYS, {
      status: 'success',
      data: readDecoratedReplays(request?.gameType),
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.PUSH_REPLAY_SYNC_STATUS, {
      status: 'error',
      percentage: latestProgress.percentage,
      processed: latestProgress.processed,
      total: latestProgress.total,
      message: toErrorMessage(error),
    });

    event.reply(CONSTANTS.API.GET_REPLAYS, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * Removes replays from the dashboard. Nothing on disk is touched — no replay
 * file, no result log — and the cache entry is left intact. Archiving is purely
 * a record in the archive store saying "the user has cleared this".
 */
export const postArchiveReplays = async (
  event: Electron.IpcMainEvent,
  request?: ArchiveReplaysRequest,
) => {
  try {
    const hashes = normalizeHashes(request?.hashes);

    if (hashes.length === 0) {
      throw new Error('No replays were provided to archive');
    }

    const storedReplays = readStoredReplays();
    const archived = readArchivedReplays();
    const note = normalizeNote(request?.note);
    const archivedAt = Date.now();

    hashes.forEach((hash) => {
      const replay = storedReplays[hash];

      archived[hash] = {
        hash,
        identityKey: replay ? buildReplayCacheIdentityKey(replay) : '',
        archivedAt,
        ...(note ? { note } : {}),
      };
    });

    writeArchivedReplays(archived);

    event.reply(CONSTANTS.API.POST_ARCHIVE_REPLAYS, {
      status: 'success',
      data: readDecoratedReplays(request?.gameType),
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_ARCHIVE_REPLAYS, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * Returns archived replays to the dashboard. Drops records matched by hash and
 * by identity key so a replay archived under an older hash is fully released.
 */
export const postRestoreReplays = async (
  event: Electron.IpcMainEvent,
  request?: ArchiveReplaysRequest,
) => {
  try {
    const hashes = normalizeHashes(request?.hashes);

    if (hashes.length === 0) {
      throw new Error('No replays were provided to restore');
    }

    const storedReplays = readStoredReplays();
    const archived = readArchivedReplays();
    const identityIndex = buildArchivedIdentityIndex(archived);
    const keysToRemove = new Set<string>();

    hashes.forEach((hash) => {
      const resolvedKey = resolveArchivedKey(
        hash,
        storedReplays,
        archived,
        identityIndex,
      );

      if (resolvedKey) {
        keysToRemove.add(resolvedKey);
      }
    });

    keysToRemove.forEach((key) => {
      delete archived[key];
    });

    writeArchivedReplays(archived);

    event.reply(CONSTANTS.API.POST_RESTORE_REPLAYS, {
      status: 'success',
      data: readDecoratedReplays(request?.gameType),
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_RESTORE_REPLAYS, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * Sets, replaces, or clears the note on already-archived replays. An empty note
 * clears it. Hashes that are not archived are ignored rather than treated as an
 * error, so a stale selection cannot fail the whole action.
 */
export const postArchiveNote = async (
  event: Electron.IpcMainEvent,
  request?: ArchiveReplaysRequest,
) => {
  try {
    const hashes = normalizeHashes(request?.hashes);

    if (hashes.length === 0) {
      throw new Error('No replays were provided');
    }

    const storedReplays = readStoredReplays();
    const archived = readArchivedReplays();
    const identityIndex = buildArchivedIdentityIndex(archived);
    const note = normalizeNote(request?.note);

    hashes.forEach((hash) => {
      const resolvedKey = resolveArchivedKey(
        hash,
        storedReplays,
        archived,
        identityIndex,
      );

      if (!resolvedKey) {
        return;
      }

      const record = archived[resolvedKey];

      if (note) {
        archived[resolvedKey] = { ...record, note };
        return;
      }

      const { note: _removedNote, ...withoutNote } = record;
      archived[resolvedKey] = withoutNote;
    });

    writeArchivedReplays(archived);

    event.reply(CONSTANTS.API.POST_ARCHIVE_NOTE, {
      status: 'success',
      data: readDecoratedReplays(request?.gameType),
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_ARCHIVE_NOTE, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * GET
 * Gets an existing replay by hash
 * /rest/watch/play/<hash>
 */
export const postWatchReplay = async (
  event: Electron.IpcMainEvent,
  hash: string,
) => {
  try {
    const currentReplays = await getReplayData();
    const replay = currentReplays.find(
      (candidateReplay) => generateReplayHash(candidateReplay) === hash,
    );
    const replayStore = getReplayStore();
    const storedReplay =
      (replayStore.get('replays') as Record<string, ReplayCacheEntry>) || {};
    if (!replay) {
      throw new Error('Replay not found');
    }
    // Call the API to set the replay as active
    const response = await fetch(
      `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/play/${replay.id}`,
    );

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    /*
     * An imported replay already knows which log it belongs to — it was chosen
     * and recorded at import time. Re-deriving it here would put it back
     * through findBestLogFile against the whole results directory, which is
     * exactly the mismatch importing exists to avoid.
     */
    const importedRecord = readImportedReplays()[hash];
    if (importedRecord) {
      const importedLog = await parseLogXmlFull(importedRecord.logPath);

      event.reply(CONSTANTS.API.POST_WATCH_REPLAY, {
        status: 'success',
        data: {
          hash,
          metadata: {
            sceneDesc: importedRecord.sceneDesc,
            session: importedRecord.session,
          },
          replayName: importedRecord.replayName,
          replayDirectory: replay.replayDirectory,
          size: replay.size,
          timestamp: importedRecord.timestamp,
          imported: true,
          importedAt: importedRecord.importedAt,
          logData: importedLog?.rFactorXML?.RaceResults ?? null,
          logDataDirectory: importedRecord.logPath.slice(
            0,
            importedRecord.logPath.length -
              importedRecord.logFileName.length -
              1,
          ),
          logDataFileName: importedRecord.logFileName,
          logDataLoaded: true,
          multiplayer: getReplayMultiplayerFromLogData(
            importedLog?.rFactorXML?.RaceResults,
          ),
        },
      });
      return;
    }

    // One index for both lookups below, rather than a directory scan per call.
    const logIndex = await buildReplayLogIndex(replay);

    let cachedReplay = storedReplay[hash] as LMUReplay | undefined;
    if (!cachedReplay) {
      const logMetaData = await getReplayLogData(replay, { index: logIndex });

      if (!logMetaData) {
        return;
      }

      replay.logData = logMetaData.logData;
      replay.logDataDirectory = logMetaData.logDataDirectory;
      replay.logDataFileName = logMetaData.logDataFileName;
      replay.multiplayer = getReplayMultiplayerFromLogData(logMetaData.logData);
      replay.logDataLoaded = false;
      storedReplay[hash] = replay;
      replayStore.set('replays', storedReplay);
      cachedReplay = storedReplay[hash] as LMUReplay;
    }

    const fullLogMetaData = await getReplayLogData(replay, {
      fullData: true,
      index: logIndex,
    });
    const responseReplay = {
      ...cachedReplay,
      logData: fullLogMetaData?.logData ?? cachedReplay.logData,
      logDataDirectory:
        fullLogMetaData?.logDataDirectory || cachedReplay.logDataDirectory,
      logDataFileName:
        fullLogMetaData?.logDataFileName || cachedReplay.logDataFileName,
      multiplayer: fullLogMetaData?.logData
        ? getReplayMultiplayerFromLogData(fullLogMetaData.logData)
        : typeof cachedReplay.multiplayer === 'boolean'
          ? cachedReplay.multiplayer
          : getReplayMultiplayerFromLogData(cachedReplay.logData),
      logDataLoaded: Boolean(fullLogMetaData?.logData),
    };

    event.reply(CONSTANTS.API.POST_WATCH_REPLAY, {
      status: 'success',
      data: responseReplay,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_WATCH_REPLAY, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * GET
 * Checks to see if the replay is currently active
 * /rest/replay/isActive
 *
 * RESPONSE
 * true / false
 */

export const getIsReplayActive = async (event: Electron.IpcMainEvent) => {
  try {
    const response = await fetch(
      `${CONSTANTS.LMU_API_BASE_URL}/rest/replay/isActive`,
    );

    const rawBody = await response.text();
    const normalizedBody = rawBody.trim().toLowerCase();

    const isKnownInactiveResponse =
      response.status === 400 &&
      normalizedBody.includes(
        'cannot check replay status when not in a session',
      );

    if (response.ok || isKnownInactiveResponse) {
      const isReplayActive = response.ok && normalizedBody === 'true';

      event.reply(CONSTANTS.API.GET_IS_REPLAY_ACTIVE, {
        status: 'success',
        data: isReplayActive,
        message: rawBody,
      });
      return;
    }

    event.reply(CONSTANTS.API.GET_IS_REPLAY_ACTIVE, {
      status: 'error',
      message: rawBody || `API responded with status ${response.status}`,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_IS_REPLAY_ACTIVE, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * PUT
 * Sets the replay time to a specific time provided
 * /rest/watch/replaytime/<time-in-seconds>
 *
 * BODY
 * Unsure but shows <time-in-seconds> as a string
 */

export const putReplayTime = async (
  event: Electron.IpcMainEvent,
  timeInSeconds: string,
) => {
  try {
    const response = await fetch(
      `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/replaytime/${timeInSeconds}`,
      {
        method: 'PUT',
      },
    );

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    event.reply(CONSTANTS.API.PUT_REPLAY_COMMAND_TIME, {
      status: 'success',
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.PUT_REPLAY_COMMAND_TIME, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 *  PUT
 *  Sets the replay command
 *  /rest/watch/replayCommand/<command>
 *
 *  BODY {}
 */

export const putReplayCommand = async (
  event: Electron.IpcMainEvent,
  command: string,
) => {
  try {
    const response = await fetch(
      `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/replayCommand/${command}`,
      {
        method: 'PUT',
      },
    );

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    event.reply(CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN, {
      status: 'success',
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * POST
 * /rest/hud/toggle/<element>
 *
 * BODY
 * element is a string that represents the element to toggle.
 *
 */

interface ToggleUIElementPayload {
  all: boolean;
}

export const postToggleUIElement = async (
  event: Electron.IpcMainEvent,
  element: string | ToggleUIElementPayload,
) => {
  try {
    if (typeof element === 'object' && element.all !== undefined) {
      const hudOnWatchResponse = await fetch(
        `${CONSTANTS.LMU_API_BASE_URL}/rest/sessions/setHudOnWatchScreen`,
        {
          method: 'POST',
          body: JSON.stringify(element.all),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      const setReplayUiVisibleResponse = await fetch(
        `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/replay/setReplayUIVisible`,
        {
          method: 'POST',
          headers: {
            Host: 'localhost:6397',
            Connection: 'keep-alive',
            'Content-Length': '5',
            'sec-ch-ua-platform': '"Windows"',
            'User-Agent': 'RF2CefBrowser/75.0.3770.100',
            'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
            'content-type': 'application/json',
            'sec-ch-ua-mobile': '?0',
            Accept: '*/*',
            Origin: 'http://localhost:6397',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            Referer: 'http://localhost:6397/start/index.html',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          body: `${element.all}`,
        },
      );

      if (!hudOnWatchResponse.ok) {
        throw new Error(
          `API responded with status ${hudOnWatchResponse.status}`,
        );
      }

      if (!setReplayUiVisibleResponse.ok) {
        throw new Error(
          `API responded with status ${setReplayUiVisibleResponse.status}`,
        );
      }

      event.reply(CONSTANTS.API.POST_REPLAY_COMMAND_UI, {
        status: 'success',
      });
    } else {
      const response = await fetch(
        `${CONSTANTS.LMU_API_BASE_URL}/rest/hud/toggle/${element}`,
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }

      event.reply(CONSTANTS.API.POST_REPLAY_COMMAND_UI, {
        status: 'success',
      });
    }
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_REPLAY_COMMAND_UI, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * POST
 * /navigation/action/NAV_TO_MAIN_MENU
 *
 * BODY
 * empty
 *
 */

export const postCloseReplay = async (event: Electron.IpcMainEvent) => {
  try {
    const response = await fetch(
      `${CONSTANTS.LMU_API_BASE_URL}/navigation/action/NAV_TO_MAIN_MENU`,
      {
        method: 'POST',
      },
    );

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    event.reply(CONSTANTS.API.POST_CLOSE_REPLAY, {
      status: 'success',
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_CLOSE_REPLAY, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};
