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
  formatTimeOfDay,
  splitSectors,
  summariseWeather,
  tallyByDriver,
  toCarClassCode,
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

describe('toCarClassCode', () => {
  it('should read the class LMU reports for the WEC content', () => {
    expect(toCarClassCode('Hyper')).toBe('HY');
    expect(toCarClassCode('LMP2')).toBe('P2');
    expect(toCarClassCode('LMGT3')).toBe('GT3');
  });

  /*
    The class name carries the series too. An ELMS grid reports `LMP2_ELMS`,
    which the exact lookup missed — a steward saw `LMP` in a grey badge, one row
    above the LMP3s correctly labelled `P3`. Confirmed live at Laguna Seca.
  */
  it('should read a class whose name carries its series', () => {
    expect(toCarClassCode('LMP2_ELMS')).toBe('P2');
    expect(toCarClassCode('LMP3_ELMS')).toBe('P3');
    expect(toCarClassCode('LMGT3_WEC')).toBe('GT3');
    expect(toCarClassCode('HYPERCAR_WEC')).toBe('HY');
  });

  /*
    The reason the truncating fallback cannot be trusted for anything it has not
    been told about: LMP2 and LMP3 both truncate to `LMP`, so two classes a
    steward has to tell apart would arrive under one code.
  */
  it('should never let two known classes collapse to one code', () => {
    expect(toCarClassCode('LMP2_ELMS')).not.toBe(toCarClassCode('LMP3_ELMS'));
  });

  it('should still show something for a class it has never seen', () => {
    expect(toCarClassCode('Formula E')).toBe('FOR');
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

  /*
    The sidecar that reads these is a local build artifact and is not committed,
    so a machine that has not rebuilt it emits none of them. That is the default
    state for any second machine, not an edge case — every one has to arrive as
    `undefined` rather than as a zero the header would render as a measurement.
  */
  it('should carry the session conditions through, and their absence with them', () => {
    const withConditions = buildSessionState(
      {
        ...live,
        status: {
          ...live.status,
          timeOfDay: 46044.4,
          ambientTempC: 24.5,
          trackTempC: 31.2,
          raining: 0,
          avgPathWetness: 0,
        },
      },
      liveSessionFixture,
    );

    expect(withConditions.timeOfDay).toBe(46044.4);
    expect(withConditions.ambientTempC).toBe(24.5);
    expect(withConditions.trackTempC).toBe(31.2);

    const withoutConditions = buildSessionState(live, liveSessionFixture);

    expect(withoutConditions.timeOfDay).toBeUndefined();
    expect(withoutConditions.ambientTempC).toBeUndefined();
    expect(withoutConditions.trackTempC).toBeUndefined();
    expect(withoutConditions.raining).toBeUndefined();
  });
});

describe('formatTimeOfDay', () => {
  // Verified live: mTimeOfDay = mStartET + mCurrentET, both seconds since
  // midnight — a session started at noon, 47 minutes in.
  it('should read seconds since midnight as a clock', () => {
    expect(formatTimeOfDay(46044.4)).toBe('12:47:24');
    expect(formatTimeOfDay(0)).toBe('00:00:00');
  });

  it('should have nothing to say when the sidecar sent nothing', () => {
    expect(formatTimeOfDay(undefined)).toBeUndefined();
  });
});

describe('summariseWeather', () => {
  it('should call a dry track dry, and a drying one damp', () => {
    expect(summariseWeather({ raining: 0, avgPathWetness: 0 })).toBe('Dry');
    expect(summariseWeather({ raining: 0, avgPathWetness: 0.3 })).toBe('Damp');
    expect(summariseWeather({ raining: 0.4, avgPathWetness: 0.6 })).toBe(
      'Rain',
    );
  });

  // Neither field present is a sidecar that cannot report weather, which is not
  // the same claim as "it is dry".
  it('should say nothing when neither field was reported', () => {
    expect(summariseWeather({})).toBeUndefined();
  });
});

/*
  The classic timing-screen bug is treating LMU's cumulative sector 2 as a
  sector time. Verified against a real race lap at Laguna Seca on 2026-08-07:
  S1 29.008, mLastSector2 60.249, mLastLapTime 77.233.
*/
describe('splitSectors', () => {
  it('should reconstruct the lap to the millisecond', () => {
    const [s1, s2, s3] = splitSectors(29.008, 60.249, 77.233);

    expect(s1).toBe(29.008);
    expect(s2).toBe(31.241);
    expect(s3).toBe(16.984);
    expect((s1 ?? 0) + (s2 ?? 0) + (s3 ?? 0)).toBeCloseTo(77.233, 3);
  });

  /*
    The "no time" sentinel is not consistent within a row: a driver with no
    completed lap carries mBestLapTime -1 and mLastSector1 0. A `!== -1` check
    lets the zeros through onto the screen as 0.000.
  */
  it('should treat both no-time sentinels as no time', () => {
    expect(splitSectors(0, 0, -1)).toEqual([undefined, undefined, undefined]);
    expect(splitSectors(29.008, 0, 0)).toEqual([29.008, undefined, undefined]);
  });

  // An invalidated sector leaves the pair inconsistent. A negative sector time
  // is not a measurement, so it is dropped rather than rendered.
  it('should drop a sector that would come out negative', () => {
    expect(splitSectors(40, 30, 90)).toEqual([40, undefined, 60]);
    expect(splitSectors(29.008, 60.249, 55)).toEqual([
      29.008,
      31.241,
      undefined,
    ]);
  });
});

describe('buildStandings timing', () => {
  const leader = driver({
    slotId: 1,
    place: 1,
    lastLapTime: 77.233,
    lastSector1: 29.008,
    lastSector2: 60.249,
    bestLapTime: 76.9,
    bestLapSector1: 28.9,
    bestLapSector2: 60.1,
    timeBehindLeader: 0,
    timeBehindNext: 0,
  });
  const second = driver({
    slotId: 2,
    place: 2,
    lastLapTime: 78.1,
    lastSector1: 29.4,
    lastSector2: 60.9,
    bestLapTime: 77.5,
    bestLapSector1: 29.2,
    bestLapSector2: 60.5,
    timeBehindLeader: 0.653,
    timeBehindNext: 0.653,
  });

  it('should split the last lap into three sectors that add up', () => {
    const [standing] = buildStandings([leader], [], 'RACE');

    expect(standing.lastSectors).toEqual([29.008, 31.241, 16.984]);
    expect(standing.lastLap).toBe('1:17.233');
    expect(standing.bestLap).toBe('1:16.900');
  });

  it('should take gap and interval from LMU in a race', () => {
    const standings = buildStandings([leader, second], [], 'RACE');

    expect(standings[0].gapToLeader).toBe('—');
    expect(standings[0].interval).toBe('—');
    expect(standings[1].gapToLeader).toBe('+0.653');
    expect(standings[1].interval).toBe('+0.653');
  });

  /*
    mTimeBehindNext and mTimeBehindLeader are meaningless outside a race:
    practice and qualifying rank by best lap, so the car one place higher is not
    the car ahead on track. Observed reading 0.0 for almost a whole practice
    field, with stray values including a negative -0.829. Neither may reach the
    screen, as a zero or as anything else.
  */
  it('should never read LMU’s gap fields outside a race', () => {
    const [, behind] = buildStandings(
      [
        { ...leader, timeBehindLeader: 40.993, timeBehindNext: 40.993 },
        { ...second, timeBehindLeader: -0.829, timeBehindNext: -0.829 },
      ],
      [],
      'PRACTICE',
    );

    // 77.5 - 76.9, the best-lap delta the field is actually ordered by.
    expect(behind.gapToLeader).toBe('+0.600');
    expect(behind.interval).toBe('+0.600');
  });

  it('should have no best-lap gap to offer when nobody has set a lap', () => {
    const [, behind] = buildStandings(
      [
        { ...leader, bestLapTime: -1 },
        { ...second, bestLapTime: -1 },
      ],
      [],
      'QUALIFY',
    );

    expect(behind.gapToLeader).toBe('—');
    expect(behind.interval).toBe('—');
  });

  it('should show no times at all for a driver who has not completed a lap', () => {
    const [standing] = buildStandings(
      [
        driver({
          slotId: 9,
          place: 1,
          lastLapTime: 0,
          lastSector1: 0,
          lastSector2: 0,
          bestLapTime: -1,
          bestLapSector1: -1,
          bestLapSector2: -1,
        }),
      ],
      [],
      'PRACTICE',
    );

    expect(standing.lastLap).toBe('—');
    expect(standing.bestLap).toBe('—');
    expect(standing.lastSectors).toEqual([undefined, undefined, undefined]);
    expect(standing.bestLapSectors).toEqual([undefined, undefined, undefined]);
    expect(standing.lastLapSeconds).toBeUndefined();
  });

  /*
    mPitState carries an undocumented 5 — the resting value on 34 of 37 cars at
    a qualifying green — so the status a steward reads comes from the two
    booleans, which mean what they say. The raw number rides along untouched.
  */
  it('should derive the pit status from the booleans and carry the raw state', () => {
    const [inPits] = buildStandings(
      [driver({ slotId: 1, inPits: true, pitState: 5 })],
      [],
      'RACE',
    );
    const [inGarage] = buildStandings(
      [driver({ slotId: 1, inPits: true, inGarageStall: true, pitState: 5 })],
      [],
      'RACE',
    );
    const [onTrack] = buildStandings(
      [driver({ slotId: 1, pitState: 0 })],
      [],
      'RACE',
    );

    expect(inPits.pitStatus).toBe('PIT');
    expect(inPits.pitState).toBe(5);
    expect(inGarage.pitStatus).toBe('GAR');
    expect(onTrack.pitStatus).toBe('TRK');
  });

  /*
    The track map places a car from these two and drops it when either is
    missing, so they have to survive the trip up untouched — and an absent one
    has to stay absent rather than becoming a zero, which is a real position at
    the corner of the world.
  */
  it('should carry world position through, and its absence with it', () => {
    const [positioned] = buildStandings(
      [driver({ slotId: 1, posX: 412.6, posZ: -1180.3 })],
      [],
      'RACE',
    );
    const [unpositioned] = buildStandings([driver({ slotId: 1 })], [], 'RACE');

    expect(positioned.posX).toBe(412.6);
    expect(positioned.posZ).toBe(-1180.3);
    expect(unpositioned.posX).toBeUndefined();
    expect(unpositioned.posZ).toBeUndefined();
  });
});
