import {
  LiveCaptureDriver,
  LiveCaptureIncident,
  LiveHeldDuration,
  LiveIncidentFrame,
  LivePressureBattle,
  StewardDecisionState,
} from '@types';
import { followingCarFrames, leadingCarFrames } from './liveTraceFixture';

/**
 * `FLAGGED` and `DEFERRED` are both "not decided yet" and are still different
 * things. `FLAGGED` means "park it, I'm coming back to this *during* the
 * session" — it must be empty by the chequered flag. `DEFERRED` means "this
 * needs the full replay, I'm deliberately not calling it live", which is a
 * finished piece of live work, not an outstanding one.
 *
 * The distinction is what lets an end-of-session unresolved-flags prompt mean
 * anything. Mirrors `StewardDecisionState` in types.ts, which has carried
 * `DEFERRED` since the schema was written.
 */
export type LiveIncidentState = 'NEW' | 'FLAGGED' | 'DEFERRED' | 'DECIDED';

export type LiveIncidentClassification =
  | 'contact'
  | 'track-limits'
  | 'blue-flag'
  | 'unsafe-rejoin'
  | 'loss-of-control';

/**
 * Fixed order for anything that lists classifications, so a chip row does not
 * reshuffle itself as a session turns up kinds it had not seen yet.
 */
export const LIVE_INCIDENT_CLASSIFICATIONS: LiveIncidentClassification[] = [
  'contact',
  'track-limits',
  'loss-of-control',
  'unsafe-rejoin',
  'blue-flag',
];

/** Shared so the queue, the overview and the filter bar cannot drift apart. */
export const liveClassificationLabel: Record<
  LiveIncidentClassification,
  string
> = {
  contact: 'Contact',
  'track-limits': 'Track Limits',
  'blue-flag': 'Blue Flag',
  'unsafe-rejoin': 'Unsafe Rejoin',
  'loss-of-control': 'Loss of Control',
};

export type LiveDecisionOutcome =
  | 'penalty-5s'
  | 'penalty-10s'
  | 'drive-through'
  | 'no-action'
  | 'note';

/**
 * A penalty is always against a driver; "no action" is a finding about the
 * incident as a whole and has no target. Treating them alike is what let the
 * first version record a penalty against a two-car incident with no indication
 * of who it was for — a call nobody could act on.
 */
const DRIVER_SCOPED_OUTCOMES = new Set<LiveDecisionOutcome>([
  'penalty-5s',
  'penalty-10s',
  'drive-through',
]);

export const isDriverScopedOutcome = (outcome: LiveDecisionOutcome): boolean =>
  DRIVER_SCOPED_OUTCOMES.has(outcome);

export type LiveSessionPhase = 'green' | 'red' | 'finished';

/**
 * `steamId` is the identity key, but it is not always a Steam ID: offline and
 * AI entries all report `0`, so the capture layer substitutes a slot-derived
 * key. Treat it as an opaque identity, never as something to show or send.
 *
 * `slotId` is what LMU's camera API addresses, and is the only thing that can
 * be used to focus a car.
 */
export interface LiveDriverRef {
  steamId: string;
  slotId?: number;
  displayName: string;
  carNumber: string;
  carClass: string;
  isAiDriver?: boolean;
}

export interface LiveIncidentCarEvidence {
  steamId: string;
  speedKph?: number;
  peakDecelMps2?: number;
  brakeApplied?: LiveHeldDuration;
  blueFlagShown?: LiveHeldDuration;
  peakYawRateDegPerSec?: number;
  offTrack?: boolean;
}

export interface LiveIncidentEvidence {
  closingSpeedKph?: number;
  aheadDriverSteamId?: string;
  isTrafficIncident?: boolean;
  /** LMU names no corners, so this is sector plus distance around the lap. */
  trackPositionLabel?: string;
  cars: LiveIncidentCarEvidence[];
}

/**
 * The captured window for one car. Held alongside the derived numbers rather
 * than instead of them: a brake trace only means something read together with
 * where the car was and how fast it was going.
 */
export interface LiveIncidentTrace {
  steamId: string;
  displayName: string;
  frames: LiveIncidentFrame[];
}

export interface LiveIncident {
  id: string;
  etSeconds: number;
  timestampLabel: string;
  lapLabel: string;
  classification: LiveIncidentClassification;
  contactMagnitude?: number;
  drivers: LiveDriverRef[];
  atFaultSteamId?: string;
  rawText: string;
  evidence: LiveIncidentEvidence;
  /**
   * Only ever set from fixtures. A live incident's window is fetched by the
   * dossier when it is opened rather than carried on the list — see
   * `hasTrace`.
   */
  traces?: LiveIncidentTrace[];
  /**
   * Whether a captured window exists for this incident, so the dossier knows
   * whether asking for one is worth a round trip. Most incidents have none:
   * only car-to-car contact gets a window.
   */
  hasTrace?: boolean;
  /** How precisely the contact instant could be located, in seconds. */
  anchorErrorSeconds?: number;
  state: LiveIncidentState;
  decision?: LiveDecisionOutcome;
  decisionReasoning?: string;
}

/**
 * The quick filters over the triage queue, held together so the whole set
 * travels as one value.
 *
 * `state` is deliberately not in here: it is the queue's own axis, rendered as
 * the counted buckets at the top of the list, and it reads against the set the
 * filters below have already narrowed ("of the contacts over 1000, how many are
 * still new").
 *
 * Everything is a scalar rather than a set. Multi-select reads well in a mockup
 * and badly at the point of use — a steward narrowing to one driver's contacts
 * wants exactly that, and a half-remembered second selection left checked is a
 * filter that lies.
 */
/**
 * A call already made in this session that involves a given driver.
 *
 * Flattened out of `StewardDecision` rather than passed whole: the dossier
 * needs four fields to draw a line of history, and handing a presentational
 * component the persistence record invites it to start reading the rest.
 *
 * `wasTarget` is the distinction that makes the list worth reading. A record
 * with a target is a call *against* this driver; one without is a finding about
 * an incident they happened to be in, and reading the second as the first would
 * make an innocent driver look like a repeat offender.
 */
export interface LivePriorCall {
  decisionId: string;
  /** Absent for an accumulation or conduct call, which cites no one incident. */
  incidentId?: string;
  lapLabel?: string;
  state: StewardDecisionState;
  outcome?: LiveDecisionOutcome;
  wasTarget: boolean;
  decidedAt: number;
}

export interface LiveIncidentFilters {
  classification: LiveIncidentClassification | 'ALL';
  /** A class code as `CarClassBadge` renders it, or `ALL`. */
  carClass: string;
  /** A party's identity key, or `ALL`. */
  driverSteamId: string;
  /** Contact-magnitude floor. `0` means no threshold at all. */
  minMagnitude: number;
}

export const DEFAULT_LIVE_INCIDENT_FILTERS: LiveIncidentFilters = {
  classification: 'ALL',
  carClass: 'ALL',
  driverSteamId: 'ALL',
  minMagnitude: 0,
};

/**
 * Thresholds rather than a slider. Magnitude is an LMU-internal number with no
 * unit and no ceiling, so a continuous control invites precision the figure
 * does not have; these are the bands the triage row already colours on.
 */
export const LIVE_MAGNITUDE_THRESHOLDS = [0, 500, 800, 2000];

export const matchesLiveIncidentFilters = (
  incident: LiveIncident,
  filters: LiveIncidentFilters,
): boolean => {
  if (
    filters.classification !== 'ALL' &&
    incident.classification !== filters.classification
  ) {
    return false;
  }
  if (
    filters.carClass !== 'ALL' &&
    !incident.drivers.some((driver) => driver.carClass === filters.carClass)
  ) {
    return false;
  }
  if (
    filters.driverSteamId !== 'ALL' &&
    !incident.drivers.some((driver) => driver.steamId === filters.driverSteamId)
  ) {
    return false;
  }
  /*
    An incident with no magnitude is not a quiet one — a track-limit element
    carries no magnitude at all. Asking for a threshold is asking for contact,
    so those drop out rather than being treated as zero-force contacts.
  */
  if (
    filters.minMagnitude > 0 &&
    (incident.contactMagnitude ?? 0) < filters.minMagnitude
  ) {
    return false;
  }
  return true;
};

export const hasActiveLiveIncidentFilters = (
  filters: LiveIncidentFilters,
): boolean =>
  filters.classification !== 'ALL' ||
  filters.carClass !== 'ALL' ||
  filters.driverSteamId !== 'ALL' ||
  filters.minMagnitude > 0;

export interface LiveIncidentFilterOptions {
  classifications: LiveIncidentClassification[];
  carClasses: string[];
  drivers: { steamId: string; label: string }[];
}

/**
 * What there is to filter by, derived from the incidents themselves.
 *
 * Built from the *unfiltered* list on purpose: options computed from the
 * filtered set empty themselves out as soon as one is picked, so the steward
 * cannot switch from one driver to another without clearing first.
 */
export const buildLiveIncidentFilterOptions = (
  incidents: LiveIncident[],
): LiveIncidentFilterOptions => {
  const classifications = new Set<LiveIncidentClassification>();
  const carClasses = new Set<string>();
  const drivers = new Map<string, string>();

  incidents.forEach((incident) => {
    classifications.add(incident.classification);
    incident.drivers.forEach((driver) => {
      if (driver.carClass) {
        carClasses.add(driver.carClass);
      }
      if (!drivers.has(driver.steamId)) {
        drivers.set(
          driver.steamId,
          `${driver.displayName} #${driver.carNumber}`,
        );
      }
    });
  });

  return {
    classifications: LIVE_INCIDENT_CLASSIFICATIONS.filter((entry) =>
      classifications.has(entry),
    ),
    carClasses: [...carClasses].sort(),
    drivers: [...drivers.entries()]
      .map(([steamId, label]) => ({ steamId, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
};

/**
 * S1, S2 and S3 as separate times, already de-cumulated.
 *
 * LMU reports sector 2 cumulatively (S1+S2), so nothing outside `splitSectors`
 * should ever see the raw pair. An entry is `undefined` when LMU has no time
 * for that sector — a lap not yet completed, or one whose sector was
 * invalidated — never zero.
 */
export type LiveSectorTimes = [
  number | undefined,
  number | undefined,
  number | undefined,
];

/**
 * What the STAT column shows. Derived from `inPits` and `inGarageStall`, which
 * are plain booleans, rather than from `mPitState` — that field turned out to
 * have an undocumented value 5 carried by 34 of 37 cars at a qualifying green,
 * so a lookup over the documented 0–4 would mislabel most of the field. The raw
 * number rides along on `pitState` for the tooltip.
 */
export type LivePitStatus = 'TRK' | 'PIT' | 'GAR';

export interface LiveStanding {
  steamId: string;
  slotId?: number;
  position: number;
  classPosition: number;
  displayName: string;
  carNumber: string;
  carClass: string;
  gapToLeader: string;
  /**
   * Gap to the car one place ahead. In a race this is LMU's own
   * `mTimeBehindNext`; outside one the classification is ranked by best lap and
   * that field is meaningless, so it is a best-lap delta instead. `—` when
   * there is nothing to compare.
   */
  interval: string;
  lastLap: string;
  /** The same time as a number, for the session-best/personal-best comparison. */
  lastLapSeconds?: number;
  lastSectors: LiveSectorTimes;
  bestLap: string;
  bestLapSeconds?: number;
  /**
   * The three sectors *of* that driver's best lap — deliberately not their best
   * sectors, which LMU only reports for S1 and as a cumulative S1+S2. Using one
   * consistent reference is what keeps the colour convention honest; conflating
   * the two is wrong by hundredths (28.708 vs 28.748 on one observed driver).
   */
  bestLapSectors: LiveSectorTimes;
  outstandingPenalties: number;
  /** Track-limit elements that actually added warning points. */
  trackLimitStrikes: number;
  /** LMU's own running warning-points total, when it has reported one. */
  trackLimitPoints?: number;
  incidentCount: number;
  inPits: boolean;
  pitStatus: LivePitStatus;
  /** Raw `mPitState`, shown only as detail. Undocumented values fall through. */
  pitState?: number;
  isAiDriver?: boolean;

  /**
   * Where the car is, in the same world metres as the track map geometry.
   *
   * Optional and absent means absent. The sidecar that reads `mPos` is a local
   * build artifact, so a machine that has not rebuilt it sends neither — and a
   * missing position is not the origin. A car without one is left off the map
   * rather than parked at the corner of the world.
   */
  posX?: number;
  posZ?: number;
}

export type { LivePressureBattle };

/**
 * No sector flags here on purpose. `mSectorFlag` is documented as local yellows
 * but reads a constant 11 in all three sectors through a green session, so
 * there is nothing to render. See the Tier 3 warning in
 * docs/live-mode-product-design.md.
 */
export interface LiveSessionState {
  trackName: string;
  sessionType: 'RACE' | 'QUALIFY' | 'PRACTICE';
  serverName: string;
  phase: LiveSessionPhase;
  timeRemainingSeconds: number;
  lapsCompleted: number;
  trackLimitStepsPerPenalty: number;
  connected: boolean;

  /*
    Session conditions for the header. Every one is optional and absent means
    absent: the sidecar that reads them is a local build artifact, so a machine
    that has not rebuilt it emits none of these and the header must show `—`
    rather than a plausible zero.

    Four captured fields are deliberately *not* carried up here, because there
    is nothing honest to draw with them yet — `cloudCoverage` and
    `trackGripLevel` are small integers on an unknown scale, `darkCloud` read a
    flat 0.000 through three sessions, and `yellowFlagState` has never been seen
    at anything but 0. They stay on `LiveSessionStatus` until a session says
    what they mean.
  */

  /** Current time of day, seconds since midnight. */
  timeOfDay?: number;
  ambientTempC?: number;
  trackTempC?: number;
  /** Rain severity, 0–1. */
  raining?: number;
  /** Average wetness on the racing line, 0–1. */
  avgPathWetness?: number;
}

const drivers: Record<string, LiveDriverRef> = {
  drake: {
    steamId: '76561198000000001',
    displayName: 'Bradley Drake',
    carNumber: '7',
    carClass: 'HY',
  },
  moreau: {
    steamId: '76561198000000002',
    displayName: 'Luc Moreau',
    carNumber: '51',
    carClass: 'HY',
  },
  vasquez: {
    steamId: '76561198000000003',
    displayName: 'Elena Vasquez',
    carNumber: '22',
    carClass: 'P2',
  },
  okonkwo: {
    steamId: '76561198000000004',
    displayName: 'Sam Okonkwo',
    carNumber: '34',
    carClass: 'P2',
  },
  lindqvist: {
    steamId: '76561198000000005',
    displayName: 'Nils Lindqvist',
    carNumber: '92',
    carClass: 'GT3',
  },
  ferrara: {
    steamId: '76561198000000006',
    displayName: 'Gia Ferrara',
    carNumber: '77',
    carClass: 'GT3',
  },
  bot: {
    steamId: '76561198000000007',
    displayName: 'Kenji Aoki',
    carNumber: '18',
    carClass: 'P2',
    isAiDriver: true,
  },
};

export const liveSessionFixture: LiveSessionState = {
  trackName: 'Bahrain International Circuit',
  sessionType: 'RACE',
  serverName: 'Endurance League — Round 4',
  phase: 'green',
  timeRemainingSeconds: 4359,
  lapsCompleted: 41,
  trackLimitStepsPerPenalty: 4,
  connected: true,
  // 14:42:05, matching the header ordering the mockups settle on.
  timeOfDay: 52925,
  ambientTempC: 24.5,
  trackTempC: 31.2,
  raining: 0,
  avgPathWetness: 0,
};

export const liveIncidentsFixture: LiveIncident[] = [
  {
    id: 'inc-0012',
    etSeconds: 2841.6,
    timestampLabel: '47:21',
    lapLabel: 'L41',
    classification: 'contact',
    contactMagnitude: 2003.53,
    drivers: [drivers.drake, drivers.lindqvist],
    atFaultSteamId: drivers.drake.steamId,
    rawText:
      'Bradley Drake(7) reported contact (2003.53) with Nils Lindqvist(92)',
    anchorErrorSeconds: 0.1,
    evidence: {
      closingSpeedKph: 28.4,
      aheadDriverSteamId: drivers.lindqvist.steamId,
      isTrafficIncident: true,
      trackPositionLabel: 'Sector 3 · 3,808 m (66% of lap)',
      cars: [
        {
          steamId: drivers.lindqvist.steamId,
          speedKph: 147.7,
          peakDecelMps2: 19.3,
          brakeApplied: { seconds: 2, truncated: true },
          blueFlagShown: { seconds: 8.2, truncated: true },
          peakYawRateDegPerSec: 38.8,
          offTrack: false,
        },
        {
          steamId: drivers.drake.steamId,
          speedKph: 164.8,
          peakDecelMps2: 23.8,
          brakeApplied: { seconds: 1.46, truncated: false },
          peakYawRateDegPerSec: 42.4,
          offTrack: false,
        },
      ],
    },
    traces: [
      {
        steamId: drivers.lindqvist.steamId,
        displayName: drivers.lindqvist.displayName,
        frames: leadingCarFrames,
      },
      {
        steamId: drivers.drake.steamId,
        displayName: drivers.drake.displayName,
        frames: followingCarFrames,
      },
    ],
    state: 'NEW',
  },
  {
    id: 'inc-0011',
    etSeconds: 2795.1,
    timestampLabel: '46:35',
    lapLabel: 'L41',
    classification: 'contact',
    contactMagnitude: 812.07,
    drivers: [drivers.vasquez, drivers.okonkwo],
    atFaultSteamId: drivers.okonkwo.steamId,
    rawText: 'Sam Okonkwo(34) reported contact (812.07) with Elena Vasquez(22)',
    evidence: {
      closingSpeedKph: 31.8,
      aheadDriverSteamId: drivers.vasquez.steamId,
      isTrafficIncident: false,
      trackPositionLabel: 'Sector 2 · 2,140 m (41% of lap)',
      cars: [
        { steamId: drivers.vasquez.steamId, speedKph: 178.2, offTrack: true },
        {
          steamId: drivers.okonkwo.steamId,
          speedKph: 191.4,
          brakeApplied: { seconds: 0.4, truncated: false },
          offTrack: false,
        },
      ],
    },
    state: 'NEW',
  },
  {
    id: 'inc-0010',
    etSeconds: 2703.4,
    timestampLabel: '45:03',
    lapLabel: 'L40',
    classification: 'loss-of-control',
    drivers: [drivers.ferrara],
    rawText: 'Gia Ferrara(77) spun',
    evidence: {
      trackPositionLabel: 'Sector 3 · 4,880 m (91% of lap)',
      cars: [
        {
          steamId: drivers.ferrara.steamId,
          speedKph: 96.4,
          peakYawRateDegPerSec: 214.6,
          offTrack: true,
        },
      ],
    },
    state: 'NEW',
  },
  {
    id: 'inc-0009',
    etSeconds: 2610.2,
    timestampLabel: '43:30',
    lapLabel: 'L40',
    classification: 'contact',
    contactMagnitude: 1544.9,
    drivers: [drivers.moreau, drivers.bot],
    atFaultSteamId: drivers.bot.steamId,
    rawText: 'Kenji Aoki(18) reported contact (1544.90) with Luc Moreau(51)',
    evidence: {
      closingSpeedKph: 48.1,
      aheadDriverSteamId: drivers.moreau.steamId,
      isTrafficIncident: true,
      trackPositionLabel: 'Sector 1 · 420 m (8% of lap)',
      cars: [
        { steamId: drivers.moreau.steamId, speedKph: 224.6, offTrack: false },
        { steamId: drivers.bot.steamId, speedKph: 238.1, offTrack: false },
      ],
    },
    // Parked for post-session review rather than flagged: a judgement call the
    // steward has decided not to make from the live feed.
    state: 'DEFERRED',
  },
  {
    id: 'inc-0008',
    etSeconds: 2455.8,
    timestampLabel: '40:55',
    lapLabel: 'L38',
    classification: 'track-limits',
    drivers: [drivers.lindqvist],
    rawText: 'Nils Lindqvist(92) exceeded track limits',
    evidence: {
      trackPositionLabel: 'Sector 1 · 1,180 m (22% of lap)',
      cars: [{ steamId: drivers.lindqvist.steamId, offTrack: true }],
    },
    state: 'FLAGGED',
  },
  {
    id: 'inc-0007',
    etSeconds: 2288.3,
    timestampLabel: '38:08',
    lapLabel: 'L36',
    classification: 'unsafe-rejoin',
    contactMagnitude: 3120.44,
    drivers: [drivers.okonkwo, drivers.ferrara],
    atFaultSteamId: drivers.okonkwo.steamId,
    rawText: 'Sam Okonkwo(34) reported contact (3120.44) with Gia Ferrara(77)',
    evidence: {
      closingSpeedKph: 88.7,
      aheadDriverSteamId: drivers.ferrara.steamId,
      isTrafficIncident: true,
      trackPositionLabel: 'Sector 2 · 2,960 m (56% of lap)',
      cars: [
        { steamId: drivers.ferrara.steamId, speedKph: 152.0, offTrack: false },
        {
          steamId: drivers.okonkwo.steamId,
          speedKph: 188.3,
          peakYawRateDegPerSec: 121.4,
          offTrack: true,
        },
      ],
    },
    state: 'DECIDED',
    decision: 'penalty-10s',
    decisionReasoning:
      'Rejoined across the racing line under yellow, heavy contact.',
  },
  {
    id: 'inc-0006',
    etSeconds: 2101.7,
    timestampLabel: '35:01',
    lapLabel: 'L33',
    classification: 'contact',
    contactMagnitude: 402.11,
    drivers: [drivers.drake, drivers.moreau],
    rawText: 'Bradley Drake(7) reported contact (402.11) with Luc Moreau(51)',
    evidence: {
      closingSpeedKph: 12.3,
      aheadDriverSteamId: drivers.moreau.steamId,
      isTrafficIncident: false,
      trackPositionLabel: 'Sector 1 · 420 m (8% of lap)',
      cars: [
        { steamId: drivers.moreau.steamId, speedKph: 231.7, offTrack: false },
        { steamId: drivers.drake.steamId, speedKph: 233.9, offTrack: false },
      ],
    },
    state: 'DECIDED',
    decision: 'no-action',
    decisionReasoning: 'Light side-by-side contact, both drivers left room.',
  },
];

/**
 * The layout fixture for the timing screen.
 *
 * The sector times are arithmetically consistent with the laps they belong to —
 * every `lastSectors` triple sums to `lastLapSeconds` and every
 * `bestLapSectors` triple to `bestLapSeconds` — because a timing screen whose
 * fixture does not add up cannot be checked by looking at it. Between them the
 * seven rows exercise every state of the colour convention: a session-best
 * sector, personal-best sectors, and rows with neither.
 *
 * The world positions are lifted off the racing line in `.erb/mocks/
 * trackMapMock.json`, which is the geometry dev mode serves on
 * `GET_LIVE_TRACK_MAP` — so the cars land *on* the drawn track rather than
 * scattered across its bounding box, and are spaced around a lap with the
 * leader furthest along. They are not Bahrain coordinates; the fixture session
 * says Bahrain and the mock map is whatever track was captured into it. That
 * mismatch is invisible on screen and irrelevant to what the fixture is for.
 */
export const liveStandingsFixture: LiveStanding[] = [
  {
    steamId: drivers.moreau.steamId,
    position: 1,
    classPosition: 1,
    displayName: drivers.moreau.displayName,
    carNumber: drivers.moreau.carNumber,
    carClass: drivers.moreau.carClass,
    gapToLeader: '—',
    interval: '—',
    lastLap: '1:45.812',
    lastLapSeconds: 105.812,
    lastSectors: [33.204, 40.118, 32.49],
    bestLap: '1:45.198',
    bestLapSeconds: 105.198,
    bestLapSectors: [33.01, 39.902, 32.286],
    outstandingPenalties: 0,
    trackLimitStrikes: 1,
    incidentCount: 2,
    inPits: false,
    pitStatus: 'TRK',
    posX: -148.8,
    posZ: -213.5,
  },
  {
    steamId: drivers.drake.steamId,
    position: 2,
    classPosition: 2,
    displayName: drivers.drake.displayName,
    carNumber: drivers.drake.carNumber,
    carClass: drivers.drake.carClass,
    gapToLeader: '+4.118',
    interval: '+4.118',
    lastLap: '1:45.206',
    lastLapSeconds: 105.206,
    // S1 matches the fastest first sector in the field: the magenta case.
    lastSectors: [32.884, 40.01, 32.312],
    bestLap: '1:44.876',
    bestLapSeconds: 104.876,
    bestLapSectors: [32.884, 39.744, 32.248],
    outstandingPenalties: 0,
    trackLimitStrikes: 2,
    incidentCount: 3,
    inPits: false,
    pitStatus: 'TRK',
    posX: 603.8,
    posZ: -95.7,
  },
  {
    steamId: drivers.vasquez.steamId,
    position: 3,
    classPosition: 1,
    displayName: drivers.vasquez.displayName,
    carNumber: drivers.vasquez.carNumber,
    carClass: drivers.vasquez.carClass,
    gapToLeader: '+1:12.443',
    interval: '+68.325',
    lastLap: '1:51.390',
    lastLapSeconds: 111.39,
    lastSectors: [35.402, 42.244, 33.744],
    bestLap: '1:51.264',
    bestLapSeconds: 111.264,
    bestLapSectors: [35.402, 42.118, 33.744],
    outstandingPenalties: 0,
    trackLimitStrikes: 0,
    incidentCount: 1,
    inPits: false,
    pitStatus: 'TRK',
    posX: 475.2,
    posZ: 667.5,
  },
  {
    steamId: drivers.okonkwo.steamId,
    position: 4,
    classPosition: 2,
    displayName: drivers.okonkwo.displayName,
    carNumber: drivers.okonkwo.carNumber,
    carClass: drivers.okonkwo.carClass,
    gapToLeader: '+1:19.008',
    interval: '+6.565',
    lastLap: '1:52.102',
    lastLapSeconds: 112.102,
    lastSectors: [35.7, 42.302, 34.1],
    bestLap: '1:51.892',
    bestLapSeconds: 111.892,
    bestLapSectors: [35.61, 42.302, 33.98],
    outstandingPenalties: 1,
    trackLimitStrikes: 3,
    incidentCount: 4,
    inPits: false,
    pitStatus: 'TRK',
    posX: -189.6,
    posZ: 597.5,
  },
  {
    steamId: drivers.bot.steamId,
    position: 5,
    classPosition: 3,
    displayName: drivers.bot.displayName,
    carNumber: drivers.bot.carNumber,
    carClass: drivers.bot.carClass,
    gapToLeader: '+1:44.660',
    interval: '+25.652',
    lastLap: '1:54.024',
    lastLapSeconds: 114.024,
    lastSectors: [36.402, 43.118, 34.504],
    bestLap: '1:52.546',
    bestLapSeconds: 112.546,
    bestLapSectors: [35.884, 42.56, 34.102],
    outstandingPenalties: 0,
    trackLimitStrikes: 0,
    incidentCount: 1,
    inPits: true,
    pitStatus: 'PIT',
    pitState: 3,
    isAiDriver: true,
    posX: -237.0,
    posZ: 269.5,
  },
  {
    steamId: drivers.lindqvist.steamId,
    position: 6,
    classPosition: 1,
    displayName: drivers.lindqvist.displayName,
    carNumber: drivers.lindqvist.carNumber,
    carClass: drivers.lindqvist.carClass,
    gapToLeader: '+2:31.902',
    interval: '+47.242',
    lastLap: '1:59.916',
    lastLapSeconds: 119.916,
    lastSectors: [38.204, 45.31, 36.402],
    bestLap: '1:59.616',
    bestLapSeconds: 119.616,
    bestLapSectors: [38.204, 45.01, 36.402],
    outstandingPenalties: 0,
    trackLimitStrikes: 3,
    incidentCount: 2,
    inPits: false,
    pitStatus: 'TRK',
    posX: 375.7,
    posZ: 365.0,
  },
  {
    steamId: drivers.ferrara.steamId,
    position: 7,
    classPosition: 2,
    displayName: drivers.ferrara.displayName,
    carNumber: drivers.ferrara.carNumber,
    carClass: drivers.ferrara.carClass,
    gapToLeader: '+2:48.115',
    interval: '+16.213',
    lastLap: '2:00.656',
    lastLapSeconds: 120.656,
    lastSectors: [38.61, 45.244, 36.802],
    bestLap: '2:00.214',
    bestLapSeconds: 120.214,
    bestLapSectors: [38.41, 45.244, 36.56],
    outstandingPenalties: 1,
    trackLimitStrikes: 1,
    incidentCount: 3,
    inPits: false,
    pitStatus: 'TRK',
    posX: -110.2,
    posZ: 5.2,
  },
];

export const livePressureFixture: LivePressureBattle[] = [
  {
    id: 'battle-1',
    aheadSteamId: drivers.ferrara.steamId,
    behindSteamId: drivers.vasquez.steamId,
    gapSeconds: 0.4,
    closingSpeedKph: 41.2,
    isTraffic: true,
  },
  {
    id: 'battle-2',
    aheadSteamId: drivers.moreau.steamId,
    behindSteamId: drivers.drake.steamId,
    gapSeconds: 1.1,
    closingSpeedKph: 6.8,
    isTraffic: false,
  },
  {
    id: 'battle-3',
    aheadSteamId: drivers.lindqvist.steamId,
    behindSteamId: drivers.okonkwo.steamId,
    gapSeconds: 0.9,
    closingSpeedKph: 27.5,
    isTraffic: true,
  },
];

export const findDriverBySteamId = (
  steamId: string | undefined,
): LiveDriverRef | undefined =>
  steamId
    ? Object.values(drivers).find((d) => d.steamId === steamId)
    : undefined;

/* -------------------------------------------------------------------------- */
/* Session-scale fixtures                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The seven-incident fixture above is a layout fixture: it exists so the
 * dossier and the queue can be iterated on without a running game. It says
 * nothing about how either behaves at the scale a real endurance race reaches
 * — a long multi-class race routinely passes 400 incidents, mostly track
 * limits, and that is where the live view was reported to crawl.
 *
 * These generators produce that scale deterministically, in both shapes:
 *
 * - `buildLiveCaptureFixture` is the *capture* shape, as `live-capture.ts`
 *   holds it and ships it over IPC — full context windows and all. It is what
 *   `buildIncidents` and the IPC payload cost have to be measured against.
 * - `buildLiveIncidentsFixture` is the *renderer* shape, as the triage queue
 *   and dossier consume it, for measuring the render path on its own.
 *
 * Deterministic on purpose: a performance guard that generates a different
 * workload each run measures nothing. No randomness, no `Date.now()`.
 */

/** Frames per car in a context window: an 8s window at the sidecar's ~30ms emit floor. */
const FRAMES_PER_CAR = 268;

/** How the mix falls out in practice — track limits dominate a real session. */
const TRACK_LIMIT_SHARE = 0.55;
const LOSS_OF_CONTROL_SHARE = 0.1;

const captureDriverNames = [
  'Bradley Drake',
  'Luc Moreau',
  'Elena Vasquez',
  'Sam Okonkwo',
  'Nils Lindqvist',
  'Gia Ferrara',
  'Kenji Aoki',
  'Marta Silva',
  'Tom Whitfield',
  'Ingrid Bauer',
];

const captureClasses = ['Hyper', 'LMP2', 'LMGT3'];

/**
 * A plausible braking-into-contact trace, generated rather than replayed.
 *
 * The real capture in `liveTraceFixture.ts` is 21 frames — trimmed for
 * readability in a source file. A live context window is an order of magnitude
 * longer, and the difference is the entire point of these fixtures: the cost
 * being measured is dominated by frame count.
 */
const buildFrames = (seed: number, frameCount: number): LiveIncidentFrame[] => {
  const frames: LiveIncidentFrame[] = [];
  for (let i = 0; i < frameCount; i += 1) {
    const t = -6 + i * (8 / frameCount);
    // Deterministic wobble, so no two frames are identical and nothing
    // downstream can accidentally dedupe them.
    const jitter = Math.sin((seed + i) * 0.37);
    const speed = 62 + jitter * 4 - Math.max(0, t) * 6;
    frames.push({
      t: Number(t.toFixed(3)),
      x: 560 + i * 2.1 + jitter,
      y: 9.3,
      z: -470 + i * 3.2,
      vx: speed * 0.57,
      vy: -0.1,
      vz: speed * 0.82,
      speed,
      yaw: jitter * 20,
      throttle: t < -1 ? 1 : 0,
      brake: t < -1 ? 0 : Math.min(1, Math.abs(jitter)),
      /*
        Small correction while the car is straight, winding on hard once it is
        into the braking zone. The ±0.2 wobble this used to carry was well below
        anything the captured sessions show — of the car traces that were
        actually moving, only 1% peak under 0.1 and the median uses 0.82 of the
        available 2.0 — so it drew a dev-mode steering band that looked broken
        against a full-scale axis. See docs/live-capture-investigation.md.
      */
      steering: Number(
        Math.max(
          -1,
          Math.min(1, jitter * (t < -1 ? 0.18 : 0.9) - Math.max(0, t) * 0.12),
        ).toFixed(3),
      ),
      lapDist: 3700 + i * 4.2,
      pathLateral: jitter * 3,
      trackEdge: 5 + jitter,
      flag: 0,
      sector: 0,
      lap: 2,
    });
  }
  return frames;
};

export const liveCaptureDriversFixture = (count = 24): LiveCaptureDriver[] =>
  Array.from({ length: count }, (_, index) => ({
    // Half the field on real Steam IDs, half unset — an offline or AI entry
    // reports "0", and the identity fallback has to survive at scale too.
    steamId: index % 2 === 0 ? `7656119800000${1000 + index}` : '0',
    driverName: captureDriverNames[index % captureDriverNames.length],
    vehicleName: `#${index + 1} Fixture Car`,
    vehicleClass: captureClasses[index % captureClasses.length],
    slotId: index + 1,
    place: index + 1,
    lapsCompleted: 41,
    lastLapTime: 95 + (index % 7),
    timeBehindLeader: index * 4.1,
    lapsBehindLeader: 0,
    penalties: index % 5 === 0 ? 1 : 0,
    inPits: index % 11 === 0,
    control: index % 3 === 0 ? 1 : 0,
    flag: 0,
    pitStops: 1,
    finishStatus: 0,
    /*
      The Step 3 fields, kept arithmetically true against the lap times above:
      sector 2 is cumulative, so S3 is whatever is left of the lap. A fixture
      whose sectors do not reconstruct the lap would let the classic
      timing-screen bug through the tests that exist to catch it.
    */
    lastSector1: 30.5,
    lastSector2: 73,
    bestLapTime: 95 + (index % 7) - 0.4,
    bestLapSector1: 30.4,
    bestLapSector2: 72.8,
    // 5 is the resting value LMU carries for a car sitting in the pit box, and
    // it is not in the SDK's documented 0-4 range.
    pitState: index % 11 === 0 ? 5 : 0,
    inGarageStall: false,
    timeBehindNext: index === 0 ? 0 : 4.1,
    lapsBehindNext: 0,
    qualification: index + 1,
    /*
      Spread around a circle in world metres, so a full field is spread across
      the map's bounds rather than piled on one point. Every fifth car carries
      no position at all: an un-rebuilt sidecar sends none for anyone, but a
      partially-populated field is the harder case and the one that has to leave
      those cars off the map rather than drawing them at the origin.
    */
    ...(index % 5 === 4
      ? {}
      : {
          posX: Number(
            (400 * Math.cos((index / count) * Math.PI * 2)).toFixed(1),
          ),
          posZ: Number(
            (400 * Math.sin((index / count) * Math.PI * 2)).toFixed(1),
          ),
        }),
  }));

interface LiveCaptureFixtureOptions {
  /** Incidents to generate. The reported problem starts around 400. */
  count?: number;
  driverCount?: number;
  /** Dial down to keep a test's memory footprint sane; leave alone to measure IPC cost. */
  framesPerCar?: number;
}

/**
 * A whole session's worth of capture-shape incidents, oldest first — the order
 * `live-capture.ts` accumulates them in.
 */
export const buildLiveCaptureFixture = ({
  count = 400,
  driverCount = 24,
  framesPerCar = FRAMES_PER_CAR,
}: LiveCaptureFixtureOptions = {}): {
  drivers: LiveCaptureDriver[];
  incidents: LiveCaptureIncident[];
} => {
  const captureDrivers = liveCaptureDriversFixture(driverCount);
  const trackLimitCutoff = Math.floor(count * TRACK_LIMIT_SHARE);
  const lossOfControlCutoff =
    trackLimitCutoff + Math.floor(count * LOSS_OF_CONTROL_SHARE);

  const incidents: LiveCaptureIncident[] = [];

  for (let index = 0; index < count; index += 1) {
    const seq = index + 1;
    const etSeconds = 120 + index * 8.5;
    const lap = 1 + Math.floor(index / 6);
    const first = captureDrivers[index % captureDrivers.length];
    const second =
      captureDrivers[(index * 7 + 3) % captureDrivers.length] === first
        ? captureDrivers[(index + 1) % captureDrivers.length]
        : captureDrivers[(index * 7 + 3) % captureDrivers.length];

    const shared = {
      id: `live-1-${seq}`,
      persistedId: `fixture-session#${String(seq).padStart(4, '0')}`,
      seq,
      etSeconds,
      lap,
    };

    if (index < trackLimitCutoff) {
      incidents.push({
        ...shared,
        kind: 'track-limits',
        raw: `${first.driverName} exceeded track limits`,
        parties: [{ slotId: first.slotId, displayName: first.driverName }],
        warningPoints: index % 4 === 0 ? 0 : 23.75,
        currentPoints: 23.75 * (1 + (index % 4)),
      });
      continue;
    }

    if (index < lossOfControlCutoff) {
      incidents.push({
        ...shared,
        kind: 'incident',
        objectStruck: 'Immovable',
        magnitude: 400 + (index % 30) * 90,
        raw: `${first.driverName} reported contact with Immovable`,
        parties: [{ slotId: first.slotId, displayName: first.driverName }],
      });
      continue;
    }

    // Contacts are the ones that carry a context window, and the context
    // window is where the weight is.
    incidents.push({
      ...shared,
      kind: 'incident',
      objectStruck: 'another vehicle',
      magnitude: 200 + (index % 40) * 95,
      raw: `${second.driverName}(${second.slotId}) reported contact with ${first.driverName}(${first.slotId})`,
      parties: [
        { slotId: first.slotId, displayName: first.driverName },
        { slotId: second.slotId, displayName: second.driverName },
      ],
      evidence: {
        closingSpeedKph: 12 + (index % 60),
        aheadSlotId: first.slotId,
        offTrackSlotIds: index % 5 === 0 ? [second.slotId] : [],
        isTrafficIncident: index % 3 === 0,
        trackPositionLabel: `Sector ${1 + (index % 3)} · ${1000 + index} m`,
        cars: [
          {
            slotId: first.slotId,
            speedKph: 150 + (index % 50),
            peakDecelMps2: 18 + (index % 8),
            offTrack: false,
          },
          {
            slotId: second.slotId,
            speedKph: 160 + (index % 50),
            peakDecelMps2: 20 + (index % 8),
            offTrack: index % 5 === 0,
          },
        ],
      },
      // Both the window and the two fields capture lifts off it, because both
      // shapes are real: main holds the window, the renderer sees only these.
      hasContext: true,
      anchorErrorSeconds: 0.02 * (index % 5),
      context: {
        seq,
        et: etSeconds,
        trackLength: 5412,
        anchorErrorSeconds: 0.02 * (index % 5),
        sectorFlags: [0, 0, 0],
        cars: [
          { slotId: first.slotId, frames: buildFrames(index, framesPerCar) },
          {
            slotId: second.slotId,
            frames: buildFrames(index + 500, framesPerCar),
          },
        ],
      },
    });
  }

  return { drivers: captureDrivers, incidents };
};

/**
 * The renderer shape, newest first, matching what `buildIncidents` produces.
 *
 * Every fifth incident carries a decision so the queue's state buckets and the
 * decision merge are both exercised at scale rather than on an all-`NEW` list —
 * including the deferred bucket, which is otherwise easy to leave untested at
 * the only scale where the filters matter.
 */
export const buildLiveIncidentsFixture = (count = 400): LiveIncident[] => {
  const roster = Object.values(drivers);
  const classifications: LiveIncidentClassification[] = [
    'track-limits',
    'contact',
    'loss-of-control',
  ];

  return Array.from({ length: count }, (_, index) => {
    const etSeconds = 120 + (count - index) * 8.5;
    const first = roster[index % roster.length];
    const second = roster[(index * 3 + 1) % roster.length];
    const classification =
      index < Math.floor(count * TRACK_LIMIT_SHARE)
        ? classifications[0]
        : classifications[1 + (index % 2)];
    const isContact = classification === 'contact';
    const state: LiveIncidentState =
      index % 5 === 0
        ? 'DECIDED'
        : index % 5 === 1
          ? 'FLAGGED'
          : index % 5 === 2
            ? 'DEFERRED'
            : 'NEW';

    return {
      id: `fixture-session#${String(count - index).padStart(4, '0')}`,
      etSeconds,
      timestampLabel: `${Math.floor(etSeconds / 60)}:${String(
        Math.floor(etSeconds % 60),
      ).padStart(2, '0')}`,
      lapLabel: `L${1 + Math.floor(index / 6)}`,
      classification,
      contactMagnitude: isContact ? 200 + (index % 40) * 95 : undefined,
      drivers: isContact && first !== second ? [first, second] : [first],
      atFaultSteamId: undefined,
      rawText: `${first.displayName} — fixture incident ${index + 1}`,
      anchorErrorSeconds: 0.02 * (index % 5),
      evidence: {
        closingSpeedKph: isContact ? 12 + (index % 60) : undefined,
        aheadDriverSteamId: isContact ? first.steamId : undefined,
        isTrafficIncident: index % 3 === 0,
        trackPositionLabel: `Sector ${1 + (index % 3)} · ${1000 + index} m`,
        cars: [],
      },
      state,
      decision: state === 'DECIDED' ? 'no-action' : undefined,
    };
  });
};
