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
  /**
   * View-time decoration for replays this app copied into the LMU install.
   * Sourced from the imported_replays table, never written to the replay cache.
   */
  imported?: boolean;
  importedAt?: number;
  importMatchConfidence?: number | null;
  importMatchMethod?: 'roster' | 'manual' | 'manifest';
  importVcrFileName?: string;
  importLogFileName?: string;
  importVcrPath?: string;
  importLogPath?: string;
  importOriginInstallPath?: string;
  /** The note written when this replay was imported. */
  importNote?: string;
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
  /**
   * Name as written into the LMU install. May differ from the file the user
   * chose, because a colliding name is given an "(imported)" marker — and this
   * is the name LMU reports, so it is what the hash is built from.
   */
  replayName: string;
  /** Name of the file the user picked, kept for display and provenance. */
  originalReplayName: string;
  sceneDesc: string;
  session: SessionType;
  /** The stamped creation time, equal to the matched log's root DateTime. */
  timestamp: number;
  vcrFileName: string;
  vcrPath: string;
  /** Byte size of the copied .Vcr, so the UI can report scale without a stat. */
  size: number;
  logFileName: string;
  logPath: string;
  /**
   * Whether this import actually wrote the log, or found it already there.
   *
   * Delete depends on it. A steward who raced in the event already has its
   * result log, so importing another driver's replay of that race copies
   * nothing — and removing the log on delete would destroy a file the app never
   * placed.
   */
  logWasWritten: boolean;
  /** Guards delete against a file having been replaced since import. */
  vcrFingerprint: string;
  logFingerprint: string;
  importedAt: number;
  /**
   * What the steward wrote about this hand-off when importing it.
   *
   * Provenance, not review state — who sent it, which protest it belongs to,
   * what to look for. Kept on the imported record rather than in the archive
   * store because an imported replay is never archived, so the archive note has
   * nowhere to live for it.
   */
  note?: string;
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

/**
 * The dashboard's three mutually exclusive lists. Imported replays are not
 * archivable, which this expresses structurally: an imported replay is never in
 * the active list where the archive action lives.
 */
export type DashboardViewMode = 'active' | 'archived' | 'imported';

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

/**
 * One session the user drove, as the driver dashboard remembers it.
 *
 * These records are the whole point of the feature: they outlive the files they
 * were derived from. A result log the user deletes takes its session with it —
 * no scan can bring it back — so scanning only ever adds and updates rows, and
 * a vanished source file marks `filePresent` rather than removing anything.
 *
 * They live in their own table for the same reason imported replays do. The
 * replay cache is emptied wholesale on schema bumps and forced resets, and a
 * career kept there would be erased by a routine version bump.
 */
export interface CareerSessionRecord {
  /**
   * Derived from the session's own content, not its file name, so a log that is
   * renamed, moved or re-imported updates its row instead of duplicating it.
   * Restarted races differ in session start time and so remain distinct.
   */
  sessionKey: string;
  driverName: string;
  startedAt: number;
  sessionType: SessionType;
  /** `Multiplayer` or `Race Weekend`, straight from the log. */
  setting: string;
  trackVenue: string;
  trackFolder: string;
  /**
   * The layout, not the venue. One track folder can hold several — Imola ships
   * IMOLAWEC and IMOLAELMS — and lap times from different layouts must never
   * share a personal-best row.
   */
  trackLayout: string;
  trackVersion: string;
  trackLengthM: number;
  trackEvent: string;
  gameVersion: string;
  carClass: string;
  carType: string;
  carNumber: string;
  teamName: string;
  aids: string;
  gridPos: number | null;
  classGridPos: number | null;
  finishPos: number | null;
  classFinishPos: number | null;
  lapsCompleted: number;
  pitstops: number;
  finishStatus: string;
  dnfReason: string | null;
  finishTimeSec: number | null;
  bestLapSec: number | null;
  theoreticalBestSec: number | null;
  averageLapSec: number | null;
  lapStdDevSec: number | null;
  topSpeedKph: number | null;
  lapsLed: number;
  firstLapPos: number | null;
  timedLapCount: number;
  /** Fastest lap anyone set, which is what a pace comparison needs. */
  sessionBestLapSec: number | null;
  classBestLapSec: number | null;
  fieldSize: number;
  classFieldSize: number;
  aiCount: number;
  humanCount: number;
  classes: string[];
  incidentsCaused: number;
  incidentsInvolved: number;
  incidentForceMax: number;
  contactWithVehicle: number;
  contactWithScenery: number;
  /** Contacts with each other driver, by name. Feeds the nemesis card. */
  contactByOpponent?: Record<string, number>;
  penalties: { penalty: string; reason: string; timeSec: number | null }[];
  trackLimitWarnings: number;
  trackLimitInvalidLaps: number;
  opponents: { name: string; carClass: string; isAi: boolean }[];
  sourceFileName: string;
  sourcePath: string;
  /** Size and mtime, so an unchanged log is skipped rather than re-parsed. */
  sourceFingerprint: string | null;
  /** Display only. A missing file never removes the record. */
  filePresent: boolean;
  /** User-set: keep the session in the library but out of every statistic. */
  excluded: boolean;
  firstSeenAt: number;
  /**
   * Which shape of record this is.
   *
   * A stored record is never re-parsed while its log is unchanged, so one
   * written before a field existed would never gain it. Bumping this re-reads
   * the logs still on disk; records whose logs have gone keep what they were
   * written with, because nothing can improve them and nothing may drop them.
   */
  recordVersion?: number;
  /** Official-event identity, from the paired replay. Absent for most sessions. */
  eventTitle?: string;
  eventType?: string;
  splitNo?: number;
  /**
   * Whether a paired replay has already been read for event identity.
   *
   * Most replays carry none — only the newest format does — so without this the
   * enrichment pass re-reads the same trailers on every scan forever, finding
   * nothing each time. Cleared by a re-parse, which is when a fresh look is
   * actually warranted.
   */
  eventChecked?: boolean;
}

/**
 * Who the career belongs to.
 *
 * `primary` comes from the LMU profile. `aliases` covers renames and second
 * profiles, and `unclaimed` holds names found in logs this app did not import
 * but does not recognise — surfaced so the user can claim them rather than
 * silently folding someone else's sessions into their own history.
 */
export interface CareerIdentity {
  primary: string;
  aliases: string[];
  unclaimed: { name: string; sessionCount: number }[];
}

export interface CareerScanReport {
  scannedAt: number;
  logsSeen: number;
  logsParsed: number;
  sessionsRecorded: number;
  /** Records whose source log is no longer on disk. */
  sessionsMissingFiles: number;
  skippedImported: number;
  skippedUnclaimed: number;
}

export interface CareerTrackSummary {
  trackFolder: string;
  trackLayout: string;
  trackVenue: string;
  sessions: number;
  races: number;
  wins: number;
  podiums: number;
  bestClassGridPos: number | null;
  bestClassFinishPos: number | null;
  bestLapSec: number | null;
  /** Sum of the best sectors ever turned here — quicker than any lap driven. */
  theoreticalBestSec: number | null;
  /**
   * How far off the quickest lap in the session the driver's own best was, as a
   * fraction, averaged. The one pace figure that survives a change of car,
   * track and field quality, which a raw personal best does not.
   */
  averageGapToSessionBest: number | null;
  averageLapSec: number | null;
  consistencySec: number | null;
  topSpeedKph: number | null;
  /** Personal bests in the order they were set, improvements only. */
  bestLapHistory: { at: number; sec: number }[];
  averageFinishPercentile: number | null;
  lapsCompleted: number;
  distanceKm: number;
  incidentsCaused: number;
  incidentsPer100Km: number | null;
  lastRacedAt: number;
}

export interface CareerCarSummary {
  carType: string;
  carClass: string;
  sessions: number;
  races: number;
  wins: number;
  podiums: number;
  bestLapSec: number | null;
  averageFinishPercentile: number | null;
  lapsCompleted: number;
  distanceKm: number;
  averageGapToSessionBest: number | null;
}

export interface CareerAggregate {
  identity: CareerIdentity;
  headline: {
    firstSessionAt: number | null;
    lastSessionAt: number | null;
    sessions: number;
    races: number;
    qualifying: number;
    practice: number;
    multiplayerSessions: number;
    raceWeekendSessions: number;
    lapsCompleted: number;
    distanceKm: number;
    timeOnTrackSec: number;
    tracks: number;
    layouts: number;
    cars: number;
    classes: number;
  };
  results: {
    wins: number;
    podiums: number;
    topFives: number;
    poles: number;
    frontRows: number;
    winsMultiplayer: number;
    winsRaceWeekend: number;
    podiumsMultiplayer: number;
    podiumsRaceWeekend: number;
    averageClassFinish: number | null;
    averageClassGrid: number | null;
    bestClassFinish: number | null;
    worstClassFinish: number | null;
    finishes: number;
    dnfs: number;
    dnfMechanical: number;
    dnfAccident: number;
    disqualifications: number;
    netPositionsGained: number;
    bestComeback: number | null;
    lapsLed: number;
    finishDistribution: { position: number; count: number }[];
  };
  discipline: {
    incidentsCaused: number;
    incidentsInvolved: number;
    incidentsPer100Km: number | null;
    contactWithVehicle: number;
    contactWithScenery: number;
    worstImpactForce: number;
    penalties: number;
    penaltiesByReason: { reason: string; count: number }[];
    trackLimitWarnings: number;
    trackLimitInvalidLaps: number;
    longestCleanStreak: number;
  };
  pace: {
    /**
     * Averaged over every session with a timed lap. Negative is impossible —
     * you cannot be quicker than the quickest lap of a session you were in.
     */
    averageGapToSessionBest: number | null;
    /** The same figure over the most recent sessions, for form. */
    recentGapToSessionBest: number | null;
    averageConsistencySec: number | null;
    topSpeedKph: number | null;
    /** Personal bests, quickest gap to the session best first. */
    strongestLayouts: CareerTrackSummary[];
    weakestLayouts: CareerTrackSummary[];
  };
  rivals: {
    mostRaced: CareerRival[];
    /** Most contact with, which is a different list from most raced against. */
    nemeses: CareerRival[];
    averageFieldSize: number | null;
    humanShare: number | null;
  };
  events: {
    /** Official events, from paired replays. Empty when none are known. */
    byTitle: { title: string; type: string; sessions: number }[];
    /**
     * Sessions by event type — `daily`, `quick-race`.
     *
     * Kept separate from `byTitle` because most events carry a type and no
     * title: 18 of 22 in a real library. Listing only titles would make the
     * majority of what the replays know invisible, and the type is the part
     * that distinguishes a quick race from a full weekend, which the result log
     * calls the same thing.
     */
    byType: { type: string; sessions: number }[];
    averageSplit: number | null;
  };
  activity: {
    /** Sessions per day, for the calendar. Epoch seconds at local midnight. */
    byDay: { day: number; sessions: number }[];
    byHour: number[];
    byWeekday: number[];
    practicePerRace: number | null;
    /** Driver aids seen, oldest first, so a habit changing is visible. */
    aidUsage: {
      aid: string;
      firstSeenAt: number;
      lastSeenAt: number;
      sessions: number;
    }[];
  };
  milestones: CareerMilestone[];
  tracks: CareerTrackSummary[];
  cars: CareerCarSummary[];
  filterOptions: CareerFilterOptions;
  /** Newest first, for the recent-form strip. */
  recentSessions: CareerSessionRecord[];
  dataHealth: {
    sessionsWithMissingFiles: number;
    excludedSessions: number;
    lastScan: CareerScanReport | null;
  };
}

export interface CareerSummaryResponse {
  aggregate: CareerAggregate;
}

/**
 * What the page is currently scoped to. Every figure in the aggregate honours
 * it, so the same dashboard reads as "my 2026 GT3 multiplayer season" on demand.
 */
export interface CareerFilters {
  /** Epoch seconds, inclusive. */
  from?: number | null;
  to?: number | null;
  gameType?: 'multiplayer' | 'race-weekend' | null;
  carClass?: string | null;
  trackFolder?: string | null;
}

/**
 * Derived from every session rather than the filtered ones, so the available
 * choices do not disappear as the user narrows the view.
 */
export interface CareerFilterOptions {
  tracks: { trackFolder: string; trackVenue: string }[];
  carClasses: string[];
  earliestAt: number | null;
  latestAt: number | null;
}

export interface CareerRival {
  name: string;
  sessions: number;
  contacts: number;
}

export interface CareerMilestone {
  key: string;
  label: string;
  detail: string;
  achievedAt: number;
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

export type LiveCaptureState = 'detached' | 'live';

export interface LiveSessionStatus {
  state: LiveCaptureState;
  trackName?: string;
  sessionType?: SessionType;
  driverCount?: number;
  detail?: string;
}

export type LiveIndicatorState = 'unavailable' | 'standby' | 'live';

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
