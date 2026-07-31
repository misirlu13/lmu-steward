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
import { createReadStream } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { resolve as resolvePath, join } from 'path';
import { parseStringPromise } from 'xml2js';
import { generateReplayHash } from '../util';
import { readUserSettings, writeUserSettings } from './user-settings';
import { getMainPersistentStore } from '../storage/local-data-store';

const FIRST_RUN_GET_REPLAYS_DELAY_MS = 3000;
const DEFAULT_REPLAY_LOG_MATCH_THRESHOLD_MS = 120_000;
const REPLAY_CACHE_SCHEMA_VERSION = 1;

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

interface ParsedSessionSummary {
  Minutes?: number;
  DriverCount?: number;
  CarClasses?: string[];
  IncidentCount?: number;
  PenaltyCount?: number;
  TrackLimitCount?: number;
  Stream?: {
    IncidentCount?: number;
    PenaltyCount?: number;
    TrackLimitCount?: number;
  };
  [key: string]: unknown;
}

interface ParsedRaceResults {
  Setting?: string;
  DateTime?: number;
  TrackVenue?: string;
  TrackCourse?: string;
  TrackEvent?: string;
  GameVersion?: string;
  FuelMult?: number;
  TireMult?: number;
  TireWarmers?: string;
  IncidentCount?: number;
  PenaltyCount?: number;
  TrackLimitCount?: number;
  DriverCount?: number;
  Race?: ParsedSessionSummary;
  Qualify?: ParsedSessionSummary;
  Practice1?: ParsedSessionSummary;
}

interface ParsedLogXml {
  rFactorXML?: {
    RaceResults?: ParsedRaceResults;
  };
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

const decodeXmlText = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const parseLogXmlContent = (xml: string): ParsedLogXml => {
  const raceResults: ParsedRaceResults = {};
  let currentValueTag:
    | 'Setting'
    | 'DateTime'
    | 'TrackVenue'
    | 'TrackCourse'
    | 'TrackEvent'
    | 'GameVersion'
    | 'FuelMult'
    | 'TireMult'
    | 'TireWarmers'
    | 'Minutes'
    | 'CarClass'
    | null = null;
  let currentValueText = '';
  let raceResultsDepth = 0;
  let currentSessionType: 'Race' | 'Qualify' | 'Practice1' | null = null;
  let _inDriverTag = false;
  let inStreamTag = false;
  let driverCount = 0;
  let incidentCount = 0;
  let penaltyCount = 0;
  let trackLimitCount = 0;
  let totalDriverCount = 0;
  let totalIncidentCount = 0;
  let totalPenaltyCount = 0;
  let totalTrackLimitCount = 0;
  let currentSessionCarClasses = new Set<string>();

  const commitCurrentValue = () => {
    if (!currentValueTag) {
      return;
    }

    const normalizedValue = decodeXmlText(currentValueText).trim();
    if (currentValueTag === 'Setting') {
      raceResults.Setting = normalizedValue || undefined;
    } else if (currentValueTag === 'DateTime') {
      /**
       * Only the root <DateTime>, which is when LMU created the event — the
       * same instant it stamps onto every .Vcr it writes for that weekend, and
       * therefore what the replay API reports as a replay's timestamp.
       *
       * <Race>/<Qualify>/<Practice1> each carry their own <DateTime> holding
       * that session's start. Those sit at the same nesting depth this parser
       * tracks, so without the session guard the last one wins and every log
       * looks minutes-to-hours later than the replay it belongs to. Two events
       * at one track in an evening then match the wrong way round.
       */
      if (!currentSessionType) {
        raceResults.DateTime = Number(normalizedValue) || undefined;
      }
    } else if (currentValueTag === 'TrackVenue') {
      raceResults.TrackVenue = normalizedValue || undefined;
    } else if (currentValueTag === 'TrackCourse') {
      raceResults.TrackCourse = normalizedValue || undefined;
    } else if (currentValueTag === 'TrackEvent') {
      raceResults.TrackEvent = normalizedValue || undefined;
    } else if (currentValueTag === 'GameVersion') {
      raceResults.GameVersion = normalizedValue || undefined;
    } else if (currentValueTag === 'FuelMult') {
      raceResults.FuelMult = Number(normalizedValue) || undefined;
    } else if (currentValueTag === 'TireMult') {
      raceResults.TireMult = Number(normalizedValue) || undefined;
    } else if (currentValueTag === 'TireWarmers') {
      raceResults.TireWarmers = normalizedValue || undefined;
    } else if (currentValueTag === 'Minutes') {
      if (currentSessionType && raceResults[currentSessionType]) {
        const session = raceResults[currentSessionType] as Record<
          string,
          unknown
        >;
        session.Minutes = Number(normalizedValue) || undefined;
      }
    } else if (currentValueTag === 'CarClass') {
      if (currentSessionType && normalizedValue) {
        currentSessionCarClasses.add(normalizedValue);
      }
    }

    currentValueTag = null;
    currentValueText = '';
  };

  const processTag = (tagText: string) => {
    if (!tagText.startsWith('<') || tagText.startsWith('<!--')) {
      return;
    }

    const isClosingTag = tagText.startsWith('</');
    const isSelfClosingTag = /\/\s*>$/.test(tagText);
    const tagNameMatch = tagText.match(
      /^<\s*(\/)?\s*([A-Za-z0-9:_.-]+)(?:\s[^>]*)?\/?\s*>$/,
    );

    if (!tagNameMatch) {
      return;
    }

    const [, , rawTagName] = tagNameMatch;
    const tagName = rawTagName.toLowerCase();

    if (currentValueTag && (isClosingTag || isSelfClosingTag)) {
      if (tagName === currentValueTag.toLowerCase()) {
        commitCurrentValue();
      }
    }

    if (isClosingTag) {
      if (tagName === 'raceresults' && raceResultsDepth > 0) {
        raceResultsDepth -= 1;
      }
      if (tagName === 'driver') {
        _inDriverTag = false;
      }
      if (tagName === 'stream') {
        inStreamTag = false;
      }
      if (['race', 'qualify', 'practice1'].includes(tagName)) {
        if (currentSessionType && raceResults[currentSessionType]) {
          const session = raceResults[
            currentSessionType
          ] as ParsedSessionSummary;
          session.DriverCount = driverCount || undefined;
          if (currentSessionCarClasses.size > 0) {
            session.CarClasses = Array.from(currentSessionCarClasses);
          }
          session.IncidentCount = incidentCount || undefined;
          session.PenaltyCount = penaltyCount || undefined;
          session.TrackLimitCount = trackLimitCount || undefined;
          session.Stream = {
            IncidentCount: incidentCount || undefined,
            PenaltyCount: penaltyCount || undefined,
            TrackLimitCount: trackLimitCount || undefined,
          };
        }
        currentSessionType = null;
        driverCount = 0;
        incidentCount = 0;
        penaltyCount = 0;
        trackLimitCount = 0;
        currentSessionCarClasses = new Set<string>();
      }
      return;
    }

    if (tagName === 'raceresults') {
      raceResultsDepth += 1;
      return;
    }

    if (raceResultsDepth <= 0) {
      return;
    }

    if (tagName === 'race') {
      raceResults.Race = {};
      currentSessionType = 'Race';
      return;
    }

    if (tagName === 'qualify') {
      raceResults.Qualify = {};
      currentSessionType = 'Qualify';
      return;
    }

    if (tagName === 'practice1') {
      raceResults.Practice1 = {};
      currentSessionType = 'Practice1';
      return;
    }

    if (isSelfClosingTag) {
      if (tagName === 'driver' && currentSessionType) {
        driverCount++;
        totalDriverCount++;
      }
      if (tagName === 'incident' && inStreamTag && currentSessionType) {
        incidentCount++;
        totalIncidentCount++;
      }
      if (tagName === 'penalty' && inStreamTag && currentSessionType) {
        penaltyCount++;
        totalPenaltyCount++;
      }
      if (tagName === 'tracklimit' && inStreamTag && currentSessionType) {
        trackLimitCount++;
        totalTrackLimitCount++;
      }
      return;
    }

    if (tagName === 'datetime') {
      currentValueTag = 'DateTime';
      currentValueText = '';
      return;
    }

    if (tagName === 'setting') {
      currentValueTag = 'Setting';
      currentValueText = '';
      return;
    }

    if (tagName === 'trackvenue') {
      currentValueTag = 'TrackVenue';
      currentValueText = '';
      return;
    }

    if (tagName === 'trackcourse') {
      currentValueTag = 'TrackCourse';
      currentValueText = '';
      return;
    }

    if (tagName === 'trackevent') {
      currentValueTag = 'TrackEvent';
      currentValueText = '';
      return;
    }

    if (tagName === 'gameversion') {
      currentValueTag = 'GameVersion';
      currentValueText = '';
      return;
    }

    if (tagName === 'fuelmult') {
      currentValueTag = 'FuelMult';
      currentValueText = '';
      return;
    }

    if (tagName === 'tiremult') {
      currentValueTag = 'TireMult';
      currentValueText = '';
      return;
    }

    if (tagName === 'tirewarmers') {
      currentValueTag = 'TireWarmers';
      currentValueText = '';
      return;
    }

    if (tagName === 'minutes') {
      currentValueTag = 'Minutes';
      currentValueText = '';
      return;
    }

    if (tagName === 'carclass') {
      currentValueTag = 'CarClass';
      currentValueText = '';
      return;
    }

    if (tagName === 'driver') {
      if (currentSessionType) {
        driverCount++;
        totalDriverCount++;
      }
      _inDriverTag = true;
      return;
    }

    if (tagName === 'incident' && inStreamTag && currentSessionType) {
      incidentCount++;
      totalIncidentCount++;
      return;
    }

    if (tagName === 'penalty' && inStreamTag && currentSessionType) {
      penaltyCount++;
      totalPenaltyCount++;
      return;
    }

    if (tagName === 'tracklimit' && inStreamTag && currentSessionType) {
      trackLimitCount++;
      totalTrackLimitCount++;
      return;
    }

    if (tagName === 'stream') {
      inStreamTag = true;
    }
  };

  let searchFrom = 0;
  for (;;) {
    const openTagIndex = xml.indexOf('<', searchFrom);
    if (openTagIndex === -1) {
      break;
    }

    const closeTagIndex = xml.indexOf('>', openTagIndex + 1);
    if (closeTagIndex === -1) {
      break;
    }

    const textBeforeTag = xml.slice(searchFrom, openTagIndex);
    if (currentValueTag) {
      currentValueText += decodeXmlText(textBeforeTag);
    }

    processTag(xml.slice(openTagIndex, closeTagIndex + 1));
    searchFrom = closeTagIndex + 1;
  }

  if (currentValueTag) {
    currentValueText += decodeXmlText(xml.slice(searchFrom));
    commitCurrentValue();
  }

  if (raceResultsDepth !== 0 || currentValueTag !== null) {
    throw new Error('Malformed XML log');
  }

  raceResults.IncidentCount = totalIncidentCount || undefined;
  raceResults.PenaltyCount = totalPenaltyCount || undefined;
  raceResults.TrackLimitCount = totalTrackLimitCount || undefined;
  raceResults.DriverCount = totalDriverCount || undefined;

  return {
    rFactorXML: {
      RaceResults: raceResults,
    },
  };
};

const parseLogXmlFromStream = async (
  stream: AsyncIterable<string | Buffer>,
): Promise<ParsedLogXml> => {
  const raceResults: ParsedRaceResults = {};
  let currentValueTag:
    | 'Setting'
    | 'DateTime'
    | 'TrackVenue'
    | 'TrackCourse'
    | 'TrackEvent'
    | 'GameVersion'
    | 'FuelMult'
    | 'TireMult'
    | 'TireWarmers'
    | 'Minutes'
    | 'CarClass'
    | null = null;
  let currentValueText = '';
  let raceResultsDepth = 0;
  let pendingText = '';
  let currentSessionType: 'Race' | 'Qualify' | 'Practice1' | null = null;
  let _inDriverTag = false;
  let inStreamTag = false;
  let driverCount = 0;
  let incidentCount = 0;
  let penaltyCount = 0;
  let trackLimitCount = 0;
  let totalDriverCount = 0;
  let totalIncidentCount = 0;
  let totalPenaltyCount = 0;
  let totalTrackLimitCount = 0;
  let currentSessionCarClasses = new Set<string>();

  const commitCurrentValue = () => {
    if (!currentValueTag) {
      return;
    }

    const normalizedValue = decodeXmlText(currentValueText).trim();
    if (currentValueTag === 'Setting') {
      raceResults.Setting = normalizedValue || undefined;
    } else if (currentValueTag === 'DateTime') {
      /**
       * Only the root <DateTime>, which is when LMU created the event — the
       * same instant it stamps onto every .Vcr it writes for that weekend, and
       * therefore what the replay API reports as a replay's timestamp.
       *
       * <Race>/<Qualify>/<Practice1> each carry their own <DateTime> holding
       * that session's start. Those sit at the same nesting depth this parser
       * tracks, so without the session guard the last one wins and every log
       * looks minutes-to-hours later than the replay it belongs to. Two events
       * at one track in an evening then match the wrong way round.
       */
      if (!currentSessionType) {
        raceResults.DateTime = Number(normalizedValue) || undefined;
      }
    } else if (currentValueTag === 'TrackVenue') {
      raceResults.TrackVenue = normalizedValue || undefined;
    } else if (currentValueTag === 'TrackCourse') {
      raceResults.TrackCourse = normalizedValue || undefined;
    } else if (currentValueTag === 'TrackEvent') {
      raceResults.TrackEvent = normalizedValue || undefined;
    } else if (currentValueTag === 'GameVersion') {
      raceResults.GameVersion = normalizedValue || undefined;
    } else if (currentValueTag === 'FuelMult') {
      raceResults.FuelMult = Number(normalizedValue) || undefined;
    } else if (currentValueTag === 'TireMult') {
      raceResults.TireMult = Number(normalizedValue) || undefined;
    } else if (currentValueTag === 'TireWarmers') {
      raceResults.TireWarmers = normalizedValue || undefined;
    } else if (currentValueTag === 'Minutes') {
      if (currentSessionType && raceResults[currentSessionType]) {
        (raceResults[currentSessionType] as Record<string, unknown>).Minutes =
          Number(normalizedValue) || undefined;
      }
    } else if (currentValueTag === 'CarClass') {
      if (currentSessionType && normalizedValue) {
        currentSessionCarClasses.add(normalizedValue);
      }
    }

    currentValueTag = null;
    currentValueText = '';
  };

  const processText = (text: string) => {
    if (currentValueTag) {
      currentValueText += decodeXmlText(text);
    }
  };

  const processTag = (tagText: string) => {
    if (!tagText.startsWith('<') || tagText.startsWith('<!--')) {
      return;
    }

    const isClosingTag = tagText.startsWith('</');
    const isSelfClosingTag = /\/\s*>$/.test(tagText);
    const tagNameMatch = tagText.match(
      /^<\s*(\/)?\s*([A-Za-z0-9:_.-]+)(?:\s[^>]*)?\/?\s*>$/,
    );

    if (!tagNameMatch) {
      return;
    }

    const [, , rawTagName] = tagNameMatch;
    const tagName = rawTagName.toLowerCase();

    if (currentValueTag && (isClosingTag || isSelfClosingTag)) {
      if (tagName === currentValueTag.toLowerCase()) {
        commitCurrentValue();
      }
    }

    if (isClosingTag) {
      if (tagName === 'raceresults' && raceResultsDepth > 0) {
        raceResultsDepth -= 1;
      }
      if (tagName === 'driver') {
        _inDriverTag = false;
      }
      if (tagName === 'stream') {
        inStreamTag = false;
      }
      if (['race', 'qualify', 'practice1'].includes(tagName)) {
        if (currentSessionType && raceResults[currentSessionType]) {
          const session = raceResults[
            currentSessionType
          ] as ParsedSessionSummary;
          session.DriverCount = driverCount || undefined;
          if (currentSessionCarClasses.size > 0) {
            session.CarClasses = Array.from(currentSessionCarClasses);
          }
          session.IncidentCount = incidentCount || undefined;
          session.PenaltyCount = penaltyCount || undefined;
          session.TrackLimitCount = trackLimitCount || undefined;
          session.Stream = {
            IncidentCount: incidentCount || undefined,
            PenaltyCount: penaltyCount || undefined,
            TrackLimitCount: trackLimitCount || undefined,
          };
        }
        currentSessionType = null;
        driverCount = 0;
        incidentCount = 0;
        penaltyCount = 0;
        trackLimitCount = 0;
        currentSessionCarClasses = new Set<string>();
      }
      return;
    }

    if (tagName === 'raceresults') {
      raceResultsDepth += 1;
      return;
    }

    if (raceResultsDepth <= 0) {
      return;
    }

    if (tagName === 'race') {
      raceResults.Race = {};
      currentSessionType = 'Race';
      return;
    }

    if (tagName === 'qualify') {
      raceResults.Qualify = {};
      currentSessionType = 'Qualify';
      return;
    }

    if (tagName === 'practice1') {
      raceResults.Practice1 = {};
      currentSessionType = 'Practice1';
      return;
    }

    if (isSelfClosingTag) {
      if (tagName === 'driver' && currentSessionType) {
        driverCount++;
        totalDriverCount++;
      }
      if (tagName === 'incident' && inStreamTag && currentSessionType) {
        incidentCount++;
        totalIncidentCount++;
      }
      if (tagName === 'penalty' && inStreamTag && currentSessionType) {
        penaltyCount++;
        totalPenaltyCount++;
      }
      if (tagName === 'tracklimit' && inStreamTag && currentSessionType) {
        trackLimitCount++;
        totalTrackLimitCount++;
      }
      return;
    }

    if (tagName === 'datetime') {
      currentValueTag = 'DateTime';
      currentValueText = '';
      return;
    }

    if (tagName === 'setting') {
      currentValueTag = 'Setting';
      currentValueText = '';
      return;
    }

    if (tagName === 'trackvenue') {
      currentValueTag = 'TrackVenue';
      currentValueText = '';
      return;
    }

    if (tagName === 'trackcourse') {
      currentValueTag = 'TrackCourse';
      currentValueText = '';
      return;
    }

    if (tagName === 'trackevent') {
      currentValueTag = 'TrackEvent';
      currentValueText = '';
      return;
    }

    if (tagName === 'gameversion') {
      currentValueTag = 'GameVersion';
      currentValueText = '';
      return;
    }

    if (tagName === 'fuelmult') {
      currentValueTag = 'FuelMult';
      currentValueText = '';
      return;
    }

    if (tagName === 'tiremult') {
      currentValueTag = 'TireMult';
      currentValueText = '';
      return;
    }

    if (tagName === 'tirewarmers') {
      currentValueTag = 'TireWarmers';
      currentValueText = '';
      return;
    }

    if (tagName === 'minutes') {
      currentValueTag = 'Minutes';
      currentValueText = '';
      return;
    }

    if (tagName === 'carclass') {
      currentValueTag = 'CarClass';
      currentValueText = '';
      return;
    }

    if (tagName === 'driver') {
      if (currentSessionType) {
        driverCount++;
        totalDriverCount++;
      }
      _inDriverTag = true;
      return;
    }

    if (tagName === 'incident' && inStreamTag && currentSessionType) {
      incidentCount++;
      totalIncidentCount++;
      return;
    }

    if (tagName === 'penalty' && inStreamTag && currentSessionType) {
      penaltyCount++;
      totalPenaltyCount++;
      return;
    }

    if (tagName === 'tracklimit' && inStreamTag && currentSessionType) {
      trackLimitCount++;
      totalTrackLimitCount++;
      return;
    }

    if (tagName === 'stream') {
      inStreamTag = true;
    }
  };

  for await (const chunk of stream) {
    const chunkText = typeof chunk === 'string' ? chunk : chunk.toString();
    const combinedText = pendingText + chunkText;
    let searchFrom = 0;

    for (;;) {
      const openTagIndex = combinedText.indexOf('<', searchFrom);
      if (openTagIndex === -1) {
        pendingText = combinedText.slice(searchFrom);
        break;
      }

      const closeTagIndex = combinedText.indexOf('>', openTagIndex + 1);
      if (closeTagIndex === -1) {
        pendingText = combinedText.slice(openTagIndex);
        break;
      }

      processText(combinedText.slice(searchFrom, openTagIndex));
      processTag(combinedText.slice(openTagIndex, closeTagIndex + 1));
      searchFrom = closeTagIndex + 1;
    }
  }

  processText(pendingText);

  if (currentValueTag) {
    commitCurrentValue();
  }

  if (raceResultsDepth !== 0 || currentValueTag !== null) {
    throw new Error('Malformed XML log');
  }

  // Store aggregate counts at root level
  raceResults.IncidentCount = totalIncidentCount || undefined;
  raceResults.PenaltyCount = totalPenaltyCount || undefined;
  raceResults.TrackLimitCount = totalTrackLimitCount || undefined;
  raceResults.DriverCount = totalDriverCount || undefined;

  return {
    rFactorXML: {
      RaceResults: raceResults,
    },
  };
};

export const parseLogXml = async (filePath: string) => {
  try {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    return await parseLogXmlFromStream(stream);
  } catch {
    const xml = await readFile(filePath, 'utf-8');
    return parseLogXmlContent(xml);
  }
};

export const parseLogXmlFull = async (filePath: string) => {
  const xml = await readFile(filePath, 'utf-8');

  return (await parseStringPromise(xml, {
    explicitArray: false,
    mergeAttrs: true,
  })) as ParsedLogXml;
};

export const getLogDataSessionType = (
  logData: ParsedLogXml,
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

interface LogFileData {
  logDataFileName: string | null;
  logData: ParsedLogXml | null;
}

const TRACK_ALIAS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bout(er)?\s+circuit\b/g, 'international circuit'],
  [/\bcurva\s+grande\s+circuit\b/g, 'nazionale monza'],
  [/\s*-\s*elms\b/g, ''],
];

const normalizeTrackText = (value: string): string => {
  let normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  TRACK_ALIAS_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement).trim();
  });

  return normalized.replace(/\s+/g, ' ').trim();
};

const getSessionCodeFromFileName = (fileName: string): SessionType | null => {
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

const getReplayTrackAliases = (replay: LMUReplay): string[] => {
  // Build alias list exactly as in the evaluator script
  const meta =
    CONSTANTS.TRACK_META_DATA[
      replay.metadata.sceneDesc as keyof typeof CONSTANTS.TRACK_META_DATA
    ];
  let aliases: string[] = [];
  if (meta) {
    if (typeof meta.displayName === 'string') aliases.push(meta.displayName);
    if (Array.isArray((meta as any).aliases))
      aliases = aliases.concat((meta as any).aliases);
  }
  // Always include the normalized replayName as a fallback
  const replayTrack = String(replay.replayName ?? '').replace(
    /\s+[RQP]\d+\s+\d+$/i,
    '',
  );
  if (replayTrack && !aliases.includes(replayTrack)) aliases.push(replayTrack);
  return aliases
    .filter((v): v is string => typeof v === 'string' && !!v)
    .map((v) => normalizeTrackText(v))
    .filter(Boolean);
};

const tracksLikelyMatch = (
  replayTrackAliases: string[],
  logTrackVenue: string,
  logTrackCourse?: string,
  logTrackEvent?: string,
): boolean => {
  // Match logic: any alias matches any log field (exact or substring, both ways)
  const logFields = [logTrackVenue, logTrackCourse, logTrackEvent]
    .map((v) => normalizeTrackText(String(v ?? '')))
    .filter(Boolean);
  for (const alias of replayTrackAliases) {
    for (const field of logFields) {
      if (alias === field || alias.includes(field) || field.includes(alias)) {
        return true;
      }
    }
  }
  return false;
};

export const findBestLogFile = async (
  logDir: string,
  replay: LMUReplay,
  parser: (filePath: string) => Promise<ParsedLogXml> = parseLogXml,
): Promise<LogFileData | null> => {
  try {
    const files = (await readdir(logDir)).filter((file) =>
      file.endsWith('.xml'),
    );
    const replayTimestamp = replay.timestamp;
    const replaySessionType = replay.metadata.session;
    const replayTrackAliases = getReplayTrackAliases(replay);

    const logSummaries = (
      await Promise.allSettled(
        files.map(async (file) => {
          const fileData = await parser(join(logDir, file));
          const raceResults = fileData?.rFactorXML?.RaceResults || {};
          return {
            fileName: file,
            dateTime: raceResults?.DateTime ?? null,
            sessionCode:
              getLogDataSessionType(fileData) ||
              getSessionCodeFromFileName(file),
            trackVenue: raceResults?.TrackVenue || '',
            trackCourse: raceResults?.TrackCourse || '',
            trackEvent: raceResults?.TrackEvent || '',
            fileData,
          };
        }),
      )
    ).flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );

    const candidates = logSummaries.filter(
      (log) =>
        log.sessionCode === replaySessionType &&
        log.dateTime !== null &&
        log.dateTime !== undefined,
    );
    if (candidates.length === 0) {
      return { logDataFileName: null, logData: null };
    }

    const ranked = candidates
      .map((log) => {
        const diff = Math.abs(replayTimestamp - Number(log.dateTime));
        const trackMatch = tracksLikelyMatch(
          replayTrackAliases,
          log.trackVenue,
          log.trackCourse,
          log.trackEvent,
        );
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
          ...log,
          diffSec: diff,
          trackMatch,
          fileNameTs,
        };
      })
      .sort((a, b) => {
        if (a.trackMatch !== b.trackMatch) return b.trackMatch ? 1 : -1;
        if (a.diffSec !== b.diffSec) return a.diffSec - b.diffSec;
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
        return a.fileName.localeCompare(b.fileName);
      });

    const best = ranked[0];
    return {
      logDataFileName: best?.fileName ?? null,
      logData: best?.fileData ?? null,
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

export const getReplayLogData = async (
  replay: LMUReplay,
  options?: { fullData?: boolean },
): Promise<LogMetaData | null> => {
  try {
    const { replayDirectory } = replay;
    const logDataDirectory = resolvePath(replayDirectory, '../Log/Results');
    const logData = await findBestLogFile(
      logDataDirectory,
      replay,
      options?.fullData ? parseLogXmlFull : parseLogXml,
    );

    if (!logData || !logData.logDataFileName || !logData.logData) {
      return null;
    }

    const logMetaData: LogMetaData = {
      logData: logData?.logData?.rFactorXML?.RaceResults || null,
      logDataDirectory,
      logDataFileName: logData?.logDataFileName || '',
    };
    return logMetaData;
  } catch {
    return null;
  }
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
      const logMetaData = await getReplayLogData(replay);

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

    let cachedReplay = storedReplay[hash] as LMUReplay | undefined;
    if (!cachedReplay) {
      const logMetaData = await getReplayLogData(replay);

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

    const fullLogMetaData = await getReplayLogData(replay, { fullData: true });
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
