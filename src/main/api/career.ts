import { createHash } from 'crypto';
import { stat } from 'fs/promises';
import { basename, join } from 'path';
import {
  CareerAggregate,
  CareerCarSummary,
  CareerFilterOptions,
  CareerFilters,
  CareerIdentity,
  CareerMilestone,
  CareerRival,
  CareerScanReport,
  CareerSessionRecord,
  CareerTrackSummary,
  SessionType,
} from '@types';
import {
  getMainPersistentStore,
  readProfileCache,
} from '../storage/local-data-store';
import { buildLogFileIndex, LogFileIndex } from './log-index';
import {
  CareerLogFacts,
  createResultLogParser,
  normalizeDriverName,
  ParsedRaceResults,
  ResultLogParser,
} from './result-log';

/**
 * The driver's career: every session they drove, and the totals derived from
 * them.
 *
 * The one rule everything here follows is that scanning never destroys. A
 * result log the user deletes takes its session with it — nothing can rebuild
 * it — so a scan inserts and updates, and a source file that has gone marks the
 * record rather than removing it. Only two paths remove career data, and both
 * are an explicit user action.
 *
 * Sessions come from the same canonical pass the replay sync already makes over
 * the results directory, so the career costs no extra filesystem work.
 */

const CAREER_SESSIONS_STORE_KEY = 'careerSessions';
const CAREER_IDENTITY_STORE_KEY = 'careerIdentity';
const CAREER_LAST_SCAN_STORE_KEY = 'careerLastScan';

/**
 * The shape of record `toRecord` currently writes.
 *
 * A stored record is not re-parsed while its log is unchanged, so one written
 * before a field existed would never gain it. Bumping this re-reads the logs
 * that are still on disk — records whose logs have gone keep what they have,
 * because nothing can improve them and nothing is allowed to drop them.
 *
 * 2: per-opponent contact counts, for the rivals panel.
 */
const CAREER_RECORD_VERSION = 2;

/** Practice contributes laps, distance and pace — never results. */
const RESULT_SESSION_TYPES: readonly SessionType[] = ['RACE'];

type CareerSessionStore = Record<string, CareerSessionRecord>;

const getStore = () => getMainPersistentStore();

export const readCareerSessions = (): CareerSessionStore => {
  const stored = getStore().get(CAREER_SESSIONS_STORE_KEY);

  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return {};
  }

  return stored as CareerSessionStore;
};

const writeCareerSessions = (sessions: CareerSessionStore): void => {
  getStore().set(CAREER_SESSIONS_STORE_KEY, sessions);
};

export const readCareerIdentity = (): CareerIdentity => {
  const stored = getStore().get(CAREER_IDENTITY_STORE_KEY);
  const identity =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Partial<CareerIdentity>)
      : {};

  return {
    primary: String(identity.primary ?? ''),
    aliases: Array.isArray(identity.aliases)
      ? identity.aliases.map(String)
      : [],
    unclaimed: Array.isArray(identity.unclaimed) ? identity.unclaimed : [],
  };
};

const writeCareerIdentity = (identity: CareerIdentity): void => {
  getStore().set(CAREER_IDENTITY_STORE_KEY, identity);
};

const readLastScan = (): CareerScanReport | null =>
  (getStore().get(CAREER_LAST_SCAN_STORE_KEY) as CareerScanReport | null) ??
  null;

/** Names as compared, not as displayed. */
export const normalizeIdentityName = normalizeDriverName;

const buildAliasSet = (identity: CareerIdentity): Set<string> =>
  new Set(
    [identity.primary, ...identity.aliases]
      .map(normalizeIdentityName)
      .filter((name) => name.length > 0),
  );

/**
 * Identity for a session, derived from its own content rather than its file
 * name, so a log that is renamed, moved or re-imported updates its row instead
 * of creating a second one. A restarted race carries a different session start
 * time and therefore stays a session of its own.
 */
const buildSessionKey = (facts: CareerLogFacts, trackFolder: string): string =>
  createHash('sha1')
    .update(
      [
        String(facts.sessionStartedAt ?? 0),
        facts.sessionType ?? '',
        trackFolder.toLowerCase(),
        normalizeIdentityName(facts.player?.name ?? ''),
        String(facts.fieldSize),
      ].join('|'),
    )
    .digest('hex');

/**
 * Track folder, layout and version out of the log's `TrackData` path.
 *
 * The layout matters: one folder holds several — Imola ships IMOLAWEC and
 * IMOLAELMS — and both report the same `TrackVenue`. Grouping personal bests by
 * venue alone would put lap times from different circuits in one row.
 */
export const readTrackIdentity = (
  trackData: string,
): { folder: string; layout: string; version: string } => {
  const path = String(trackData ?? '');
  const folderMatch = path.match(/Locations[\\/]([^\\/]+)[\\/]([^\\/]+)/i);
  const fileName = path.split(/[\\/]/).pop() ?? '';
  const layout = fileName.replace(/\.mas$/i, '');

  return {
    folder: folderMatch?.[1] ?? '',
    version: folderMatch?.[2] ?? '',
    layout,
  };
};

const safeFingerprint = async (filePath: string): Promise<string | null> => {
  try {
    const { size, mtimeMs } = await stat(filePath);
    return `${size}:${mtimeMs}`;
  } catch {
    return null;
  }
};

const toRecord = (
  facts: CareerLogFacts,
  summary: ParsedRaceResults,
  source: { filePath: string; fingerprint: string | null },
  firstSeenAt: number,
): CareerSessionRecord | null => {
  const { player } = facts;

  if (!player || !facts.sessionType) {
    return null;
  }

  const track = readTrackIdentity(summary.TrackData ?? '');
  const laps = facts.playerLaps;
  const conduct = facts.playerConduct;

  return {
    sessionKey: buildSessionKey(facts, track.folder),
    driverName: player.name,
    startedAt: facts.sessionStartedAt ?? summary.DateTime ?? 0,
    sessionType: facts.sessionType,
    setting: summary.Setting ?? '',
    trackVenue: summary.TrackVenue ?? '',
    trackFolder: track.folder,
    trackLayout: track.layout,
    trackVersion: track.version,
    trackLengthM: Number(summary.TrackLength ?? 0),
    trackEvent: summary.TrackEvent ?? '',
    gameVersion: summary.GameVersion ?? '',
    carClass: player.carClass,
    carType: player.carType,
    carNumber: player.carNumber,
    teamName: player.teamName,
    aids: player.aids,
    gridPos: player.gridPos,
    classGridPos: player.classGridPos,
    finishPos: player.finishPos,
    classFinishPos: player.classFinishPos,
    lapsCompleted: player.lapsCompleted ?? laps?.lapCount ?? 0,
    pitstops: player.pitstops ?? 0,
    finishStatus: player.finishStatus,
    dnfReason: player.dnfReason,
    finishTimeSec: player.finishTimeSec,
    bestLapSec: player.bestLapSec ?? laps?.bestLapSec ?? null,
    theoreticalBestSec: laps?.theoreticalBestSec ?? null,
    averageLapSec: laps?.averageLapSec ?? null,
    lapStdDevSec: laps?.lapStdDevSec ?? null,
    topSpeedKph: laps?.topSpeedKph ?? null,
    lapsLed: laps?.lapsLed ?? 0,
    firstLapPos: laps?.firstLapPos ?? null,
    timedLapCount: laps?.timedLapCount ?? 0,
    sessionBestLapSec: facts.sessionBestLapSec,
    classBestLapSec: facts.classBestLapSec,
    fieldSize: facts.fieldSize,
    classFieldSize: facts.classFieldSize,
    aiCount: facts.aiCount,
    humanCount: facts.humanCount,
    classes: facts.classes,
    contactByOpponent: conduct?.contactByOpponent ?? {},
    incidentsCaused: conduct?.incidentsCaused ?? 0,
    incidentsInvolved: conduct?.incidentsInvolved ?? 0,
    incidentForceMax: conduct?.incidentForceMax ?? 0,
    contactWithVehicle: conduct?.contactWithVehicle ?? 0,
    contactWithScenery: conduct?.contactWithScenery ?? 0,
    penalties: conduct?.penalties ?? [],
    trackLimitWarnings: conduct?.trackLimitWarnings ?? 0,
    trackLimitInvalidLaps: conduct?.trackLimitInvalidLaps ?? 0,
    opponents: facts.opponents,
    sourceFileName: basename(source.filePath),
    sourcePath: source.filePath,
    sourceFingerprint: source.fingerprint,
    filePresent: true,
    excluded: false,
    firstSeenAt,
    recordVersion: CAREER_RECORD_VERSION,
  };
};

export interface ScanCareerOptions {
  /** Re-parse every log, ignoring fingerprints. */
  rebuild?: boolean;
  /** Reuse the index the replay sync already built for this directory. */
  index?: LogFileIndex;
  logDir?: string;
  /** Paths of result logs this app wrote when importing someone else's replay. */
  importedLogPaths?: Set<string>;
}

/**
 * The parser this career reads logs with.
 *
 * Bound to the driver's own names, because `isPlayer` marks every human on the
 * grid rather than the local one — in multiplayer that is the whole field.
 * Anything that builds an index the career will read must use this parser, or
 * the index caches records whose player was picked arbitrarily.
 */
export const createCareerLogParser = (): ResultLogParser =>
  createResultLogParser(buildAliasSet(readCareerIdentity()));

export const buildCareerLogIndex = (logDir: string): Promise<LogFileIndex> =>
  buildLogFileIndex(logDir, createCareerLogParser());

export const scanCareer = async (
  options: ScanCareerOptions = {},
): Promise<CareerScanReport> => {
  const logDir = options.index?.logDir ?? options.logDir ?? '';
  const index =
    options.index ?? (logDir ? await buildCareerLogIndex(logDir) : null);

  const existing = readCareerSessions();
  const identity = readCareerIdentity();
  const aliases = buildAliasSet(identity);
  const importedLogPaths = new Set(
    [...(options.importedLogPaths ?? [])].map((path) => path.toLowerCase()),
  );

  const next: CareerSessionStore = { ...existing };
  const byFingerprint = new Map<string, CareerSessionRecord>();
  for (const record of Object.values(existing)) {
    if (record.sourceFingerprint) {
      byFingerprint.set(
        `${record.sourceFileName}:${record.sourceFingerprint}`,
        record,
      );
    }
  }

  const unclaimed = new Map<string, { name: string; sessionCount: number }>();
  const seenPaths = new Set<string>();
  let logsParsed = 0;
  let skippedImported = 0;
  let skippedUnclaimed = 0;

  for (const summary of index?.summaries ?? []) {
    /*
     * Importing someone else's replay writes their result log into this same
     * folder, where its isPlayer entry names them rather than the user. On an
     * install where import has been used those can be most of the directory.
     */
    if (importedLogPaths.has(summary.filePath.toLowerCase())) {
      skippedImported += 1;
      continue;
    }

    const facts = summary.record.career;

    /*
     * A log with no player is one none of this driver's names appear in. When
     * it holds a single human it is somebody else's session, and worth
     * offering: a rename or a second profile looks exactly like this.
     */
    if (!facts?.player) {
      const soleName = summary.record.soleHumanName;
      if (soleName) {
        const normalized = normalizeIdentityName(soleName);
        const entry = unclaimed.get(normalized) ?? {
          name: soleName,
          sessionCount: 0,
        };
        entry.sessionCount += 1;
        unclaimed.set(normalized, entry);
      }
      skippedUnclaimed += 1;
      continue;
    }

    const normalized = normalizeIdentityName(facts.player.name);
    if (aliases.size > 0 && !aliases.has(normalized)) {
      skippedUnclaimed += 1;
      continue;
    }

    const fingerprint = await safeFingerprint(summary.filePath);
    const cacheKey = `${summary.fileName}:${fingerprint}`;
    const cachedRecord = byFingerprint.get(cacheKey);
    /*
     * An unchanged log is skipped, unless the record it produced predates the
     * current shape — a record written before a field existed would otherwise
     * never gain it.
     */
    const unchanged =
      !options.rebuild &&
      fingerprint !== null &&
      cachedRecord !== undefined &&
      (cachedRecord.recordVersion ?? 0) === CAREER_RECORD_VERSION;

    seenPaths.add(summary.filePath.toLowerCase());

    if (unchanged) {
      const record = byFingerprint.get(cacheKey) as CareerSessionRecord;
      next[record.sessionKey] = { ...record, filePresent: true };
      continue;
    }

    logsParsed += 1;
    const previousKey = buildSessionKey(
      facts,
      readTrackIdentity(summary.record.summary.TrackData ?? '').folder,
    );
    const previous = existing[previousKey];
    const record = toRecord(
      facts,
      summary.record.summary,
      { filePath: summary.filePath, fingerprint },
      previous?.firstSeenAt ?? Date.now(),
    );

    if (!record) {
      continue;
    }

    // Whatever the user set on this session outlives a re-parse of its log.
    next[record.sessionKey] = {
      ...record,
      excluded: previous?.excluded ?? false,
    };
  }

  /*
   * A record whose log has gone is marked, never removed. This is the whole
   * point: the session happened, and nothing on disk can prove it any more.
   */
  let sessionsMissingFiles = 0;
  for (const [key, record] of Object.entries(next)) {
    const present = seenPaths.has(record.sourcePath.toLowerCase());
    if (!present) {
      sessionsMissingFiles += 1;
    }
    if (record.filePresent !== present) {
      next[key] = { ...record, filePresent: present };
    }
  }

  writeCareerSessions(next);
  writeCareerIdentity({
    ...identity,
    unclaimed: [...unclaimed.values()].sort(
      (left, right) => right.sessionCount - left.sessionCount,
    ),
  });

  const report: CareerScanReport = {
    scannedAt: Date.now(),
    logsSeen: index?.summaries.length ?? 0,
    logsParsed,
    sessionsRecorded: Object.keys(next).length,
    sessionsMissingFiles,
    skippedImported,
    skippedUnclaimed,
  };

  getStore().set(CAREER_LAST_SCAN_STORE_KEY, report);

  return report;
};

/**
 * Attaches official-event identity to sessions whose replay is still cached.
 *
 * The one thing a `.Vcr` knows that a result log does not: a log for an "LMGT3
 * Sprint Cup split 3" session says only `Multiplayer` and the track's name.
 * Purely additive — a replay that has gone, or is too old to carry the field,
 * leaves the session exactly as the log described it.
 *
 * Only replays already in the cache are read, so this never walks the replay
 * folder, and only sessions still missing an event title are looked up.
 */
export const enrichCareerFromReplays = async (
  replays: {
    logDataFileName?: string;
    replayDirectory?: string;
    replayName?: string;
  }[],
  readTrailer: (filePath: string) => Promise<{
    eventTitle?: string;
    eventType?: string;
    splitNo?: number;
  } | null>,
): Promise<number> => {
  const sessions = readCareerSessions();
  const byLogName = new Map<string, CareerSessionRecord>();

  for (const record of Object.values(sessions)) {
    if (!record.eventChecked && record.sourceFileName) {
      byLogName.set(record.sourceFileName.toLowerCase(), record);
    }
  }

  if (byLogName.size === 0) {
    return 0;
  }

  const next = { ...sessions };
  let enriched = 0;
  let checked = 0;

  for (const replay of replays) {
    const logName = String(replay.logDataFileName ?? '').toLowerCase();
    const record = logName ? byLogName.get(logName) : undefined;

    if (!record || !replay.replayName) {
      continue;
    }

    const trailer = await readTrailer(
      join(String(replay.replayDirectory ?? ''), `${replay.replayName}.Vcr`),
    );

    /*
     * Marked as looked at either way. Only the newest replay format carries an
     * event at all — 22 of 193 in a real library — so without this the other
     * 171 trailers are re-read on every scan to find nothing again.
     */
    checked += 1;
    const hasEvent = Boolean(trailer?.eventType || trailer?.eventTitle);

    next[record.sessionKey] = {
      ...record,
      eventChecked: true,
      ...(hasEvent
        ? {
            eventTitle: trailer?.eventTitle,
            eventType: trailer?.eventType,
            splitNo: trailer?.splitNo,
          }
        : {}),
    };

    if (hasEvent) {
      enriched += 1;
    }
  }

  if (checked > 0) {
    writeCareerSessions(next);
  }

  return enriched;
};

/** Adopts a driver name found in the logs as another name for this user. */
export const claimCareerIdentity = async (name: string): Promise<void> => {
  const identity = readCareerIdentity();
  const normalized = normalizeIdentityName(name);

  if (!normalized || buildAliasSet(identity).has(normalized)) {
    return;
  }

  writeCareerIdentity({
    ...identity,
    aliases: [...identity.aliases, name],
    unclaimed: identity.unclaimed.filter(
      (entry) => normalizeIdentityName(entry.name) !== normalized,
    ),
  });
};

/**
 * Seeds the primary identity from the LMU profile when there is none yet.
 * Without one, a scan cannot tell the user's own sessions from an imported
 * driver's, so it records nothing rather than guessing.
 */
export const ensureCareerIdentity = (): CareerIdentity => {
  const identity = readCareerIdentity();

  if (identity.primary) {
    return identity;
  }

  const profileName = readProfileCache().profileInfo?.name ?? '';
  if (!profileName) {
    return identity;
  }

  const seeded = { ...identity, primary: profileName };
  writeCareerIdentity(seeded);

  return seeded;
};

export const setCareerSessionExcluded = (
  sessionKey: string,
  excluded: boolean,
): void => {
  const sessions = readCareerSessions();
  const record = sessions[sessionKey];

  if (!record) {
    return;
  }

  writeCareerSessions({
    ...sessions,
    [sessionKey]: { ...record, excluded },
  });
};

const average = (values: number[]): number | null =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;

const minOrNull = (values: (number | null)[]): number | null => {
  const usable = values.filter(
    (value): value is number => value !== null && value > 0,
  );
  return usable.length ? Math.min(...usable) : null;
};

const distanceKmOf = (record: CareerSessionRecord): number =>
  (record.lapsCompleted * record.trackLengthM) / 1000;

/**
 * Where a finish sits in its class field, as a fraction. Compared rather than
 * raw position because 8th of 40 is a better drive than 5th of 6, and a career
 * spans both.
 */
const finishPercentile = (record: CareerSessionRecord): number | null => {
  if (!record.classFinishPos || record.classFieldSize <= 1) {
    return null;
  }

  return (record.classFinishPos - 1) / (record.classFieldSize - 1);
};

/** A track needs this many races before it is ranked best or worst. */
const MIN_RACES_FOR_TRACK_RANKING = 3;

/**
 * A layout needs this many timed sessions before its pace is ranked.
 *
 * Higher than the race threshold because sessions are far more plentiful than
 * races, so the bar costs nothing — and a thin sample reads as a verdict. Four
 * sessions on a Spa variant put it 20% off the pace next to the 2% of the Spa
 * actually driven, which says the driver is weak there when it says they have
 * barely been there.
 */
const MIN_SESSIONS_FOR_PACE_RANKING = 6;

/**
 * Timed laps a session needs before its pace means anything.
 *
 * A driver who joined, ran an out-lap and left is not slow — they did not run.
 * Left in, those sessions dominate: a real career had recent form reading 10.9%
 * off the pace on a set that included single-lap installs at 24%.
 */
const MIN_TIMED_LAPS_FOR_PACE = 3;

/**
 * How far off the quickest lap of the session the driver's own best lap was.
 *
 * The pace figure worth tracking, because it is relative: a personal best only
 * says how fast the car and track are, while this says how close to the pace
 * the driver was on the day. Null unless both laps are known and the driver
 * actually ran.
 */
const gapToSessionBest = (record: CareerSessionRecord): number | null => {
  const own = record.bestLapSec;
  const best = record.sessionBestLapSec;

  if (!own || !best || own <= 0 || best <= 0) {
    return null;
  }

  if ((record.timedLapCount ?? 0) < MIN_TIMED_LAPS_FOR_PACE) {
    return null;
  }

  return (own - best) / best;
};

const sessionDay = (record: CareerSessionRecord): number => {
  const date = new Date(record.startedAt * 1000);
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
};

/**
 * The aids a session was driven with, as readable names.
 *
 * `ControlAndAids` reads `PlayerControl,ABS=2,Clutch,AutoBlip`; the control mode
 * itself is not an aid, and the levelled ones keep their level because dropping
 * from ABS=2 to ABS=1 is the progression worth seeing.
 */
const readAids = (aids: string): string[] =>
  String(aids ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(
      (entry) =>
        entry.length > 0 &&
        entry !== 'PlayerControl' &&
        entry !== 'AIControl' &&
        entry !== 'UnknownControl',
    );

/** Sessions counted as "recent" when reporting form. */
const RECENT_SESSION_COUNT = 25;

/**
 * Personal bests in the order they were set, keeping only improvements.
 *
 * The shape a progression chart wants: a flat run of identical times says
 * nothing, and every session's best lap says more about the session than about
 * the driver getting quicker.
 */
const buildBestLapHistory = (
  group: CareerSessionRecord[],
): { at: number; sec: number }[] => {
  const history: { at: number; sec: number }[] = [];
  let best = Infinity;

  for (const record of [...group].sort(
    (left, right) => left.startedAt - right.startedAt,
  )) {
    const lap = record.bestLapSec;
    if (lap !== null && lap > 0 && lap < best) {
      best = lap;
      history.push({ at: record.startedAt, sec: lap });
    }
  }

  return history;
};

/** Milestones worth a line, in the order they would be reached. */
const LAP_MILESTONES = [100, 500, 1000, 5000, 10000];
const DISTANCE_MILESTONES_KM = [1000, 5000, 10000, 25000, 50000];
const RACE_MILESTONES = [1, 10, 50, 100, 250, 500];

const buildMilestones = (counted: CareerSessionRecord[]): CareerMilestone[] => {
  const chronological = [...counted].sort(
    (left, right) => left.startedAt - right.startedAt,
  );
  const milestones: CareerMilestone[] = [];

  const first = chronological[0];
  if (first) {
    milestones.push({
      key: 'first-session',
      label: 'First session',
      detail: first.trackVenue || first.trackFolder,
      achievedAt: first.startedAt,
    });
  }

  let laps = 0;
  let distanceKm = 0;
  let races = 0;
  let podiums = 0;
  let wins = 0;
  const lapTargets = [...LAP_MILESTONES];
  const distanceTargets = [...DISTANCE_MILESTONES_KM];
  const raceTargets = [...RACE_MILESTONES];

  for (const record of chronological) {
    laps += record.lapsCompleted;
    distanceKm += distanceKmOf(record);

    while (lapTargets.length && laps >= lapTargets[0]) {
      const target = lapTargets.shift() as number;
      milestones.push({
        key: `laps-${target}`,
        label: `${target.toLocaleString()} laps`,
        detail: record.trackVenue || record.trackFolder,
        achievedAt: record.startedAt,
      });
    }

    while (distanceTargets.length && distanceKm >= distanceTargets[0]) {
      const target = distanceTargets.shift() as number;
      milestones.push({
        key: `distance-${target}`,
        label: `${target.toLocaleString()} km`,
        detail: record.trackVenue || record.trackFolder,
        achievedAt: record.startedAt,
      });
    }

    if (!RESULT_SESSION_TYPES.includes(record.sessionType)) {
      continue;
    }

    races += 1;
    while (raceTargets.length && races >= raceTargets[0]) {
      const target = raceTargets.shift() as number;
      milestones.push({
        key: `races-${target}`,
        label: target === 1 ? 'First race' : `${target} races`,
        detail: record.trackVenue || record.trackFolder,
        achievedAt: record.startedAt,
      });
    }

    const finish = record.classFinishPos;
    if (finish !== null && finish <= 3 && podiums === 0) {
      podiums += 1;
      milestones.push({
        key: 'first-podium',
        label: 'First podium',
        detail: `P${finish} at ${record.trackVenue || record.trackFolder}`,
        achievedAt: record.startedAt,
      });
    }
    if (finish === 1 && wins === 0) {
      wins += 1;
      milestones.push({
        key: 'first-win',
        label: 'First win',
        detail: record.trackVenue || record.trackFolder,
        achievedAt: record.startedAt,
      });
    }
  }

  const quickest = counted
    .filter((record) => record.bestLapSec && record.bestLapSec > 0)
    .sort(
      (left, right) =>
        (left.bestLapSec as number) - (right.bestLapSec as number),
    )[0];
  if (quickest) {
    milestones.push({
      key: 'fastest-lap',
      label: 'Fastest lap set',
      detail: `${quickest.trackVenue || quickest.trackFolder} in the ${quickest.carType}`,
      achievedAt: quickest.startedAt,
    });
  }

  return milestones.sort((left, right) => left.achievedAt - right.achievedAt);
};

export const filterCareerSessions = (
  sessions: CareerSessionRecord[],
  filters?: CareerFilters | null,
): CareerSessionRecord[] => {
  if (!filters) {
    return sessions;
  }

  return sessions.filter((record) => {
    if (filters.from && record.startedAt < filters.from) {
      return false;
    }
    if (filters.to && record.startedAt > filters.to) {
      return false;
    }
    if (filters.gameType) {
      const multiplayer = record.setting.trim().toLowerCase() === 'multiplayer';
      if (filters.gameType === 'multiplayer' ? !multiplayer : multiplayer) {
        return false;
      }
    }
    if (filters.carClass && record.carClass !== filters.carClass) {
      return false;
    }
    if (filters.trackFolder && record.trackFolder !== filters.trackFolder) {
      return false;
    }

    return true;
  });
};

/**
 * The choices offered in the filter bar, derived from every session rather than
 * the filtered ones so that narrowing the view never removes the way back.
 */
export const buildCareerFilterOptions = (
  sessions: CareerSessionRecord[],
): CareerFilterOptions => {
  const tracks = new Map<string, string>();
  const carClasses = new Set<string>();
  const startedAts: number[] = [];

  for (const record of sessions) {
    if (record.trackFolder) {
      tracks.set(record.trackFolder, record.trackVenue || record.trackFolder);
    }
    if (record.carClass) {
      carClasses.add(record.carClass);
    }
    if (record.startedAt) {
      startedAts.push(record.startedAt);
    }
  }

  return {
    tracks: [...tracks.entries()]
      .map(([trackFolder, trackVenue]) => ({ trackFolder, trackVenue }))
      .sort((left, right) => left.trackVenue.localeCompare(right.trackVenue)),
    carClasses: [...carClasses].sort(),
    earliestAt: startedAts.length ? Math.min(...startedAts) : null,
    latestAt: startedAts.length ? Math.max(...startedAts) : null,
  };
};

export const buildCareerAggregate = (
  sessions: CareerSessionRecord[],
  identity: CareerIdentity,
  lastScan: CareerScanReport | null,
  filters?: CareerFilters | null,
): CareerAggregate => {
  const allSessions = sessions;
  // eslint-disable-next-line no-param-reassign
  sessions = filterCareerSessions(sessions, filters);

  const counted = sessions.filter((record) => !record.excluded);
  const races = counted.filter((record) =>
    RESULT_SESSION_TYPES.includes(record.sessionType),
  );
  const finishedRaces = races.filter(
    (record) => record.classFinishPos !== null,
  );

  const startedAts = counted.map((record) => record.startedAt).filter(Boolean);
  const isMultiplayer = (record: CareerSessionRecord) =>
    record.setting.trim().toLowerCase() === 'multiplayer';

  const wins = finishedRaces.filter((record) => record.classFinishPos === 1);
  const podiums = finishedRaces.filter(
    (record) => (record.classFinishPos ?? 0) <= 3,
  );

  const totalDistanceKm = counted.reduce(
    (total, record) => total + distanceKmOf(record),
    0,
  );

  const finishDistribution = new Map<number, number>();
  for (const record of finishedRaces) {
    const position = record.classFinishPos as number;
    finishDistribution.set(
      position,
      (finishDistribution.get(position) ?? 0) + 1,
    );
  }

  const penaltyReasons = new Map<string, number>();
  for (const record of counted) {
    for (const penalty of record.penalties) {
      penaltyReasons.set(
        penalty.reason,
        (penaltyReasons.get(penalty.reason) ?? 0) + 1,
      );
    }
  }

  /* Consecutive sessions with no incident and no penalty, oldest to newest. */
  let longestCleanStreak = 0;
  let currentCleanStreak = 0;
  for (const record of [...counted].sort(
    (left, right) => left.startedAt - right.startedAt,
  )) {
    const clean = record.incidentsCaused === 0 && record.penalties.length === 0;
    currentCleanStreak = clean ? currentCleanStreak + 1 : 0;
    longestCleanStreak = Math.max(longestCleanStreak, currentCleanStreak);
  }

  const positionChanges = races
    .filter((record) => record.gridPos !== null && record.finishPos !== null)
    .map((record) => (record.gridPos as number) - (record.finishPos as number));

  const trackGroups = new Map<string, CareerSessionRecord[]>();
  for (const record of counted) {
    const key = `${record.trackFolder}|${record.trackLayout}`;
    trackGroups.set(key, [...(trackGroups.get(key) ?? []), record]);
  }

  const tracks: CareerTrackSummary[] = [...trackGroups.entries()]
    .map(([key, group]) => {
      const groupRaces = group.filter((record) =>
        RESULT_SESSION_TYPES.includes(record.sessionType),
      );
      const distance = group.reduce(
        (total, record) => total + distanceKmOf(record),
        0,
      );
      const incidents = group.reduce(
        (total, record) => total + record.incidentsCaused,
        0,
      );
      const percentiles = groupRaces
        .map(finishPercentile)
        .filter((value): value is number => value !== null);
      const [trackFolder, trackLayout] = key.split('|');

      return {
        trackFolder,
        trackLayout,
        trackVenue: group[0].trackVenue,
        sessions: group.length,
        races: groupRaces.length,
        wins: groupRaces.filter((record) => record.classFinishPos === 1).length,
        podiums: groupRaces.filter(
          (record) =>
            record.classFinishPos !== null && record.classFinishPos <= 3,
        ).length,
        bestClassGridPos: minOrNull(
          groupRaces.map((record) => record.classGridPos),
        ),
        bestClassFinishPos: minOrNull(
          groupRaces.map((record) => record.classFinishPos),
        ),
        bestLapSec: minOrNull(group.map((record) => record.bestLapSec)),
        theoreticalBestSec: minOrNull(
          group.map((record) => record.theoreticalBestSec),
        ),
        averageGapToSessionBest:
          group.filter((record) => gapToSessionBest(record) !== null).length >=
          MIN_SESSIONS_FOR_PACE_RANKING
            ? average(
                group
                  .map(gapToSessionBest)
                  .filter((value): value is number => value !== null),
              )
            : null,
        averageLapSec: average(
          group
            .map((record) => record.averageLapSec)
            .filter((value): value is number => value !== null && value > 0),
        ),
        consistencySec: average(
          group
            .map((record) => record.lapStdDevSec)
            .filter((value): value is number => value !== null && value > 0),
        ),
        topSpeedKph: group.reduce<number | null>(
          (top, record) =>
            record.topSpeedKph !== null && record.topSpeedKph > (top ?? 0)
              ? record.topSpeedKph
              : top,
          null,
        ),
        bestLapHistory: buildBestLapHistory(group),
        averageFinishPercentile:
          groupRaces.length >= MIN_RACES_FOR_TRACK_RANKING
            ? average(percentiles)
            : null,
        lapsCompleted: group.reduce(
          (total, record) => total + record.lapsCompleted,
          0,
        ),
        distanceKm: distance,
        incidentsCaused: incidents,
        incidentsPer100Km: distance > 0 ? (incidents / distance) * 100 : null,
        lastRacedAt: Math.max(...group.map((record) => record.startedAt)),
      };
    })
    .sort((left, right) => right.sessions - left.sessions);

  const carGroups = new Map<string, CareerSessionRecord[]>();
  for (const record of counted) {
    if (!record.carType) {
      continue;
    }
    const key = `${record.carType}|${record.carClass}`;
    carGroups.set(key, [...(carGroups.get(key) ?? []), record]);
  }

  const cars: CareerCarSummary[] = [...carGroups.entries()]
    .map(([key, group]) => {
      const groupRaces = group.filter((record) =>
        RESULT_SESSION_TYPES.includes(record.sessionType),
      );
      const [carType, carClass] = key.split('|');

      return {
        carType,
        carClass,
        sessions: group.length,
        races: groupRaces.length,
        wins: groupRaces.filter((record) => record.classFinishPos === 1).length,
        podiums: groupRaces.filter(
          (record) =>
            record.classFinishPos !== null && record.classFinishPos <= 3,
        ).length,
        bestLapSec: minOrNull(group.map((record) => record.bestLapSec)),
        averageFinishPercentile: average(
          groupRaces
            .map(finishPercentile)
            .filter((value): value is number => value !== null),
        ),
        lapsCompleted: group.reduce(
          (total, record) => total + record.lapsCompleted,
          0,
        ),
        distanceKm: group.reduce(
          (total, record) => total + distanceKmOf(record),
          0,
        ),
        averageGapToSessionBest: average(
          group
            .map(gapToSessionBest)
            .filter((value): value is number => value !== null),
        ),
      };
    })
    .sort((left, right) => right.sessions - left.sessions);

  const incidentsCaused = counted.reduce(
    (total, record) => total + record.incidentsCaused,
    0,
  );

  const newestFirst = [...counted].sort(
    (left, right) => right.startedAt - left.startedAt,
  );
  const gaps = counted
    .map(gapToSessionBest)
    .filter((value): value is number => value !== null);
  const recentGaps = newestFirst
    .slice(0, RECENT_SESSION_COUNT)
    .map(gapToSessionBest)
    .filter((value): value is number => value !== null);

  const pacedLayouts = tracks.filter(
    (track) => track.averageGapToSessionBest !== null,
  );
  const byPace = [...pacedLayouts].sort(
    (left, right) =>
      (left.averageGapToSessionBest ?? 1) -
      (right.averageGapToSessionBest ?? 1),
  );

  /*
   * Rivals are counted from the opponent lists, which name only the drivers who
   * were actually on the grid. AI entries are excluded: "most raced against" is
   * a question about people.
   */
  const rivalSessions = new Map<string, number>();
  const rivalContacts = new Map<string, number>();
  for (const record of counted) {
    for (const opponent of record.opponents ?? []) {
      if (opponent.isAi || !opponent.name) {
        continue;
      }
      rivalSessions.set(
        opponent.name,
        (rivalSessions.get(opponent.name) ?? 0) + 1,
      );
    }
    for (const [name, count] of Object.entries(
      record.contactByOpponent ?? {},
    )) {
      rivalContacts.set(name, (rivalContacts.get(name) ?? 0) + count);
    }
  }

  const toRival = (name: string): CareerRival => ({
    name,
    sessions: rivalSessions.get(name) ?? 0,
    contacts: rivalContacts.get(name) ?? 0,
  });

  const eventTitles = new Map<string, { type: string; sessions: number }>();
  const eventTypes = new Map<string, number>();
  const splits: number[] = [];
  for (const record of counted) {
    if (record.eventTitle) {
      const entry = eventTitles.get(record.eventTitle) ?? {
        type: record.eventType ?? '',
        sessions: 0,
      };
      entry.sessions += 1;
      eventTitles.set(record.eventTitle, entry);
    }
    if (record.eventType) {
      eventTypes.set(
        record.eventType,
        (eventTypes.get(record.eventType) ?? 0) + 1,
      );
    }
    if (typeof record.splitNo === 'number') {
      splits.push(record.splitNo);
    }
  }

  const byDay = new Map<number, number>();
  const byHour = Array.from({ length: 24 }, () => 0);
  const byWeekday = Array.from({ length: 7 }, () => 0);
  const aidUsage = new Map<
    string,
    { firstSeenAt: number; lastSeenAt: number; sessions: number }
  >();

  for (const record of counted) {
    if (!record.startedAt) {
      continue;
    }

    const day = sessionDay(record);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);

    const at = new Date(record.startedAt * 1000);
    byHour[at.getHours()] += 1;
    byWeekday[at.getDay()] += 1;

    for (const aid of readAids(record.aids)) {
      const entry = aidUsage.get(aid) ?? {
        firstSeenAt: record.startedAt,
        lastSeenAt: record.startedAt,
        sessions: 0,
      };
      entry.firstSeenAt = Math.min(entry.firstSeenAt, record.startedAt);
      entry.lastSeenAt = Math.max(entry.lastSeenAt, record.startedAt);
      entry.sessions += 1;
      aidUsage.set(aid, entry);
    }
  }

  const practiceCount = counted.filter(
    (record) => record.sessionType === 'PRACTICE',
  ).length;

  return {
    identity,
    headline: {
      firstSessionAt: startedAts.length ? Math.min(...startedAts) : null,
      lastSessionAt: startedAts.length ? Math.max(...startedAts) : null,
      sessions: counted.length,
      races: races.length,
      qualifying: counted.filter((record) => record.sessionType === 'QUALIFY')
        .length,
      practice: counted.filter((record) => record.sessionType === 'PRACTICE')
        .length,
      multiplayerSessions: counted.filter(isMultiplayer).length,
      raceWeekendSessions: counted.filter((record) => !isMultiplayer(record))
        .length,
      lapsCompleted: counted.reduce(
        (total, record) => total + record.lapsCompleted,
        0,
      ),
      distanceKm: totalDistanceKm,
      timeOnTrackSec: counted.reduce(
        (total, record) =>
          total +
          (record.finishTimeSec ??
            (record.averageLapSec ?? 0) * record.lapsCompleted),
        0,
      ),
      tracks: new Set(
        counted.map((record) => record.trackFolder).filter(Boolean),
      ).size,
      layouts: trackGroups.size,
      cars: new Set(counted.map((record) => record.carType).filter(Boolean))
        .size,
      classes: new Set(counted.map((record) => record.carClass).filter(Boolean))
        .size,
    },
    results: {
      wins: wins.length,
      podiums: podiums.length,
      topFives: finishedRaces.filter(
        (record) => (record.classFinishPos ?? 0) <= 5,
      ).length,
      poles: races.filter((record) => record.classGridPos === 1).length,
      frontRows: races.filter(
        (record) => record.classGridPos !== null && record.classGridPos <= 2,
      ).length,
      winsMultiplayer: wins.filter(isMultiplayer).length,
      winsRaceWeekend: wins.filter((record) => !isMultiplayer(record)).length,
      podiumsMultiplayer: podiums.filter(isMultiplayer).length,
      podiumsRaceWeekend: podiums.filter((record) => !isMultiplayer(record))
        .length,
      averageClassFinish: average(
        finishedRaces.map((record) => record.classFinishPos as number),
      ),
      averageClassGrid: average(
        races
          .filter((record) => record.classGridPos !== null)
          .map((record) => record.classGridPos as number),
      ),
      bestClassFinish: minOrNull(
        finishedRaces.map((record) => record.classFinishPos),
      ),
      worstClassFinish: finishedRaces.length
        ? Math.max(
            ...finishedRaces.map((record) => record.classFinishPos as number),
          )
        : null,
      finishes: races.filter((record) =>
        record.finishStatus.toLowerCase().startsWith('finished'),
      ).length,
      dnfs: races.filter((record) => record.finishStatus === 'DNF').length,
      dnfMechanical: races.filter(
        (record) =>
          record.finishStatus === 'DNF' &&
          !!record.dnfReason &&
          !/accident/i.test(record.dnfReason) &&
          record.dnfReason !== 'DNF',
      ).length,
      dnfAccident: races.filter(
        (record) =>
          record.finishStatus === 'DNF' &&
          /accident/i.test(record.dnfReason ?? ''),
      ).length,
      disqualifications: races.filter((record) => record.finishStatus === 'DQ')
        .length,
      netPositionsGained: positionChanges.reduce(
        (total, value) => total + value,
        0,
      ),
      bestComeback: positionChanges.length
        ? Math.max(...positionChanges)
        : null,
      lapsLed: counted.reduce((total, record) => total + record.lapsLed, 0),
      finishDistribution: [...finishDistribution.entries()]
        .map(([position, count]) => ({ position, count }))
        .sort((left, right) => left.position - right.position),
    },
    discipline: {
      incidentsCaused,
      incidentsInvolved: counted.reduce(
        (total, record) => total + record.incidentsInvolved,
        0,
      ),
      incidentsPer100Km:
        totalDistanceKm > 0 ? (incidentsCaused / totalDistanceKm) * 100 : null,
      contactWithVehicle: counted.reduce(
        (total, record) => total + record.contactWithVehicle,
        0,
      ),
      contactWithScenery: counted.reduce(
        (total, record) => total + record.contactWithScenery,
        0,
      ),
      worstImpactForce: counted.reduce(
        (worst, record) => Math.max(worst, record.incidentForceMax),
        0,
      ),
      penalties: counted.reduce(
        (total, record) => total + record.penalties.length,
        0,
      ),
      penaltiesByReason: [...penaltyReasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count),
      trackLimitWarnings: counted.reduce(
        (total, record) => total + record.trackLimitWarnings,
        0,
      ),
      trackLimitInvalidLaps: counted.reduce(
        (total, record) => total + record.trackLimitInvalidLaps,
        0,
      ),
      longestCleanStreak,
    },
    pace: {
      averageGapToSessionBest: average(gaps),
      recentGapToSessionBest: average(recentGaps),
      /*
       * Qualifying only. Race lap times carry pit stops, safety cars and
       * traffic — measured at ±10.4s against qualifying's ±1.1s on a real
       * career — so averaging every session type reports the shape of the
       * sessions rather than the steadiness of the driver.
       */
      averageConsistencySec: average(
        counted
          .filter((record) => record.sessionType === 'QUALIFY')
          .map((record) => record.lapStdDevSec)
          .filter((value): value is number => value !== null && value > 0),
      ),
      topSpeedKph: counted.reduce<number | null>(
        (top, record) =>
          record.topSpeedKph !== null && record.topSpeedKph > (top ?? 0)
            ? record.topSpeedKph
            : top,
        null,
      ),
      strongestLayouts: byPace.slice(0, 3),
      weakestLayouts: byPace.slice(-3).reverse(),
    },
    rivals: {
      mostRaced: [...rivalSessions.keys()]
        .map(toRival)
        .sort((left, right) => right.sessions - left.sessions)
        .slice(0, 8),
      nemeses: [...rivalContacts.keys()]
        .map(toRival)
        .filter((rival) => rival.contacts > 0)
        .sort((left, right) => right.contacts - left.contacts)
        .slice(0, 8),
      averageFieldSize: average(
        counted
          .map((record) => record.fieldSize)
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
      humanShare: average(
        counted
          .filter((record) => record.fieldSize > 0)
          .map((record) => record.humanCount / record.fieldSize),
      ),
    },
    events: {
      byTitle: [...eventTitles.entries()]
        .map(([title, entry]) => ({
          title,
          type: entry.type,
          sessions: entry.sessions,
        }))
        .sort((left, right) => right.sessions - left.sessions),
      byType: [...eventTypes.entries()]
        .map(([type, sessionCount]) => ({ type, sessions: sessionCount }))
        .sort((left, right) => right.sessions - left.sessions),
      averageSplit: average(splits),
    },
    activity: {
      byDay: [...byDay.entries()]
        .map(([day, sessionCount]) => ({ day, sessions: sessionCount }))
        .sort((left, right) => left.day - right.day),
      byHour,
      byWeekday,
      practicePerRace: races.length ? practiceCount / races.length : null,
      aidUsage: [...aidUsage.entries()]
        .map(([aid, entry]) => ({ aid, ...entry }))
        .sort((left, right) => right.sessions - left.sessions),
    },
    milestones: buildMilestones(counted),
    tracks,
    cars,
    filterOptions: buildCareerFilterOptions(allSessions),
    recentSessions: newestFirst.slice(0, RECENT_SESSION_COUNT),
    dataHealth: {
      sessionsWithMissingFiles: sessions.filter((record) => !record.filePresent)
        .length,
      excludedSessions: sessions.filter((record) => record.excluded).length,
      lastScan,
    },
  };
};

export const getCareerAggregate = (
  filters?: CareerFilters | null,
): CareerAggregate =>
  buildCareerAggregate(
    Object.values(readCareerSessions()),
    ensureCareerIdentity(),
    readLastScan(),
    filters,
  );
