import { LiveHeldDuration, LiveIncidentFrame } from '@types';
import { followingCarFrames, leadingCarFrames } from './liveTraceFixture';

export type LiveIncidentState = 'NEW' | 'FLAGGED' | 'DECIDED';

export type LiveIncidentClassification =
  | 'contact'
  | 'track-limits'
  | 'blue-flag'
  | 'unsafe-rejoin'
  | 'loss-of-control';

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
  traces?: LiveIncidentTrace[];
  /** How precisely the contact instant could be located, in seconds. */
  anchorErrorSeconds?: number;
  state: LiveIncidentState;
  decision?: LiveDecisionOutcome;
  decisionReasoning?: string;
}

export interface LiveStanding {
  steamId: string;
  slotId?: number;
  position: number;
  classPosition: number;
  displayName: string;
  carNumber: string;
  carClass: string;
  gapToLeader: string;
  lastLap: string;
  outstandingPenalties: number;
  /** Track-limit elements that actually added warning points. */
  trackLimitStrikes: number;
  /** LMU's own running warning-points total, when it has reported one. */
  trackLimitPoints?: number;
  incidentCount: number;
  inPits: boolean;
  isAiDriver?: boolean;
}

export interface LivePressureBattle {
  id: string;
  aheadSteamId: string;
  behindSteamId: string;
  gapSeconds: number;
  closingSpeedKph: number;
  isTraffic: boolean;
}

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
    state: 'FLAGGED',
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

export const liveStandingsFixture: LiveStanding[] = [
  {
    steamId: drivers.moreau.steamId,
    position: 1,
    classPosition: 1,
    displayName: drivers.moreau.displayName,
    carNumber: drivers.moreau.carNumber,
    carClass: drivers.moreau.carClass,
    gapToLeader: '—',
    lastLap: '1:45.812',
    outstandingPenalties: 0,
    trackLimitStrikes: 1,
    incidentCount: 2,
    inPits: false,
  },
  {
    steamId: drivers.drake.steamId,
    position: 2,
    classPosition: 2,
    displayName: drivers.drake.displayName,
    carNumber: drivers.drake.carNumber,
    carClass: drivers.drake.carClass,
    gapToLeader: '+4.118',
    lastLap: '1:45.994',
    outstandingPenalties: 0,
    trackLimitStrikes: 2,
    incidentCount: 3,
    inPits: false,
  },
  {
    steamId: drivers.vasquez.steamId,
    position: 3,
    classPosition: 1,
    displayName: drivers.vasquez.displayName,
    carNumber: drivers.vasquez.carNumber,
    carClass: drivers.vasquez.carClass,
    gapToLeader: '+1:12.443',
    lastLap: '1:51.207',
    outstandingPenalties: 0,
    trackLimitStrikes: 0,
    incidentCount: 1,
    inPits: false,
  },
  {
    steamId: drivers.okonkwo.steamId,
    position: 4,
    classPosition: 2,
    displayName: drivers.okonkwo.displayName,
    carNumber: drivers.okonkwo.carNumber,
    carClass: drivers.okonkwo.carClass,
    gapToLeader: '+1:19.008',
    lastLap: '1:51.884',
    outstandingPenalties: 1,
    trackLimitStrikes: 3,
    incidentCount: 4,
    inPits: false,
  },
  {
    steamId: drivers.bot.steamId,
    position: 5,
    classPosition: 3,
    displayName: drivers.bot.displayName,
    carNumber: drivers.bot.carNumber,
    carClass: drivers.bot.carClass,
    gapToLeader: '+1:44.660',
    lastLap: '1:52.331',
    outstandingPenalties: 0,
    trackLimitStrikes: 0,
    incidentCount: 1,
    inPits: true,
    isAiDriver: true,
  },
  {
    steamId: drivers.lindqvist.steamId,
    position: 6,
    classPosition: 1,
    displayName: drivers.lindqvist.displayName,
    carNumber: drivers.lindqvist.carNumber,
    carClass: drivers.lindqvist.carClass,
    gapToLeader: '+2:31.902',
    lastLap: '1:58.044',
    outstandingPenalties: 0,
    trackLimitStrikes: 3,
    incidentCount: 2,
    inPits: false,
  },
  {
    steamId: drivers.ferrara.steamId,
    position: 7,
    classPosition: 2,
    displayName: drivers.ferrara.displayName,
    carNumber: drivers.ferrara.carNumber,
    carClass: drivers.ferrara.carClass,
    gapToLeader: '+2:48.115',
    lastLap: '1:58.630',
    outstandingPenalties: 1,
    trackLimitStrikes: 1,
    incidentCount: 3,
    inPits: false,
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
