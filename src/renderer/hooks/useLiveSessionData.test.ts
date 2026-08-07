import {
  LiveCaptureDriver,
  LiveCaptureIncident,
  LiveSessionData,
} from '@types';
import {
  buildLiveCaptureFixture,
  liveSessionFixture,
} from '../components/Live/liveFixtures';
import {
  buildIncidents,
  buildIncidentsCached,
  buildSessionState,
  buildStandings,
  createLiveIncidentCache,
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

describe('buildIncidents identity', () => {
  /*
    Steward decisions key on this id. `incident.id` carries the sidecar
    generation, so a mid-session sidecar restart renumbers every incident —
    which would move the steward's selection and detach every call already made
    from the incident it was made on. The persisted id is content-derived and
    survives both a restart and the app closing.
  */
  it('identifies an incident by its persisted id, not the volatile one', () => {
    const [built] = buildIncidents(
      [{ ...contact([1, 2]), id: 'live-3-17', persistedId: 'session#abc123' }],
      [driver({ slotId: 1 }), driver({ slotId: 2 })],
    );

    expect(built.id).toBe('session#abc123');
  });

  // Dev-mode fixtures and any incident seen before persistence still render.
  it('falls back to the volatile id when nothing was persisted', () => {
    const [built] = buildIncidents(
      [{ ...contact([1, 2]), id: 'live-3-17' }],
      [driver({ slotId: 1 }), driver({ slotId: 2 })],
    );

    expect(built.id).toBe('live-3-17');
  });
});

/*
  The poll hands the renderer a freshly deserialised array once a second. Left
  alone, every incident gets a new identity every second and nothing downstream
  — no React.memo, no useMemo — can skip any work: a session with 400 incidents
  re-rendered 400 rows a second, forever, and the view was reported crawling.

  Building is not the expensive part (measured under a millisecond at 400).
  Stable identity is, because of what it lets everything else skip.
*/
describe('buildIncidentsCached', () => {
  const { drivers, incidents } = buildLiveCaptureFixture({
    count: 400,
    framesPerCar: 4,
  });

  // What the next poll delivers: identical content, all new objects.
  const nextTick = () => incidents.map((incident) => ({ ...incident }));

  it('should hand back the very same array when nothing has changed', () => {
    const cache = createLiveIncidentCache();
    const first = buildIncidentsCached(nextTick(), drivers, cache);
    const second = buildIncidentsCached(nextTick(), drivers, cache);

    expect(second).toBe(first);
  });

  it('should rebuild only the incident whose context has just landed', () => {
    const cache = createLiveIncidentCache();
    const before = buildIncidentsCached(
      incidents.map((incident) => ({
        ...incident,
        hasContext: false,
        evidence: undefined,
      })),
      drivers,
      cache,
    );

    const withOneContext = nextTick();
    const arrived = withOneContext.findIndex((i) => i.hasContext);
    const after = buildIncidentsCached(
      withOneContext.map((incident, index) => ({
        ...incident,
        hasContext: index === arrived,
        evidence: index === arrived ? incident.evidence : undefined,
      })),
      drivers,
      cache,
    );

    const rebuilt = after.filter(
      (incident, index) => incident !== before[index],
    );

    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].hasTrace).toBe(true);
  });

  it('should rebuild everything when the roster itself changes', () => {
    const cache = createLiveIncidentCache();
    const before = buildIncidentsCached(nextTick(), drivers, cache);

    // A name the incident rows actually display, not a lap time.
    const renamed = drivers.map((entry, index) =>
      index === 0 ? { ...entry, vehicleName: '#99 Different Car' } : entry,
    );
    const after = buildIncidentsCached(nextTick(), renamed, cache);

    expect(after).not.toBe(before);
    expect(after.some((incident, index) => incident !== before[index])).toBe(
      true,
    );
  });

  // The cache is keyed by incident id; a session change empties the queue, and
  // holding those entries forever would leak for the life of the app.
  it('should not keep entries for incidents that have left the queue', () => {
    const cache = createLiveIncidentCache();
    buildIncidentsCached(nextTick(), drivers, cache);
    buildIncidentsCached(nextTick().slice(0, 5), drivers, cache);

    expect(cache.byId.size).toBe(5);
  });

  it('should agree with the uncached builder', () => {
    const cache = createLiveIncidentCache();

    expect(buildIncidentsCached(nextTick(), drivers, cache)).toEqual(
      buildIncidents(nextTick(), drivers),
    );
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
