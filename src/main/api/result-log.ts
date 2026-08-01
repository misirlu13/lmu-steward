import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { SessionType } from '@types';

/**
 * The one pass over a result log.
 *
 * Everything that reads a log reads it through here: replay/log matching, the
 * dashboard's session summary, and the driver career. They used to want
 * different things badly enough to justify separate parsers — a streaming one
 * for counts, a whole-document xml2js one for detail — and the cost of that was
 * paid per consumer, per file.
 *
 * That stops being affordable at endurance scale. A 62-car 24-hour result log
 * projects to ~29 MB with ~32 000 lap rows and ~99 000 stream events, so the
 * only sustainable shape is a single streaming pass that produces everything at
 * once, in memory bounded by the size of the field rather than the length of
 * the race.
 *
 * Two things make that bound hold:
 *
 * 1. `<Stream>` comes *before* the driver blocks, so the parser meets every
 *    incident, penalty and track-limit event before it knows which driver is
 *    the player. Rather than retain them to filter later — tens of thousands of
 *    records in a 24h race — each event is folded into a small accumulator
 *    keyed by driver name as it goes past, and the player's is selected when
 *    the session closes. Memory is O(drivers), flat in race length.
 *
 * 2. `<Name>` opens every driver block, so a driver can be recognised before
 *    their `<Lap>` rows are reached and every other driver's laps skipped
 *    without their attributes ever being parsed. On a 28.6 MB 24h log that is
 *    the difference between 669 ms and 150 ms.
 *
 * Identity is the driver's name, not `<isPlayer>`. That element marks every
 * human on the grid: exactly one in an offline race weekend, and the entire
 * field online — measured at 240 of 242 multiplayer logs in a real install,
 * one of them with twenty-three. Reading it as "the local driver" is right
 * offline by coincidence and picks a stranger online.
 */

export interface ParsedSessionSummary {
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

/**
 * The session summary the dashboard renders from. Shape is load-bearing — it is
 * stored in the replay cache and read by sessionUtils — so it is produced here
 * exactly as the parsers it replaces produced it, one fix aside (see
 * TRACK_LIMITS_TAG).
 */
export interface ParsedRaceResults {
  Setting?: string;
  DateTime?: number;
  TrackVenue?: string;
  TrackCourse?: string;
  TrackEvent?: string;
  /** Path to the layout's .mas, which is where track folder/version/layout live. */
  TrackData?: string;
  TrackLength?: number;
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

export interface ParsedLogXml {
  rFactorXML?: {
    RaceResults?: ParsedRaceResults;
  };
}

/** One driver's result row, as the log records it. */
export interface ResultLogDriver {
  name: string;
  carClass: string;
  carType: string;
  carNumber: string;
  teamName: string;
  vehFile: string;
  /**
   * Human-controlled — *not* "this is the local user".
   *
   * Measured across a real install: every one of 146 race-weekend logs has
   * exactly one, because you are the only human on the grid, but 240 of 242
   * multiplayer logs have several and one had twenty-three. Reading it as the
   * local driver works offline by coincidence and picks an arbitrary stranger
   * online. Identity comes from the driver's name; see `playerNames`.
   */
  isPlayer: boolean;
  /**
   * From ControlAndAids containing `AIControl`, not from `isPlayer === 0`.
   * The latter is how the rest of the app currently decides, which badges every
   * human opponent in a multiplayer race as AI.
   */
  isAi: boolean;
  aids: string;
  gridPos: number | null;
  classGridPos: number | null;
  finishPos: number | null;
  classFinishPos: number | null;
  lapsCompleted: number | null;
  pitstops: number | null;
  finishStatus: string;
  dnfReason: string | null;
  finishTimeSec: number | null;
  bestLapSec: number | null;
}

export interface ResultLogPenalty {
  penalty: string;
  reason: string;
  timeSec: number | null;
}

/** Per-driver conduct, accumulated from the stream as it is read. */
export interface ResultLogConduct {
  /** Incidents this driver was reported for. */
  incidentsCaused: number;
  /** Incidents naming this driver at all, including as the other party. */
  incidentsInvolved: number;
  incidentForceTotal: number;
  incidentForceMax: number;
  contactWithVehicle: number;
  contactWithScenery: number;
  penalties: ResultLogPenalty[];
  trackLimitEvents: number;
  /** Everything the stewards actually acted on — not "No Further Action". */
  trackLimitWarnings: number;
  trackLimitInvalidLaps: number;
  trackLimitPenalties: number;
}

export interface ResultLogLapStats {
  lapCount: number;
  /** Laps with a real time; an invalid or unfinished lap records `--.----`. */
  timedLapCount: number;
  bestLapSec: number | null;
  bestLapNum: number | null;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBestSec: number | null;
  averageLapSec: number | null;
  lapStdDevSec: number | null;
  topSpeedKph: number | null;
  lapsLed: number;
  firstLapPos: number | null;
  positionByLap: number[];
  compounds: string[];
  fuelUsedPerLap: number | null;
}

export interface ResultLogOpponent {
  name: string;
  carClass: string;
  isAi: boolean;
}

export interface CareerLogFacts {
  /** The session's own DateTime, not the event's. */
  sessionStartedAt: number | null;
  sessionType: SessionType | null;
  player: ResultLogDriver | null;
  playerConduct: ResultLogConduct | null;
  playerLaps: ResultLogLapStats | null;
  fieldSize: number;
  classFieldSize: number;
  aiCount: number;
  humanCount: number;
  classes: string[];
  /** Fastest lap set by anyone, which is what "gap to fastest" needs. */
  sessionBestLapSec: number | null;
  classBestLapSec: number | null;
  opponents: ResultLogOpponent[];
  /**
   * Set when the player finished laps the parser never saw, which would mean
   * `<Lap>` had moved ahead of `<Name>` in some future format. A canary for the
   * one ordering assumption this parser makes.
   */
  lapDataMissed: boolean;
}

export interface ResultLogRecord {
  summary: ParsedRaceResults;
  /** Null when the log holds no session, or no session names a player. */
  career: CareerLogFacts | null;
  /**
   * The only human on the grid, when there was exactly one and it was not the
   * driver being looked for.
   *
   * This is what a rename or a second LMU profile looks like: an offline race
   * weekend whose sole human carries a name the career does not recognise. A
   * multiplayer field has many humans and offers nothing here, which keeps the
   * whole roster of an imported stranger's race out of the claim prompt.
   */
  soleHumanName: string | null;
  /**
   * The session holds several human drivers and no names were supplied, so
   * which one is "us" cannot be decided.
   *
   * Reported here rather than on the facts because there are no facts in this
   * case — the session is left unattributed rather than credited to whoever
   * happened to be read last.
   */
  playerAmbiguous: boolean;
}

export type ResultLogParser = (filePath: string) => Promise<ResultLogRecord>;

/**
 * Names, normalised, that identify the driver whose career is being built.
 *
 * Multiplayer appends a discriminator — `Steve Davis#1924` — so it is stripped
 * before comparison, as are XML entities and surrounding space.
 */
export const normalizeDriverName = (value: string): string =>
  String(value ?? '')
    .replace(/#\d+$/, '')
    .trim()
    .toLowerCase();

/*
 * The element is <TrackLimits>, plural. Both parsers this replaces compared the
 * lowercased tag against 'tracklimit', so TrackLimitCount was silently always
 * undefined and the dashboard fell back to zero for every replay whose full log
 * was not loaded. Fixed here, which means track-limit counts start appearing on
 * the dashboard where they previously read 0 — hence the replay cache schema
 * bump that goes with this change.
 */
const TRACK_LIMITS_TAG = 'tracklimits';

const SESSION_ELEMENTS: Record<string, 'Race' | 'Qualify' | 'Practice1'> = {
  race: 'Race',
  qualify: 'Qualify',
  practice1: 'Practice1',
};

const SESSION_TYPE_BY_ELEMENT: Record<string, SessionType> = {
  Race: 'RACE',
  Qualify: 'QUALIFY',
  Practice1: 'PRACTICE',
};

/** Header and driver scalars, keyed by lowercased tag name. */
const CAPTURED_SCALARS: Record<string, string> = {
  datetime: 'DateTime',
  setting: 'Setting',
  trackvenue: 'TrackVenue',
  trackcourse: 'TrackCourse',
  trackevent: 'TrackEvent',
  trackdata: 'TrackData',
  tracklength: 'TrackLength',
  gameversion: 'GameVersion',
  fuelmult: 'FuelMult',
  tiremult: 'TireMult',
  tirewarmers: 'TireWarmers',
  minutes: 'Minutes',
  carclass: 'CarClass',
  name: 'Name',
  vehfile: 'VehFile',
  cartype: 'CarType',
  carnumber: 'CarNumber',
  teamname: 'TeamName',
  isplayer: 'isPlayer',
  gridpos: 'GridPos',
  position: 'Position',
  classgridpos: 'ClassGridPos',
  classposition: 'ClassPosition',
  laps: 'Laps',
  pitstops: 'Pitstops',
  finishstatus: 'FinishStatus',
  dnfreason: 'DNFReason',
  finishtime: 'FinishTime',
  bestlaptime: 'BestLapTime',
  controlandaids: 'ControlAndAids',
};

const decodeXmlText = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const toNumberOrNull = (value: string | undefined): number | null => {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readAttributes = (tagText: string): Record<string, string> => {
  const attributes: Record<string, string> = {};

  for (const match of tagText.matchAll(/([A-Za-z0-9_:.-]+)="([^"]*)"/g)) {
    attributes[match[1]] = decodeXmlText(match[2]);
  }

  return attributes;
};

const emptyConduct = (): ResultLogConduct => ({
  incidentsCaused: 0,
  incidentsInvolved: 0,
  incidentForceTotal: 0,
  incidentForceMax: 0,
  contactWithVehicle: 0,
  contactWithScenery: 0,
  penalties: [],
  trackLimitEvents: 0,
  trackLimitWarnings: 0,
  trackLimitInvalidLaps: 0,
  trackLimitPenalties: 0,
});

interface LapAccumulator {
  lapCount: number;
  timedLapCount: number;
  bestLapSec: number | null;
  bestLapNum: number | null;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  sum: number;
  sumSquares: number;
  topSpeedKph: number | null;
  lapsLed: number;
  firstLapPos: number | null;
  positionByLap: number[];
  compounds: Set<string>;
  fuelUsedTotal: number;
  fuelUsedSamples: number;
}

const createLapAccumulator = (): LapAccumulator => ({
  lapCount: 0,
  timedLapCount: 0,
  bestLapSec: null,
  bestLapNum: null,
  bestS1: null,
  bestS2: null,
  bestS3: null,
  sum: 0,
  sumSquares: 0,
  topSpeedKph: null,
  lapsLed: 0,
  firstLapPos: null,
  positionByLap: [],
  compounds: new Set(),
  fuelUsedTotal: 0,
  fuelUsedSamples: 0,
});

const minOrNull = (current: number | null, candidate: number | null) => {
  if (candidate === null || candidate <= 0) {
    return current;
  }
  return current === null || candidate < current ? candidate : current;
};

const finaliseLapStats = (
  accumulator: LapAccumulator | null,
): ResultLogLapStats | null => {
  if (!accumulator) {
    return null;
  }

  const { timedLapCount, sum, sumSquares, bestS1, bestS2, bestS3 } =
    accumulator;
  const averageLapSec = timedLapCount > 0 ? sum / timedLapCount : null;
  /*
   * Population standard deviation, not a sample estimate — these are all the
   * laps the driver ran, not a sample drawn from a larger set. Clamped at zero
   * because floating-point accumulation can leave the variance fractionally
   * negative when every lap is identical.
   */
  const variance =
    timedLapCount > 0 && averageLapSec !== null
      ? Math.max(0, sumSquares / timedLapCount - averageLapSec * averageLapSec)
      : null;

  return {
    lapCount: accumulator.lapCount,
    timedLapCount,
    bestLapSec: accumulator.bestLapSec,
    bestLapNum: accumulator.bestLapNum,
    bestS1,
    bestS2,
    bestS3,
    theoreticalBestSec:
      bestS1 !== null && bestS2 !== null && bestS3 !== null
        ? bestS1 + bestS2 + bestS3
        : null,
    averageLapSec,
    lapStdDevSec: variance === null ? null : Math.sqrt(variance),
    topSpeedKph: accumulator.topSpeedKph,
    lapsLed: accumulator.lapsLed,
    firstLapPos: accumulator.firstLapPos,
    positionByLap: accumulator.positionByLap,
    compounds: [...accumulator.compounds],
    fuelUsedPerLap:
      accumulator.fuelUsedSamples > 0
        ? accumulator.fuelUsedTotal / accumulator.fuelUsedSamples
        : null,
  };
};

interface DriverScalars {
  [key: string]: string;
}

interface SessionAccumulator {
  element: 'Race' | 'Qualify' | 'Practice1';
  startedAt: number | null;
  driverCount: number;
  incidentCount: number;
  penaltyCount: number;
  trackLimitCount: number;
  carClasses: Set<string>;
  drivers: ResultLogDriver[];
  conductByDriver: Map<string, ResultLogConduct>;
  playerLaps: LapAccumulator | null;
  player: ResultLogDriver | null;
  /** How many drivers were human, used only for the no-names fallback. */
  humanDrivers: number;
}

const createSessionAccumulator = (
  element: 'Race' | 'Qualify' | 'Practice1',
): SessionAccumulator => ({
  element,
  startedAt: null,
  driverCount: 0,
  incidentCount: 0,
  penaltyCount: 0,
  trackLimitCount: 0,
  carClasses: new Set(),
  drivers: [],
  conductByDriver: new Map(),
  playerLaps: null,
  player: null,
  humanDrivers: 0,
});

/**
 * Driver names in the stream carry a slot id — `Bradley Drake(9)` — and in
 * multiplayer may carry a discriminator, `Steve Davis#1924`. Conduct is keyed on
 * the raw name as the log writes it in the driver block; the stream's forms are
 * reduced to that before lookup.
 */
const conductFor = (
  session: SessionAccumulator,
  driverName: string,
): ResultLogConduct => {
  const key = driverName.trim();
  let conduct = session.conductByDriver.get(key);

  if (!conduct) {
    conduct = emptyConduct();
    session.conductByDriver.set(key, conduct);
  }

  return conduct;
};

const INCIDENT_SUBJECT = /^([^()]+)\((\d+)\)/;
const INCIDENT_OTHER_PARTY =
  /with\s+(?:another\s+vehicle\s+)?([^()]+)\((\d+)\)/i;
const INCIDENT_FORCE = /reported\s+contact\s*\((\d+(?:\.\d+)?)\)/i;

const applyIncident = (session: SessionAccumulator, text: string) => {
  const subject = text.match(INCIDENT_SUBJECT);
  if (!subject) {
    return;
  }

  const subjectName = subject[1].trim();
  const conduct = conductFor(session, subjectName);
  conduct.incidentsCaused += 1;
  conduct.incidentsInvolved += 1;

  const force = text.match(INCIDENT_FORCE);
  if (force) {
    const value = Number(force[1]);
    if (Number.isFinite(value)) {
      conduct.incidentForceTotal += value;
      conduct.incidentForceMax = Math.max(conduct.incidentForceMax, value);
    }
  }

  const other = text.match(INCIDENT_OTHER_PARTY);
  if (other) {
    conduct.contactWithVehicle += 1;
    const otherName = other[1].trim();
    if (otherName && otherName !== subjectName) {
      conductFor(session, otherName).incidentsInvolved += 1;
    }
  } else {
    // "reported contact (4529.33) with Immovable" — a wall, not a car.
    conduct.contactWithScenery += 1;
  }
};

const applyTrackLimits = (
  session: SessionAccumulator,
  attributes: Record<string, string>,
  resolution: string,
) => {
  const driverName = attributes.Driver;
  if (!driverName) {
    return;
  }

  const conduct = conductFor(session, driverName);
  conduct.trackLimitEvents += 1;

  const normalised = resolution.trim().toLowerCase();
  if (normalised === 'no further action' || normalised === '') {
    return;
  }

  conduct.trackLimitWarnings += 1;

  if (normalised.startsWith('invalid lap')) {
    conduct.trackLimitInvalidLaps += 1;
  } else if (
    normalised.includes('penalty') ||
    normalised.includes('drive through') ||
    normalised.includes('disqualify')
  ) {
    conduct.trackLimitPenalties += 1;
  }
};

const applyPenalty = (
  session: SessionAccumulator,
  attributes: Record<string, string>,
) => {
  /*
   * A penalty being served produces further <Penalty> elements with no Driver
   * or Reason — "finished before serving penalty", "served 1st Stop/Go". Only
   * the issuing record is a penalty; counting the rest triples the total.
   */
  if (!attributes.Driver || !attributes.Reason) {
    return;
  }

  conductFor(session, attributes.Driver).penalties.push({
    penalty: attributes.Penalty ?? '',
    reason: attributes.Reason,
    timeSec: toNumberOrNull(attributes.Time),
  });
};

const buildDriver = (scalars: DriverScalars): ResultLogDriver => {
  const aids = scalars.ControlAndAids ?? '';

  return {
    name: scalars.Name ?? '',
    carClass: scalars.CarClass ?? '',
    carType: scalars.CarType ?? '',
    carNumber: scalars.CarNumber ?? '',
    teamName: scalars.TeamName ?? '',
    vehFile: scalars.VehFile ?? '',
    isPlayer: scalars.isPlayer === '1',
    isAi: /\bAIControl\b/.test(aids),
    aids,
    gridPos: toNumberOrNull(scalars.GridPos),
    classGridPos: toNumberOrNull(scalars.ClassGridPos),
    finishPos: toNumberOrNull(scalars.Position),
    classFinishPos: toNumberOrNull(scalars.ClassPosition),
    lapsCompleted: toNumberOrNull(scalars.Laps),
    pitstops: toNumberOrNull(scalars.Pitstops),
    finishStatus: scalars.FinishStatus ?? '',
    dnfReason: scalars.DNFReason ?? null,
    finishTimeSec: toNumberOrNull(scalars.FinishTime),
    bestLapSec: toNumberOrNull(scalars.BestLapTime),
  };
};

const buildCareerFacts = (
  session: SessionAccumulator,
  hasPlayerNames: boolean,
): CareerLogFacts | null => {
  /*
   * With names, the player is whoever matched them. Without them the only safe
   * reading is a session holding exactly one human — every offline race
   * weekend, and almost nothing online. Guessing in the ambiguous case would
   * attribute a stranger's race to this driver, so it reports nothing instead.
   */
  const soleHuman =
    session.humanDrivers === 1
      ? (session.drivers.find((driver) => driver.isPlayer) ?? null)
      : null;
  const player = hasPlayerNames ? session.player : soleHuman;

  if (!player) {
    return null;
  }

  const opponents = session.drivers
    .filter((driver) => driver !== player)
    .map((driver) => ({
      name: driver.name,
      carClass: driver.carClass,
      isAi: driver.isAi,
    }));

  const bestLaps = session.drivers
    .map((driver) => driver.bestLapSec)
    .filter((best): best is number => best !== null && best > 0);
  const classBestLaps = session.drivers
    .filter((driver) => driver.carClass === player.carClass)
    .map((driver) => driver.bestLapSec)
    .filter((best): best is number => best !== null && best > 0);

  const playerLaps = finaliseLapStats(session.playerLaps);

  return {
    sessionStartedAt: session.startedAt,
    sessionType: SESSION_TYPE_BY_ELEMENT[session.element] ?? null,
    player,
    playerConduct:
      session.conductByDriver.get(player.name.trim()) ?? emptyConduct(),
    playerLaps,
    fieldSize: session.drivers.length,
    classFieldSize: session.drivers.filter(
      (driver) => driver.carClass === player.carClass,
    ).length,
    aiCount: session.drivers.filter((driver) => driver.isAi).length,
    humanCount: session.drivers.filter((driver) => !driver.isAi).length,
    classes: [...session.carClasses],
    sessionBestLapSec: bestLaps.length ? Math.min(...bestLaps) : null,
    classBestLapSec: classBestLaps.length ? Math.min(...classBestLaps) : null,
    opponents,
    lapDataMissed:
      (player.lapsCompleted ?? 0) > 0 && (playerLaps?.lapCount ?? 0) === 0,
  };
};

interface Extractor {
  onText: (text: string) => void;
  onTag: (tagText: string) => void;
  finish: () => ResultLogRecord;
}

const createExtractor = (playerNames?: ReadonlySet<string>): Extractor => {
  const hasPlayerNames = Boolean(playerNames && playerNames.size > 0);
  const raceResults: ParsedRaceResults = {};
  let career: CareerLogFacts | null = null;

  let raceResultsDepth = 0;
  let captureTag: string | null = null;
  let captureText = '';
  let session: SessionAccumulator | null = null;
  let inStream = false;
  let driverScalars: DriverScalars | null = null;
  /*
   * Whether the block currently being read is the player's. Distinct from
   * `session.playerLaps` existing, which stays true for the rest of the session
   * once the player has been seen — reading laps off that would fold every
   * subsequent driver's laps into the player's totals.
   */
  let inPlayerBlock = false;
  let pendingLap: Record<string, string> | null = null;
  let pendingTrackLimits: Record<string, string> | null = null;

  let soleHumanName: string | null = null;
  let playerAmbiguous = false;
  let totalDriverCount = 0;
  let totalIncidentCount = 0;
  let totalPenaltyCount = 0;
  let totalTrackLimitCount = 0;

  const commitLap = (lapTimeText: string) => {
    const attributes = pendingLap;
    pendingLap = null;

    const accumulator = session?.playerLaps;
    if (!attributes || !accumulator) {
      return;
    }

    accumulator.lapCount += 1;

    const position = toNumberOrNull(attributes.p);
    if (position !== null) {
      accumulator.positionByLap.push(position);
      if (position === 1) {
        accumulator.lapsLed += 1;
      }
      if (toNumberOrNull(attributes.num) === 1) {
        accumulator.firstLapPos = position;
      }
    }

    const lapTime = Number(lapTimeText.trim());
    if (Number.isFinite(lapTime) && lapTime > 0) {
      accumulator.timedLapCount += 1;
      accumulator.sum += lapTime;
      accumulator.sumSquares += lapTime * lapTime;
      if (accumulator.bestLapSec === null || lapTime < accumulator.bestLapSec) {
        accumulator.bestLapSec = lapTime;
        accumulator.bestLapNum = toNumberOrNull(attributes.num);
      }
    }

    accumulator.bestS1 = minOrNull(
      accumulator.bestS1,
      toNumberOrNull(attributes.s1),
    );
    accumulator.bestS2 = minOrNull(
      accumulator.bestS2,
      toNumberOrNull(attributes.s2),
    );
    accumulator.bestS3 = minOrNull(
      accumulator.bestS3,
      toNumberOrNull(attributes.s3),
    );

    const topSpeed = toNumberOrNull(attributes.topspeed);
    if (topSpeed !== null && topSpeed > (accumulator.topSpeedKph ?? 0)) {
      accumulator.topSpeedKph = topSpeed;
    }

    const fuelUsed = toNumberOrNull(attributes.fuelUsed);
    if (fuelUsed !== null && fuelUsed > 0) {
      accumulator.fuelUsedTotal += fuelUsed;
      accumulator.fuelUsedSamples += 1;
    }

    for (const key of ['fcompound', 'rcompound']) {
      const compound = attributes[key];
      if (compound) {
        accumulator.compounds.add(compound);
      }
    }
  };

  const commitCapture = () => {
    if (!captureTag) {
      return;
    }

    const tag = captureTag;
    const value = decodeXmlText(captureText).trim();
    captureTag = null;
    captureText = '';

    if (tag === 'Lap') {
      commitLap(value);
      return;
    }

    if (tag === 'TrackLimits') {
      if (session && pendingTrackLimits) {
        applyTrackLimits(session, pendingTrackLimits, value);
      }
      pendingTrackLimits = null;
      return;
    }

    if (tag === 'Incident') {
      if (session) {
        applyIncident(session, value);
      }
      return;
    }

    // Inside a driver block every captured scalar belongs to that driver.
    if (driverScalars) {
      driverScalars[tag] = value;
      if (tag === 'CarClass' && session && value) {
        session.carClasses.add(value);
      }
      /*
       * The one place the ordering assumption is used. <Name> opens every
       * driver block, so matching here lets every other driver's laps be
       * skipped without their attributes ever being parsed.
       */
      if (tag === 'Name' && session && hasPlayerNames) {
        if (playerNames?.has(normalizeDriverName(value))) {
          inPlayerBlock = true;
          session.playerLaps = createLapAccumulator();
        }
        return;
      }

      /*
       * Without names there is no way to know which block is ours until the
       * session closes, so laps are collected for any human and kept only if
       * that human turns out to be the only one.
       */
      if (tag === 'isPlayer' && value === '1' && session && !hasPlayerNames) {
        inPlayerBlock = true;
        session.playerLaps = createLapAccumulator();
      }
      return;
    }

    switch (tag) {
      case 'DateTime':
        /*
         * Only the root <DateTime>, which is when LMU created the event — the
         * same instant it stamps onto every .Vcr for that weekend, and
         * therefore what the replay API reports as a replay's timestamp. The
         * session's own <DateTime> is kept separately, for the career.
         */
        if (session) {
          session.startedAt = Number(value) || null;
        } else {
          raceResults.DateTime = Number(value) || undefined;
        }
        break;
      case 'Setting':
        raceResults.Setting = value || undefined;
        break;
      case 'TrackVenue':
        raceResults.TrackVenue = value || undefined;
        break;
      case 'TrackCourse':
        raceResults.TrackCourse = value || undefined;
        break;
      case 'TrackEvent':
        raceResults.TrackEvent = value || undefined;
        break;
      case 'TrackData':
        raceResults.TrackData = value || undefined;
        break;
      case 'TrackLength':
        raceResults.TrackLength = Number(value) || undefined;
        break;
      case 'GameVersion':
        raceResults.GameVersion = value || undefined;
        break;
      case 'FuelMult':
        raceResults.FuelMult = Number(value) || undefined;
        break;
      case 'TireMult':
        raceResults.TireMult = Number(value) || undefined;
        break;
      case 'TireWarmers':
        raceResults.TireWarmers = value || undefined;
        break;
      case 'Minutes':
        if (session) {
          const summary = raceResults[session.element] as ParsedSessionSummary;
          if (summary) {
            summary.Minutes = Number(value) || undefined;
          }
        }
        break;
      case 'CarClass':
        if (session && value) {
          session.carClasses.add(value);
        }
        break;
      default:
        break;
    }
  };

  const closeSession = () => {
    if (!session) {
      return;
    }

    const summary = raceResults[session.element] as ParsedSessionSummary;
    if (summary) {
      summary.DriverCount = session.driverCount || undefined;
      if (session.carClasses.size > 0) {
        summary.CarClasses = [...session.carClasses];
      }
      summary.IncidentCount = session.incidentCount || undefined;
      summary.PenaltyCount = session.penaltyCount || undefined;
      summary.TrackLimitCount = session.trackLimitCount || undefined;
      summary.Stream = {
        IncidentCount: session.incidentCount || undefined,
        PenaltyCount: session.penaltyCount || undefined,
        TrackLimitCount: session.trackLimitCount || undefined,
      };
    }

    career = buildCareerFacts(session, hasPlayerNames) ?? career;

    /*
     * Recorded whether or not the session was claimed, so the career can offer
     * an unrecognised name back to the user instead of silently ignoring it.
     */
    if (session.humanDrivers === 1) {
      const human = session.drivers.find((driver) => driver.isPlayer);
      if (human && human !== career?.player) {
        soleHumanName = human.name;
      }
    } else if (!hasPlayerNames && session.humanDrivers > 1) {
      playerAmbiguous = true;
    }

    session = null;
  };

  const countStreamEvent = (tagName: string) => {
    if (!session || !inStream) {
      return false;
    }

    if (tagName === 'incident') {
      session.incidentCount += 1;
      totalIncidentCount += 1;
      return true;
    }
    if (tagName === 'penalty') {
      session.penaltyCount += 1;
      totalPenaltyCount += 1;
      return true;
    }
    if (tagName === TRACK_LIMITS_TAG) {
      session.trackLimitCount += 1;
      totalTrackLimitCount += 1;
      return true;
    }

    return false;
  };

  const onTag = (tagText: string) => {
    if (!tagText.startsWith('<') || tagText.startsWith('<!--')) {
      return;
    }

    const isClosing = tagText.startsWith('</');
    const isSelfClosing = /\/\s*>$/.test(tagText);
    const nameMatch = tagText.match(
      /^<\s*(\/)?\s*([A-Za-z0-9:_.-]+)(?:\s[^>]*)?\/?\s*>$/,
    );

    if (!nameMatch) {
      return;
    }

    const tagName = nameMatch[2].toLowerCase();

    if (captureTag && (isClosing || isSelfClosing)) {
      if (tagName === captureTag.toLowerCase()) {
        commitCapture();
      }
    }

    if (isClosing) {
      if (tagName === 'raceresults' && raceResultsDepth > 0) {
        raceResultsDepth -= 1;
      }
      if (tagName === 'driver') {
        if (session && driverScalars) {
          const driver = buildDriver(driverScalars);
          session.drivers.push(driver);
          if (driver.isPlayer) {
            session.humanDrivers += 1;
          }
          if (inPlayerBlock) {
            session.player = driver;
          }
        }
        driverScalars = null;
        inPlayerBlock = false;
      }
      if (tagName === 'stream') {
        inStream = false;
      }
      if (SESSION_ELEMENTS[tagName]) {
        closeSession();
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

    const sessionElement = SESSION_ELEMENTS[tagName];
    if (sessionElement) {
      raceResults[sessionElement] = {};
      session = createSessionAccumulator(sessionElement);
      /*
       * A self-closing <Race /> is deliberately left open rather than closed
       * here. Closing it would write the count fields onto the summary, and a
       * session element with no content has always produced a bare `{}` — which
       * is what the session-type detection and the dashboard both read.
       */
      return;
    }

    if (isSelfClosing) {
      if (tagName === 'driver' && session) {
        session.driverCount += 1;
        totalDriverCount += 1;
      }
      countStreamEvent(tagName);
      return;
    }

    if (tagName === 'driver') {
      if (session) {
        session.driverCount += 1;
        totalDriverCount += 1;
      }
      driverScalars = {};
      return;
    }

    if (tagName === 'lap') {
      // Skipped entirely unless this block is the player's.
      if (inPlayerBlock && session?.playerLaps) {
        pendingLap = readAttributes(tagText);
        captureTag = 'Lap';
        captureText = '';
      }
      return;
    }

    if (tagName === 'incident' && countStreamEvent(tagName)) {
      captureTag = 'Incident';
      captureText = '';
      return;
    }

    if (tagName === 'penalty' && countStreamEvent(tagName)) {
      if (session) {
        applyPenalty(session, readAttributes(tagText));
      }
      return;
    }

    if (tagName === TRACK_LIMITS_TAG && countStreamEvent(tagName)) {
      pendingTrackLimits = readAttributes(tagText);
      captureTag = 'TrackLimits';
      captureText = '';
      return;
    }

    if (tagName === 'stream') {
      inStream = true;
      return;
    }

    const scalar = CAPTURED_SCALARS[tagName];
    if (scalar) {
      captureTag = scalar;
      captureText = '';
    }
  };

  const onText = (text: string) => {
    if (captureTag) {
      captureText += text;
    }
  };

  const finish = (): ResultLogRecord => {
    if (captureTag) {
      commitCapture();
    }

    if (raceResultsDepth !== 0 || captureTag !== null) {
      throw new Error('Malformed XML log');
    }

    raceResults.IncidentCount = totalIncidentCount || undefined;
    raceResults.PenaltyCount = totalPenaltyCount || undefined;
    raceResults.TrackLimitCount = totalTrackLimitCount || undefined;
    raceResults.DriverCount = totalDriverCount || undefined;

    return { summary: raceResults, career, soleHumanName, playerAmbiguous };
  };

  return { onText, onTag, finish };
};

/** Feeds text through the extractor, carrying a partial tag across chunks. */
const createChunkScanner = (extractor: Extractor) => {
  let pending = '';

  return {
    push(chunkText: string) {
      const combined = pending + chunkText;
      let searchFrom = 0;

      for (;;) {
        const openIndex = combined.indexOf('<', searchFrom);
        if (openIndex === -1) {
          pending = combined.slice(searchFrom);
          break;
        }

        const closeIndex = combined.indexOf('>', openIndex + 1);
        if (closeIndex === -1) {
          pending = combined.slice(openIndex);
          break;
        }

        if (openIndex > searchFrom) {
          extractor.onText(combined.slice(searchFrom, openIndex));
        }
        extractor.onTag(combined.slice(openIndex, closeIndex + 1));
        searchFrom = closeIndex + 1;
      }
    },
    flush() {
      if (pending) {
        extractor.onText(pending);
        pending = '';
      }
    },
  };
};

export const parseResultLogFromString = (
  xml: string,
  playerNames?: ReadonlySet<string>,
): ResultLogRecord => {
  const extractor = createExtractor(playerNames);
  const scanner = createChunkScanner(extractor);

  scanner.push(xml);
  scanner.flush();

  return extractor.finish();
};

export const parseResultLogFromStream = async (
  stream: AsyncIterable<string | Buffer>,
  playerNames?: ReadonlySet<string>,
): Promise<ResultLogRecord> => {
  const extractor = createExtractor(playerNames);
  const scanner = createChunkScanner(extractor);

  for await (const chunk of stream) {
    scanner.push(typeof chunk === 'string' ? chunk : chunk.toString());
  }

  scanner.flush();

  return extractor.finish();
};

/**
 * Reads a result log, streaming it.
 *
 * Falls back to reading the file whole only when a stream cannot be opened at
 * all — which is what the fs-mocking unit tests exercise. A 24h log must never
 * take that path in production.
 */
export const parseResultLog = async (
  filePath: string,
  playerNames?: ReadonlySet<string>,
): Promise<ResultLogRecord> => {
  try {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    return await parseResultLogFromStream(stream, playerNames);
  } catch {
    const xml = await readFile(filePath, 'utf-8');
    return parseResultLogFromString(xml, playerNames);
  }
};

/**
 * A parser bound to a set of driver names, memoised so the log index keeps
 * hitting its cache — the index keys cached records by parser identity, so a
 * fresh closure per call would re-read every log.
 */
const parserCache = new Map<string, ResultLogParser>();

export const createResultLogParser = (
  playerNames: ReadonlySet<string>,
): ResultLogParser => {
  const signature = [...playerNames].sort().join('|');
  const cached = parserCache.get(signature);

  if (cached) {
    return cached;
  }

  const parser: ResultLogParser = (filePath) =>
    parseResultLog(filePath, playerNames);
  parserCache.set(signature, parser);

  return parser;
};
