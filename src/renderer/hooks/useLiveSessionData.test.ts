import {
  LiveCaptureDriver,
  LiveCaptureIncident,
  LiveSessionData,
} from '@types';
import { liveSessionFixture } from '../components/Live/liveFixtures';
import {
  buildSessionState,
  buildStandings,
  driverIdentity,
  tallyByDriver,
  toSessionPhase,
} from './useLiveSessionData';

const driver = (
  overrides: Partial<LiveCaptureDriver> & { slotId: number },
): LiveCaptureDriver => ({
  steamId: '0',
  driverName: `Driver ${overrides.slotId}`,
  vehicleName: `#${overrides.slotId} Car`,
  vehicleClass: 'Hyper',
  place: overrides.slotId,
  lapsCompleted: 3,
  lastLapTime: 95,
  timeBehindLeader: 0,
  lapsBehindLeader: 0,
  penalties: 0,
  inPits: false,
  control: 1,
  flag: 0,
  pitStops: 0,
  finishStatus: 0,
  ...overrides,
});

const contact = (slotIds: number[]): LiveCaptureIncident => ({
  id: `inc-${slotIds.join('-')}`,
  kind: 'incident',
  etSeconds: 100,
  raw: '',
  parties: slotIds.map((slotId) => ({
    slotId,
    displayName: `Driver ${slotId}`,
  })),
});

const trackLimit = (
  slotId: number,
  warningPoints: number,
  currentPoints: number,
): LiveCaptureIncident => ({
  id: `tl-${slotId}-${currentPoints}`,
  kind: 'track-limits',
  etSeconds: 100,
  raw: '',
  parties: [{ slotId, displayName: `Driver ${slotId}` }],
  warningPoints,
  currentPoints,
});

describe('driverIdentity', () => {
  // Every AI entry and every offline session reports steamId "0", so a
  // 54-car single-player field would otherwise share one identity.
  it('should fall back to the slot when there is no usable steam id', () => {
    expect(driverIdentity(driver({ slotId: 19 }))).toBe('slot-19');
    expect(driverIdentity(driver({ slotId: 19, steamId: '' }))).toBe('slot-19');
  });

  it('should keep a real steam id, which survives slot reuse', () => {
    expect(driverIdentity(driver({ slotId: 19, steamId: '7656119' }))).toBe(
      '7656119',
    );
  });

  it('should give every car in an offline field a distinct identity', () => {
    const standings = buildStandings([
      driver({ slotId: 1 }),
      driver({ slotId: 2 }),
      driver({ slotId: 3 }),
    ]);

    expect(new Set(standings.map((s) => s.steamId)).size).toBe(3);
  });
});

describe('tallyByDriver', () => {
  it('should count a collision against both parties', () => {
    const tallies = tallyByDriver([contact([19, 44])]);

    expect(tallies.get(19)?.incidents).toBe(1);
    expect(tallies.get(44)?.incidents).toBe(1);
  });

  it('should not count a track-limit element that added no warning points', () => {
    // LMU emits the same element with WarningPoints="0" to report
    // "No Further Action"; counting those inflates every driver's tally.
    const tallies = tallyByDriver([
      trackLimit(19, 23.75, 23.75),
      trackLimit(19, 0, 23.75),
    ]);

    expect(tallies.get(19)?.trackLimits).toBe(1);
  });

  it('should carry LMU’s own running points total', () => {
    const tallies = tallyByDriver([
      trackLimit(19, 23.75, 23.75),
      trackLimit(19, 10, 33.75),
    ]);

    expect(tallies.get(19)?.points).toBe(33.75);
  });

  it('should surface tallies on the standings the watchlist reads', () => {
    const [standing] = buildStandings(
      [driver({ slotId: 19 })],
      [contact([19, 44]), contact([19, 7]), trackLimit(19, 5, 5)],
    );

    expect(standing.incidentCount).toBe(2);
    expect(standing.trackLimitStrikes).toBe(1);
    expect(standing.trackLimitPoints).toBe(5);
  });
});

describe('toSessionPhase', () => {
  it('should map a stopped session to red and a finished one to finished', () => {
    expect(toSessionPhase(7)).toBe('red');
    expect(toSessionPhase(8)).toBe('finished');
  });

  it('should treat FCY as green, since LMU does not implement it', () => {
    expect(toSessionPhase(6)).toBe('green');
  });

  it('should default to green when the phase is unknown', () => {
    expect(toSessionPhase(undefined)).toBe('green');
  });
});

describe('buildSessionState', () => {
  const live: LiveSessionData = {
    status: {
      state: 'live',
      trackName: 'Daytona International Speedway Road Course',
      sessionType: 'PRACTICE',
      timeRemainingSeconds: 9174,
      gamePhase: 5,
    },
    drivers: [driver({ slotId: 1, lapsCompleted: 4 })],
    incidents: [],
    battles: [],
    trackLimitStepsPerPenalty: 40,
  };

  // A frozen fixture countdown was being presented as a live session clock,
  // because the builder spread the fixture and overrode only some keys.
  it('should take the countdown from the capture, not the fixture', () => {
    expect(
      buildSessionState(live, liveSessionFixture).timeRemainingSeconds,
    ).toBe(9174);
    expect(liveSessionFixture.timeRemainingSeconds).not.toBe(9174);
  });

  it('should take every field from the capture when a session is live', () => {
    const state = buildSessionState(live, liveSessionFixture);

    expect(state).toEqual({
      trackName: 'Daytona International Speedway Road Course',
      sessionType: 'PRACTICE',
      serverName: '',
      phase: 'green',
      timeRemainingSeconds: 9174,
      lapsCompleted: 4,
      trackLimitStepsPerPenalty: 40,
      connected: true,
    });
  });

  it('should fall back to the fixture only when nothing is live', () => {
    const state = buildSessionState(
      {
        status: { state: 'detached' },
        drivers: [],
        incidents: [],
        battles: [],
      },
      liveSessionFixture,
    );

    expect(state.trackName).toBe(liveSessionFixture.trackName);
    expect(state.connected).toBe(false);
  });
});
