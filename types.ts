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
  /** Session time left, seconds. Absent when no session is live. */
  timeRemainingSeconds?: number;
  /**
   * Raw mGamePhase: 5 green, 7 stopped, 8 session over. Values 1-4 are race
   * start procedure and 6 is FCY, which LMU does not meaningfully implement.
   */
  gamePhase?: number;

  /*
    Session conditions, all read from ScoringInfoV01 by the sidecar.

    Every one of these is optional and absent means absent. Two separate things
    make a value absent and neither may be rendered as a zero: a sidecar built
    before these fields existed emits nothing at all, and LMU itself leaves
    values unfilled outside a session.
  */

  /** Current time of day, seconds since midnight. */
  timeOfDay?: number;
  /** Time of day the session started, seconds since midnight (mStartET). */
  startTimeOfDay?: number;
  /** Ambient air temperature, °C. */
  ambientTempC?: number;
  /** Track surface temperature, °C. */
  trackTempC?: number;
  /** Rain severity, 0-1. */
  raining?: number;
  /**
   * Cloud darkness, 0-1. The SDK's own comment is "cloud darkness? 0.0-1.0",
   * question mark included; prefer `cloudCoverage` where both are present.
   */
  darkCloud?: number;
  /**
   * LMU's own cloud cover byte, not part of the base rF2 struct and
   * undocumented beyond its type.
   *
   * Observed live as a small integer, not a percentage — 1 in a clear practice
   * session and 0 in a clear qualifying session on the same day, while
   * `darkCloud` sat at 0.000 throughout. It appears to be a step or an enum.
   * Carried raw; do not render it as a number until a cloudy session says what
   * the scale is.
   */
  cloudCoverage?: number;
  /**
   * LMU's own track grip byte. Undocumented, and observed live as a small
   * integer (a constant 3 across practice and qualifying), not a percentage.
   * Carried raw.
   */
  trackGripLevel?: number;
  /** Wetness on the racing line, 0-1. */
  minPathWetness?: number;
  maxPathWetness?: number;
  avgPathWetness?: number;
  /**
   * Full-course flag state: 0 none, 1 pending, 2 pits closed, 3 pit lead lap,
   * 4 pits open, 5 last lap, 6 resume, 7 race halt. LMU's own -1 (invalid) is
   * dropped rather than carried.
   *
   * Unverified against live behaviour — `gamePhase` handling already treats FCY
   * as green because LMU does not meaningfully implement it, and this may well
   * sit at 0 for the same reason. Do not build UI on it before a session with a
   * real caution says otherwise.
   */
  yellowFlagState?: number;
  /** Server name, when hosted. Absent offline. */
  serverName?: string;
}

export type LiveIndicatorState = 'unavailable' | 'standby' | 'live';

export type LiveIncidentKind = 'incident' | 'track-limits' | 'penalty';

export interface LiveIncidentParty {
  slotId?: number;
  displayName: string;
}

export interface LiveCaptureIncident {
  id: string;
  kind: LiveIncidentKind;
  etSeconds: number;
  raw: string;
  parties: LiveIncidentParty[];
  /** For contact events: what was struck — another vehicle, Immovable, Cone, Sign. */
  objectStruck?: string;
  /** Contact magnitude; also the severity proxy. */
  magnitude?: number;
  /** TrackLimits only. */
  warningPoints?: number;
  currentPoints?: number;
  resolution?: string;
  lap?: number;
  /**
   * Sidecar-assigned sequence number. Contexts arrive seconds after the event
   * itself, so they are matched back on this rather than on content.
   */
  seq?: number;
  /**
   * The content-derived id this incident is stored under.
   *
   * `id` above is `live-{generation}-{seq}` and is per app process — it changes
   * under a running session when the sidecar restarts. Anything durable has to
   * key on this instead, decisions above all: a call made live and revised
   * after the session must resolve to one record, not two.
   */
  persistedId?: string;
  /**
   * The captured window. Held in main; **not** shipped to the renderer.
   *
   * A window is a few hundred frames per car — roughly 100 KB — and a long race
   * holds hundreds of them. `getLiveSessionData` therefore strips this before
   * replying and the renderer pulls one window at a time over
   * `GET_LIVE_INCIDENT_CONTEXT`, exactly as the replay side already does. See
   * `hasContext` for what survives the strip.
   */
  context?: LiveIncidentContext;
  /**
   * Whether a window is held, carried in the renderer payload in place of the
   * window itself. Also the cheap change-detector for the renderer's per-
   * incident memo cache: an incident's context is the one thing about it that
   * arrives late, so `persistedId` plus this flag is enough to know whether a
   * rebuild is needed.
   */
  hasContext?: boolean;
  /**
   * Lifted off the context so it survives the strip: it is one number the
   * dossier reads to say how precisely the contact instant could be located,
   * and it would be absurd to ship 100 KB of frames to carry it.
   */
  anchorErrorSeconds?: number;
  evidence?: LiveCaptureEvidence;
}

/**
 * One sampled instant for one car, from the sidecar's rolling buffer.
 *
 * Position, velocity, driver inputs and track-relative offsets are captured
 * together deliberately: a brake trace on its own is misleading, because a
 * brake spike is innocent if there is a corner there.
 */
export interface LiveIncidentFrame {
  /** Seconds relative to the incident. Negative is before contact. */
  t: number;
  /** World position, metres. */
  x: number;
  y: number;
  z: number;
  /** World velocity, m/s. */
  vx: number;
  vy: number;
  vz: number;
  /** Speed, m/s. */
  speed: number;
  /** Yaw rate, degrees/sec. */
  yaw: number;
  /** Driver inputs, unfiltered. Throttle and brake 0..1, steering -1..1. */
  throttle: number;
  brake: number;
  steering: number;
  /** Distance around the lap, metres. */
  lapDist: number;
  /** Lateral offset from the approximate centre path, metres. */
  pathLateral: number;
  /** Track edge on the car's side of the centre path, metres. */
  trackEdge: number;
  /** Primary flag shown to this car: 0 green, 6 blue. */
  flag: number;
  /** LMU's own encoding: 0 = sector 3, 1 = sector 1, 2 = sector 2. */
  sector: number;
  lap: number;
}

export interface LiveIncidentCarTrace {
  slotId: number;
  frames: LiveIncidentFrame[];
}

export interface LiveIncidentContext {
  seq: number;
  /** Session elapsed time of the incident, matching the et= attribute. */
  et: number;
  /** Track length in metres; needed to unwrap lap distance across the line. */
  trackLength: number;
  /**
   * How far the anchor frame sits from the quoted et, in seconds. Bounded by
   * the scoring tick — observed at 0.0–0.1s. `t: 0` is only this precise.
   */
  anchorErrorSeconds: number;
  /**
   * Raw mSectorFlag. The header calls this "local yellows per sector", but it
   * read a constant 11 in all three sectors through a green practice session
   * at Daytona, so it plainly is not a yellow-flag boolean. Carried through
   * unconverted; do not build UI on it until a session with a real local
   * yellow says what it means.
   */
  sectorFlags: [number, number, number];
  cars: LiveIncidentCarTrace[];
}

/**
 * How long some condition had held continuously up to the moment of contact.
 *
 * The captured window is finite, so a condition that was already true at its
 * oldest frame is only a lower bound. Presenting that as an exact figure would
 * be a lie a steward could be held to, hence the explicit flag.
 */
export interface LiveHeldDuration {
  seconds: number;
  truncated: boolean;
}

export interface LiveCaptureCarEvidence {
  slotId: number;
  /** Speed at the moment of contact, kph. */
  speedKph?: number;
  /** Peak deceleration in the second before contact, m/s². */
  peakDecelMps2?: number;
  brakeApplied?: LiveHeldDuration;
  blueFlagShown?: LiveHeldDuration;
  peakYawRateDegPerSec?: number;
  offTrack?: boolean;
}

export interface LiveCaptureEvidence {
  /** Rate of closure along the line between the two cars, kph. */
  closingSpeedKph?: number;
  /** Slot of the car that was ahead on track at contact. */
  aheadSlotId?: number;
  offTrackSlotIds: number[];
  /** True when the parties were in different classes. */
  isTrafficIncident?: boolean;
  /** Where on track this happened, expressed honestly — LMU names no corners. */
  trackPositionLabel?: string;
  cars: LiveCaptureCarEvidence[];
}

export interface LiveCaptureDriver {
  slotId: number;
  steamId: string;
  driverName: string;
  vehicleName: string;
  vehicleClass: string;
  place: number;
  lapsCompleted: number;
  lastLapTime: number;
  timeBehindLeader: number;
  lapsBehindLeader: number;
  penalties: number;
  inPits: boolean;
  /** -1 nobody, 0 local player, 1 local AI, 2 remote, 3 replay. */
  control: number;
  /** 0 green, 6 blue. */
  flag: number;
  pitStops: number;
  finishStatus: number;
  /** Metres travelled around the current lap. The basis for on-track gaps. */
  lapDist?: number;
  speedKph?: number;

  /*
    Timing, pit state and world position, all read from VehicleScoringInfoV01.

    Optional throughout, and absent means absent. LMU writes -1 for a time it
    does not have — a driver who has not completed a lap, an invalidated sector
    — and a sidecar built before these fields existed emits nothing. Both are
    dropped here rather than reaching a timing screen as 0.000.
  */

  /**
   * Last-lap sector times. **Sector 2 is cumulative**: it is S1+S2, exactly as
   * the SDK reports it. S2 alone is `lastSector2 - lastSector1`, and S3 is
   * `lastLapTime - lastSector2`.
   */
  lastSector1?: number;
  lastSector2?: number;
  /** Current lap's sectors, only populated while the lap is still valid. */
  curSector1?: number;
  curSector2?: number;
  /** Personal bests. `bestSector2` is cumulative in the same way. */
  bestSector1?: number;
  bestSector2?: number;
  bestLapTime?: number;
  /**
   * The sectors *from* the best lap, which are not the same thing as the best
   * sectors — the best lap rarely contains all three of them.
   */
  bestLapSector1?: number;
  bestLapSector2?: number;
  /**
   * Estimated progress through the current lap. Goes negative before the start,
   * so it is carried whenever it is a number rather than only when positive.
   */
  timeIntoLap?: number;
  /** LMU's own estimate of this car's lap time, used for its gap arithmetic. */
  estimatedLapTime?: number;
  /**
   * Richer than `inPits`, which is a bare in-the-pit-lane boolean. 0 is a real
   * state — not pitting — rather than an absence.
   *
   * The SDK documents 0 none, 1 request, 2 entering, 3 stopped, 4 exiting, but
   * **5 was observed live** at Laguna Seca on 2026-08-07 alongside 0 and 2, so
   * the range is wider than the header claims and LMU has not said what 5
   * means. Anything reading this must fall through to the raw number rather
   * than assuming a five-entry lookup covers it.
   */
  pitState?: number;
  inGarageStall?: boolean;
  /**
   * Gap to the car one place higher in the classification — the interval.
   *
   * Verified live to compose exactly into `timeBehindLeader` in a race. **Only
   * in a race**: practice and qualifying rank by best lap, so the car one place
   * higher is not the car ahead on track, and this read 0 for most of a
   * practice field with stray values including a negative one. Suppress it
   * outside a race rather than showing a zero.
   */
  timeBehindNext?: number;
  lapsBehindNext?: number;
  /**
   * Grid position, 1-based. LMU's -1 is dropped.
   *
   * Not a qualifying *result*: observed live reading a clean 1…37 straight down
   * the entry list during practice and during qualifying before any car had set
   * a lap. It becomes the real grid in a race, but nothing in the value
   * distinguishes that from the placeholder ordering, so only show it in one.
   */
  qualification?: number;
  /**
   * World position in metres, for the live track map. The vertical axis is
   * omitted: no map uses it and this row is emitted for every car every second.
   */
  posX?: number;
  posZ?: number;
}

/**
 * Two cars running nose-to-tail, ordered by track position rather than
 * classification.
 *
 * Classification cannot serve here: practice and qualifying rank by best lap
 * time, so consecutive places are not neighbours on track and
 * `timeBehindLeader` means nothing. Gaps are derived from `lapDist` instead,
 * which is true in every session type.
 */
export interface LivePressureBattle {
  id: string;
  aheadSteamId: string;
  behindSteamId: string;
  /** Time for the car behind to cover the gap at its current speed. */
  gapSeconds: number;
  /** Positive when the car behind is faster; negative when it is dropping back. */
  closingSpeedKph: number;
  /** The two cars are in different classes, so this is traffic, not a fight. */
  isTraffic: boolean;
  /**
   * The reliable identity. `mSteamID` is 0 for every AI entry and every offline
   * session, so a 54-car single-player field shares one steam id and cannot be
   * keyed on. Optional only because the layout fixtures predate it.
   */
  aheadSlotId?: number;
  behindSlotId?: number;
  /**
   * Both cars' speed on the tick the gap was measured, in kph.
   *
   * Unsmoothed, unlike `closingSpeedKph`. These are readings rather than a
   * trend: a steward glancing at 180 / 120 learns something the smoothed
   * difference cannot tell them, which is that one of the two is not racing.
   */
  aheadSpeedKph?: number;
  behindSpeedKph?: number;
  /**
   * Seconds for the car behind to close the gap at the current closing rate.
   *
   * Absent whenever the arithmetic is not meaningful: the car behind dropping
   * back gives a negative, and a closing rate near zero gives a number in the
   * thousands. Both are `—` rather than a figure — see `MIN_CLOSING_SPEED_KPH`.
   */
  timeToCatchSeconds?: number;
}

/**
 * One car's world position, from `/rest/watch/standings` at the game's own
 * ~5 Hz scoring rate.
 *
 * Reduced in main from a 71 KB response, so only this crosses IPC. `driverName`
 * rides along not to be displayed but to be *checked*: the REST rows and the
 * sidecar are two independent readers of the same scoring data, and a join that
 * silently put the wrong car on the map would be worse than a slow map. See
 * `mergeLiveCarPositions`.
 */
export interface LiveCarPosition {
  slotId: number;
  driverName: string;
  x: number;
  z: number;
}

export interface LiveSessionData {
  status: LiveSessionStatus;
  drivers: LiveCaptureDriver[];
  incidents: LiveCaptureIncident[];
  trackLimitStepsPerPenalty?: number;
  battles: LivePressureBattle[];
  /**
   * The session's persisted key.
   *
   * Supplied rather than re-derived in the renderer. The renderer used to build
   * its own `track|type` key for decisions, which matched no session on disk —
   * so a live call could never be reconciled with the session it was made in.
   */
  sessionKey?: string;
}

/**
 * A captured live session, persisted so its evidence outlives the process.
 *
 * Of everything live capture holds, only derived evidence and context windows
 * are unrecoverable — the post-session XML carries incidents, standings and
 * results, and is authoritative. This record exists to preserve the part logs
 * structurally cannot hold.
 *
 * Written incrementally, never at session end: `SME_END_SESSION` is not
 * guaranteed to fire, and a 24-hour race that crashes at hour 23 must not lose
 * 23 hours of evidence.
 */
export interface LiveSessionRecord {
  /**
   * Stable across a sidecar restart mid-session. The supervisor respawns the
   * sidecar on exit, and the new process has to keep appending to the same
   * session rather than opening a second one.
   *
   * Derived from track, the raw session enum, and the session's start instant
   * reconstructed as `now - currentEt` quantised to `LIVE_SESSION_START_QUANTUM_MS`.
   * Track and type alone are not enough: a weekend runs practice, qualifying and
   * a race at one track, and a restarted race repeats a type.
   */
  sessionKey: string;
  trackName: string;
  /** Coarse label for display. */
  sessionType?: SessionType;
  /**
   * Raw `mSession`: 0 test day, 1-4 practice, 5-8 qualifying, 9 warmup,
   * 10-13 race. Kept unflattened because `sessionType` cannot tell practice 1
   * from practice 4.
   */
  session: number;
  /** Reconstructed session start, quantised. Also the retention axis. */
  startedAt: number;
  /** Last status tick seen. Distinguishes a finished session from an abandoned one. */
  lastSeenAt: number;
  driverCount?: number;
  trackLimitStepsPerPenalty?: number;
  /** Final known standings; rebuildable from the XML, kept for unlinked sessions. */
  drivers: LiveCaptureDriver[];
  /** Set only once a human has confirmed the pairing. */
  link?: LiveSessionLink;
  /**
   * The best candidate matching found, waiting on a human.
   *
   * Never applied on its own. A wrong link puts a driver's name against an
   * incident they were not in, in an export a league may publish, so the app
   * proposes and the steward disposes — as replay import already does.
   */
  proposal?: LiveSessionMatchProposal;
  /**
   * When the user rejected the proposal.
   *
   * Recorded so matching stops offering it. An unlinked session is a normal
   * state — practice replays are often not kept — and must never nag.
   */
  matchDismissedAt?: number;
}

/** A confirmed pairing between a captured session and a replay. */
export interface LiveSessionLink {
  replayHash: string;
  /**
   * Secondary identity, mirroring `ArchivedReplayRecord.identityKey`. The app
   * does not delete replays, so a link dropped by a re-hash would look like
   * data loss with no cause.
   */
  replayIdentityKey: string;
  /** For display, so the list can name the replay without reading the cache. */
  replayName: string;
  /** `roster` was proposed by matching and confirmed; `manual` was chosen outright. */
  method: 'roster' | 'manual';
  /** Roster overlap at the time of linking; null when the grid was too small. */
  confidence: number | null;
  /**
   * Also the retention axis. A session that gained a replay to be reviewed
   * against became more useful, so retention runs from the later of capture
   * and link.
   */
  linkedAt: number;
}

/** A candidate replay for a captured session, with why it scored as it did. */
export interface LiveSessionMatchCandidate {
  replayHash: string;
  replayIdentityKey: string;
  replayName: string;
  sceneDesc: string;
  sessionType: SessionType;
  /** Replay timestamp, Unix seconds — not milliseconds. */
  timestamp: number;
  imported: boolean;
  confidence: number;
  /** Drivers shared with the captured session. */
  intersection: number;
  liveDriverCount: number;
  replayDriverCount: number;
  /**
   * Share of the session's live incidents found at the same elapsed time in the
   * replay's log. Null when either side recorded none, which is common and not
   * a fault — a clean session has nothing to compare.
   */
  incidentAgreement: number | null;
  /** True when this session is already linked to this replay. */
  linked: boolean;
}

/** Mirrors `RosterRankingReason`, which is main-only and cannot be imported here. */
export type LiveSessionMatchReason =
  | 'proposed'
  | 'no-candidates'
  | 'roster-too-small'
  | 'below-floor'
  | 'ambiguous'
  | 'only-candidate';

export interface LiveSessionMatchResult {
  sessionKey: string;
  candidates: LiveSessionMatchCandidate[];
  /** Confident enough to put in front of a human; still never applied for them. */
  proposed: LiveSessionMatchCandidate | null;
  reason: LiveSessionMatchReason;
}

/** The stored form of a proposal, thin enough to sit on the session row. */
export interface LiveSessionMatchProposal {
  replayHash: string;
  replayIdentityKey: string;
  replayName: string;
  confidence: number;
  intersection: number;
  liveDriverCount: number;
  replayDriverCount: number;
  incidentAgreement: number | null;
  proposedAt: number;
}

/**
 * Whether a captured session has a replay behind it.
 *
 * `unlinked` is a normal resting state, not an error: LMU only writes a replay
 * when replay saving is on, practice replays are often not kept, and replays
 * get overwritten.
 */
export type LiveSessionLinkState = 'linked' | 'proposed' | 'unlinked';

/**
 * One persisted incident. The bulky context window is deliberately NOT here —
 * it lives in its own record, because listing a session's incidents must not
 * drag 60-80 KB of traces per incident off disk.
 */
export interface LiveIncidentRecord {
  id: string;
  sessionKey: string;
  incident: LiveCaptureIncident;
  /** Wall-clock instant, derived from the session start plus `etSeconds`. */
  occurredAt: number;
  /** True once a context window arrived and evidence was derived from it. */
  hasContext: boolean;
}

/**
 * One row of the captured-sessions list.
 *
 * Deliberately thin. The list exists to stop captured evidence being invisible,
 * not to become a second place to do the stewarding — so it carries enough to
 * identify a session and decide whether to keep it, and nothing more.
 */
export interface LiveSessionSummary {
  sessionKey: string;
  trackName: string;
  sessionType?: SessionType;
  session: number;
  startedAt: number;
  lastSeenAt: number;
  driverCount: number;
  incidentCount: number;
  /** Incidents that captured a trace, which is the part a replay cannot rebuild. */
  evidenceCount: number;
  linkState: LiveSessionLinkState;
  link?: LiveSessionLink;
  proposal?: LiveSessionMatchProposal;
}

/**
 * One race weekend's segments, and optionally the record of one of them.
 *
 * A weekend is a chain of separately-keyed sessions at one track — practice,
 * qualifying, the race — and the live view shows one of them at a time. The
 * segment list and one segment's incidents ride on the same reply because they
 * are always read together: choosing a segment is what asks for its record, and
 * the list is what says the choice is still valid.
 *
 * Context traces are deliberately absent, for the same reason they are absent
 * from `LiveDataForReplay`: they are ~100 KB each and the dossier fetches the
 * one it is showing.
 */
export interface LiveSessionSegments {
  /**
   * The segment the group was built around — the running session, where the
   * caller named one and it has been persisted yet.
   */
  anchorSessionKey: string;
  /** Chronological, oldest first: the order the weekend actually ran. */
  segments: LiveSessionSummary[];
  /**
   * Which segment `incidents` and `drivers` belong to. Absent when none was
   * asked for, which is every refresh of the list on its own — a record already
   * held does not change, so re-sending it would churn the renderer's incident
   * identities for nothing.
   */
  recordFor?: string;
  incidents: LiveIncidentRecord[];
  /**
   * That segment's field as it was last seen. Incidents name drivers by slot
   * alone, so without this a past segment's incidents have no car number and no
   * class.
   */
  drivers: LiveCaptureDriver[];
}

/**
 * A linked captured session, in the shape the replay view merges from.
 *
 * Context traces are deliberately absent. They are ~100 KB each and a session
 * can hold hundreds; the replay view needs only the evidence and a flag saying
 * a trace exists, and loads the trace itself when a dossier is opened.
 */
export interface LiveDataForReplay {
  sessionKey: string;
  trackName: string;
  sessionType?: SessionType;
  startedAt: number;
  link: LiveSessionLink;
  incidents: LiveIncidentRecord[];
  /**
   * The session's final field. Incidents name drivers by slot alone, so the
   * dossier needs this to put a car number, a class and an AI badge against
   * one — the same lookup live mode does from the standings it is polling.
   */
  drivers: LiveCaptureDriver[];
}

/** What a retention window would remove, so the user can recognise it. */
export interface LiveRetentionPreview {
  sessionCount: number;
  incidentCount: number;
  oldestAt: number | null;
  newestAt: number | null;
  trackNames: string[];
}

/**
 * What clearing local storage would destroy.
 *
 * Decisions are counted separately and named explicitly because they are the
 * one thing clearing removes that exists nowhere else and leaves nothing
 * behind — an imported replay's files remain on disk, a deleted decision is
 * simply gone, along with its reasoning and revision history.
 */
export interface LocalDataSummary {
  stewardDecisionCount: number;
  liveSessionCount: number;
  liveIncidentCount: number;
  liveTraceCount: number;
}

/** The trace window for one incident, stored apart from the incident itself. */
export interface LiveIncidentContextRecord {
  incidentId: string;
  sessionKey: string;
  context: LiveIncidentContext;
}

/**
 * Steward decisions.
 *
 * The app proposes, the steward disposes: nothing here is ever written without
 * a human confirming it, and the record captures who decided and why. Under
 * appeal, "a named steward decided, here is the reasoning" is defensible where
 * "the app decided" is not. See docs/export-and-decisions-design.md.
 */

/**
 * What a call says, in the league's own words.
 *
 * A free string, not an enum, because the penalty tariff is configured rather
 * than shipped — see `src/renderer/utils/stewardActions.ts`. The steward's own
 * label *is* the value, so a decision carries a durable human-readable string
 * and an export needs no lookup table to be read years later. Renaming or
 * deleting an action cannot orphan the decisions made under it, and records
 * written under an earlier vocabulary keep the text they were made with.
 */
export type StewardDecisionOutcome = string;

/**
 * Not every penalty stems from one incident: a track-limit penalty is earned by
 * accumulation across many, and a conduct penalty by repeated contact. A schema
 * requiring a single incident id could express neither.
 */
export type StewardDecisionBasis = 'incident' | 'accumulation' | 'conduct';

export type StewardDecisionState = 'FLAGGED' | 'DECIDED' | 'DEFERRED';

export type StewardDecisionStatus =
  | 'provisional'
  | 'final'
  | 'appealed'
  | 'overturned';

/**
 * Who a decision is against.
 *
 * A penalty always has a target driver; "no action" is a finding about the
 * incident as a whole and has none. Recording a penalty without a target — as
 * the first live UI did — produces a call nobody can act on.
 */
export interface StewardDecisionTarget {
  /** Absent for AI entries and offline sessions, where LMU reports 0. */
  steamId?: string;
  slotId?: number;
  /** Display only. Driver names are user-supplied and change. */
  driverName: string;
}

export interface StewardDecisionRevision {
  revisionNumber: number;
  /** Absent when the steward parked the incident rather than deciding it. */
  outcome?: StewardDecisionOutcome;
  reasoning?: string;
  status: StewardDecisionStatus;
  stewardAuthor: string;
  revisedAt: number;
}

export interface StewardDecision {
  id: string;
  basis: StewardDecisionBasis;
  /** Link, not identity — live incident ids do not survive a sidecar restart. */
  incidentId?: string;
  contributingIncidentIds?: string[];
  /** Null while live; populated once the session syncs. */
  replayHash?: string;

  // Session context, denormalised so the record stands alone in an export.
  sessionKey: string;
  sessionTrack: string;
  sessionType: string;
  sessionDate?: number;
  serverName?: string;

  target?: StewardDecisionTarget;
  involvedParties: StewardDecisionTarget[];

  lapLabel?: string;
  etSeconds?: number;
  trackPositionLabel?: string;
  classification?: string;

  /**
   * Absent for a FLAGGED record. Parking an incident is the most common live
   * action and is not a call, so it must not be forced to carry one.
   */
  outcome?: StewardDecisionOutcome;
  reasoning?: string;
  /**
   * Who made this call, from the steward name setting, resolved to a generic
   * author when that is unset. Never blank: this is what the record is defended
   * by under appeal. Denormalised and frozen at write time — changing the
   * setting never rewrites a past call.
   */
  stewardAuthor: string;
  decidedAt: number;
  state: StewardDecisionState;
  status: StewardDecisionStatus;
  revisions: StewardDecisionRevision[];
}

export type StewardDecisionStore = Record<string, StewardDecision>;

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
