export interface LMUReplay {
  id?: string;
  hash: string;
  multiplayer?: boolean;
  /**
   * Archive state, applied when replays are read out of the cache. These are
   * view-time decoration only and are never written back to the replay cache —
   * the archive store is the single source of truth.
   */
  archived?: boolean;
  archivedAt?: number;
  archiveNote?: string;
  metadata: {
    sceneDesc: string;
    session: SessionType;
  };
  logData: any;
  logDataDirectory: string;
  logDataFileName: string;
  logDataLoaded?: boolean;
  replayDirectory: string;
  replayName: string;
  size: number;
  timestamp: number;
}

export interface LMUProfileInfo {
  language: string;
  name: string;
  nationality: string;
  nick: string;
  steamID: string;
}

export interface ProfileCacheStore {
  profileInfo: LMUProfileInfo | null;
  hasFetchedProfileInfo: boolean;
  lastFetchedAt: number | null;
}

export type SessionType = 'RACE' | 'QUALIFY' | 'PRACTICE';

export type ReplayGameType = 'race-weekend' | 'multiplayer';
export type ReplayGameTypeFilter = ReplayGameType | '';

export interface GetReplaysRequest {
  forceReplayCacheReset?: boolean;
  gameType?: ReplayGameType;
}

/**
 * A replay the user has removed from the dashboard. Archiving never touches the
 * replay or log files on disk — it only controls what the dashboard lists.
 *
 * Records live outside the `replays` cache key because that cache is wiped on
 * schema bumps and forced resets, either of which would silently un-archive
 * everything the user has cleared.
 */
export interface ArchivedReplayRecord {
  hash: string;
  /**
   * Secondary identity, mirroring the replay cache's own fallback lookup, so a
   * replay that re-hashes stays archived instead of reappearing.
   */
  identityKey: string;
  archivedAt: number;
  note?: string;
}

export type ArchivedReplayStore = Record<string, ArchivedReplayRecord>;

/**
 * A replay LMU Steward copied into the LMU installation on the user's behalf.
 *
 * These live in their own table rather than in the replay cache. That cache is
 * wiped wholesale on schema bumps and forced resets, and losing this record
 * would strand multiple GB of files on disk with nothing in the app able to
 * find or remove them. It is also the only record of which exact files an
 * import wrote, which is what makes deleting them safe.
 */
export interface ImportedReplayRecord {
  hash: string;
  replayName: string;
  sceneDesc: string;
  session: SessionType;
  /** The stamped creation time, equal to the matched log's root DateTime. */
  timestamp: number;
  vcrFileName: string;
  vcrPath: string;
  logFileName: string;
  logPath: string;
  /** Guards delete against a file having been replaced since import. */
  vcrFingerprint: string;
  logFingerprint: string;
  importedAt: number;
  logData: unknown;
  origin: {
    trackFolder: string;
    trackVersion: string;
    trackContentHash: string;
    installPath: string;
  };
  match: {
    method: 'roster' | 'manual' | 'manifest';
    confidence: number | null;
    rosterOverlap: {
      intersection: number;
      vcrCount: number;
      logCount: number;
    } | null;
  };
}

export type ImportedReplayStore = Record<string, ImportedReplayRecord>;

export interface ArchiveReplaysRequest {
  hashes: string[];
  note?: string;
  gameType?: ReplayGameType;
}

export type DashboardSortByOptions = 'date' | 'track' | 'incidents';

export type DashboardSortDirection = 'asc' | 'desc';

/**
 * Dashboard filter and sort state as written to persistent storage. Dates are
 * stored as ISO strings because Dayjs instances do not survive serialization.
 */
export interface PersistedDashboardView {
  filters: {
    dateRange: [string | null, string | null];
    track: string;
    sessionType: string;
    sessionLength: string;
    gameType: ReplayGameTypeFilter;
    carClass: string;
    fieldSize: string;
    multiSingleClass: string;
    incidentCount: string;
  };
  sortBy: DashboardSortByOptions;
  sortDirection: DashboardSortDirection;
}

export type LMUReplayCommands =
  | 'VCRCOMMAND_REVERSESCAN'
  | 'VCRCOMMAND_PLAYBACKWARDS'
  | 'VCRCOMMAND_SLOWBACKWARDS'
  | 'VCRCOMMAND_STOP'
  | 'VCRCOMMAND_SLOW'
  | 'VCRCOMMAND_PLAY'
  | 'VCRCOMMAND_FORWARDSCAN';

export interface LMUStewardAPIResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}

export interface LMUStewardStore {
  replays: Record<string, LMUReplay>;
  replayCacheSchemaVersion?: number;
  replayCacheMigratedFromAppVersion?: string;
  replayCacheMigratedToAppVersion?: string;
}

export interface SessionIncidents {
  trackLimits: number;
  incidents: number;
  penalties: number;
}

export interface SessionMetaData {
  fuelMultiplier: number;
  tireMultiplier: number;
  tireWarmers: boolean;
}

export interface LoadingState {
  loading: boolean;
  percentage: number;
}

export interface ReplaySyncStatus {
  status: 'idle' | 'in-progress' | 'success' | 'error';
  percentage: number;
  processed: number;
  total: number;
  message?: string;
}
