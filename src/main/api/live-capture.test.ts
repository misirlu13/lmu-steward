/**
 * @jest-environment node
 */

/*
 * Replays real sidecar output through the supervisor.
 *
 * Every line below was captured verbatim from the sidecar during a Daytona Road
 * Course session on 2026-08-02, so this covers the seam that unit tests either
 * side of it cannot: a context arriving seconds after its incident, matched
 * back by sequence number and turned into evidence.
 */
import { EventEmitter } from 'events';
import { LiveIncidentContextRecord, LiveSessionData } from '@types';
import { daytonaContactContext } from './live-incident-context.fixture';

interface FakeChild extends EventEmitter {
  stdout: EventEmitter & { setEncoding: jest.Mock };
  stderr: EventEmitter & { setEncoding: jest.Mock };
  kill: jest.Mock;
}

let spawned: FakeChild;

jest.mock('child_process', () => ({
  spawn: jest.fn(() => spawned),
}));

jest.mock('fs', () => ({ existsSync: () => true }));

jest.mock('electron', () => ({
  app: {
    getAppPath: () => 'C:/app',
    getPath: () => 'C:/app/lmu-steward.exe',
  },
}));

jest.mock('electron-log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const mockStoreSet = jest.fn();

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({ get: () => ({}), set: mockStoreSet }),
}));

/** Keys written to the persistent store during a test, in order. */
const writtenKeys = (): string[] =>
  mockStoreSet.mock.calls.map(([key]: [string]) => key);

const makeChild = (): FakeChild => {
  const child = new EventEmitter() as FakeChild;

  const stream = () => {
    const emitter = new EventEmitter() as EventEmitter & {
      setEncoding: jest.Mock;
    };
    emitter.setEncoding = jest.fn();
    return emitter;
  };

  child.stdout = stream();
  child.stderr = stream();
  child.kill = jest.fn();
  return child;
};

const STATUS = {
  type: 'status',
  state: 'live',
  trackName: 'Daytona International Speedway Road Course',
  sessionType: 'PRACTICE',
  driverCount: 54,
  timeRemainingSeconds: 9432,
  gamePhase: 5,
  trackLimitStepsPerPenalty: 40,
  trackLength: 5733.8,
  sectorFlags: [11, 11, 11],
  etClockDelta: -0.04,
  bufferedSeconds: 22.4,
};

const STANDINGS = {
  type: 'standings',
  drivers: [
    {
      slotId: 19,
      steamId: '0',
      driverName: 'Antares Au',
      vehicleName: 'Garage 59 2026 #10:WEC',
      vehicleClass: 'GT3',
      place: 32,
      lapsCompleted: 2,
      lastLapTime: 109.622,
      timeBehindLeader: 0,
      lapsBehindLeader: 1,
      penalties: 0,
      inPits: false,
      control: 1,
      flag: 0,
      pitStops: 0,
      finishStatus: 0,
    },
    {
      slotId: 44,
      steamId: '0',
      driverName: 'Lorenzo Fluxa',
      vehicleName: 'Algarve Pro Racing 2025 #25:LM',
      vehicleClass: 'LMP2',
      place: 18,
      lapsCompleted: 2,
      lastLapTime: 100.87,
      timeBehindLeader: 0,
      lapsBehindLeader: 1,
      penalties: 0,
      inPits: false,
      control: 1,
      flag: 0,
      pitStops: 0,
      finishStatus: 0,
    },
  ],
};

const STEWARD_EVENT = {
  type: 'steward_event',
  seq: 1,
  kind: 'incident',
  et: 575.9,
  mirror: false,
  raw: '<Incident et="575.9">Antares Au(19) reported contact (1025.66) with another vehicle Lorenzo Fluxa(44)</Incident>',
};

const CONTEXT = { type: 'incident_context', ...daytonaContactContext };

/** Mirrors RESTART_DELAY_MS in live-capture.ts. */
const RESTART_DELAY_MS = 5000;

type Capture = {
  startLiveCapture: () => void;
  stopLiveCapture: () => void;
  getLiveSessionData: () => LiveSessionData;
  getLiveIncidentContextInMemory: (
    incidentId: string,
  ) => LiveIncidentContextRecord | null;
};

let capture: Capture;

const feed = (...objects: unknown[]) => {
  objects.forEach((object) => {
    spawned.stdout.emit('data', `${JSON.stringify(object)}\n`);
  });
};

beforeEach(() => {
  jest.resetModules();
  mockStoreSet.mockClear();
  spawned = makeChild();
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  capture = require('./live-capture') as Capture;
  capture.startLiveCapture();
});

afterEach(() => {
  capture.stopLiveCapture();
});

describe('live capture supervision', () => {
  it('should report a live session from the sidecar status line', () => {
    feed(STATUS);

    const data = capture.getLiveSessionData();

    expect(data.status.state).toBe('live');
    expect(data.status.trackName).toBe(
      'Daytona International Speedway Road Course',
    );
    expect(data.trackLimitStepsPerPenalty).toBe(40);
  });

  it('should key the incident id on the sidecar sequence number', () => {
    feed(STATUS, STANDINGS, STEWARD_EVENT);

    const [incident] = capture.getLiveSessionData().incidents;

    expect(incident.seq).toBe(1);
    // Generation-qualified so a sidecar restart cannot reuse an id that a
    // steward decision is already keyed on.
    expect(incident.id).toBe('live-1-1');
  });

  it('should attach a context that arrives after its incident', () => {
    feed(STATUS, STANDINGS, STEWARD_EVENT);
    expect(capture.getLiveSessionData().incidents[0].hasContext).toBeFalsy();

    feed(CONTEXT);

    const [incident] = capture.getLiveSessionData().incidents;
    const held = capture.getLiveIncidentContextInMemory(
      incident.persistedId ?? incident.id,
    );

    expect(incident.hasContext).toBe(true);
    expect(held?.context.cars.map((car) => car.slotId)).toEqual([19, 44]);
    expect(incident.evidence?.aheadSlotId).toBe(19);
    expect(incident.evidence?.isTrafficIncident).toBe(true);
    expect(incident.evidence?.closingSpeedKph).toBeGreaterThan(0);
  });

  /*
    The reply goes out once a second. Carrying the windows made it roughly
    24 MB a tick at four hundred incidents — an order of magnitude more work
    than everything the renderer then does with the payload put together — to
    draw the one trace chart that is actually on screen.
  */
  it('should not ship the context window with the polled session data', () => {
    feed(STATUS, STANDINGS, STEWARD_EVENT, CONTEXT);

    const [incident] = capture.getLiveSessionData().incidents;

    expect(incident.context).toBeUndefined();
    expect(incident.hasContext).toBe(true);
    // The one number off the window the dossier still needs, lifted out so it
    // survives the strip.
    expect(incident.anchorErrorSeconds).toBeGreaterThanOrEqual(0);
  });

  it('should keep the window reachable for an incident that was never persisted', () => {
    feed(STATUS, STANDINGS, STEWARD_EVENT, CONTEXT);

    const [incident] = capture.getLiveSessionData().incidents;
    const held = capture.getLiveIncidentContextInMemory(
      incident.persistedId ?? incident.id,
    );

    expect(held?.context.cars).toHaveLength(2);
    expect(capture.getLiveIncidentContextInMemory('nothing-like-this')).toBe(
      null,
    );
  });

  it('should reassemble a line split across stdout chunks', () => {
    feed(STATUS, STANDINGS);

    const line = JSON.stringify(STEWARD_EVENT);
    spawned.stdout.emit('data', line.slice(0, 40));
    spawned.stdout.emit('data', `${line.slice(40)}\n`);

    expect(capture.getLiveSessionData().incidents).toHaveLength(1);
  });

  it('should ignore a context whose incident is no longer held', () => {
    feed(STATUS, STANDINGS, { ...CONTEXT, seq: 999 });

    expect(capture.getLiveSessionData().incidents).toHaveLength(0);
  });

  it('should drop the mirrored half of a collision', () => {
    feed(STATUS, STANDINGS, STEWARD_EVENT, {
      ...STEWARD_EVENT,
      seq: 0,
      mirror: true,
      et: 576.0,
      raw: '<Incident et="576.0">Lorenzo Fluxa(44) reported contact (812.31) with another vehicle Antares Au(19)</Incident>',
    });

    expect(capture.getLiveSessionData().incidents).toHaveLength(1);
  });

  it('should clear the queue when the session changes', () => {
    feed(STATUS, STANDINGS, STEWARD_EVENT);
    expect(capture.getLiveSessionData().incidents).toHaveLength(1);

    feed({ ...STATUS, trackName: 'Circuit de la Sarthe' });

    expect(capture.getLiveSessionData().incidents).toHaveLength(0);
  });

  it('should survive a malformed line without losing the stream', () => {
    feed(STATUS, STANDINGS);
    spawned.stdout.emit('data', '{not json at all}\n');
    feed(STEWARD_EVENT);

    expect(capture.getLiveSessionData().incidents).toHaveLength(1);
  });

  /*
    Regression. The reconstructed session start drifts — the sim clock and the
    wall clock diverge, and a pause stops one but not the other. Re-deriving the
    key every tick therefore eventually disagreed with itself and split a long
    session in two. A session in progress now keeps its key outright.
  */
  it('should keep one session while the session clock advances', () => {
    const live = { ...STATUS, session: 1, currentEt: 100 };

    feed(live, STANDINGS, STEWARD_EVENT);
    // Much later in the session, with the wall clock well past any bucket edge.
    feed({ ...live, currentEt: 900 }, { ...STEWARD_EVENT, seq: 2, et: 900 });

    expect(capture.getLiveSessionData().incidents).toHaveLength(2);
  });

  it('should start a new session when the session clock goes backwards', () => {
    const live = { ...STATUS, session: 1, currentEt: 900 };

    feed(live, STANDINGS, STEWARD_EVENT);
    expect(capture.getLiveSessionData().incidents).toHaveLength(1);

    // A restart puts the clock back to the beginning.
    feed({ ...live, currentEt: 2 });

    expect(capture.getLiveSessionData().incidents).toHaveLength(0);
  });

  /*
    Regression. The sidecar restarts its seq counter at 1 with every process,
    but the incident queue survives a restart within one session, so matching a
    context on the bare seq attached the new process's trace to the previous
    process's incident. Seen live: after one restart, every context landed on an
    incident that happened ~30s earlier, and the real ones showed none at all.
  */
  it('should not attach a context to an incident from an earlier sidecar generation', () => {
    jest.useFakeTimers();

    try {
      feed(STATUS, STANDINGS, STEWARD_EVENT);

      const previousChild = spawned;
      spawned = makeChild();
      previousChild.emit('exit');
      jest.advanceTimersByTime(RESTART_DELAY_MS + 1000);

      // Same session, so the queue is kept — and the new sidecar's seq is 1 again.
      feed(STATUS, STANDINGS, { ...STEWARD_EVENT, et: 800.1 });
      feed(CONTEXT);

      const { incidents } = capture.getLiveSessionData();
      const firstGeneration = incidents.find((i) => i.id === 'live-1-1');
      const secondGeneration = incidents.find((i) => i.id === 'live-2-1');

      expect(firstGeneration?.etSeconds).toBe(575.9);
      expect(secondGeneration?.etSeconds).toBe(800.1);
      expect(firstGeneration?.hasContext).toBeFalsy();
      expect(secondGeneration?.hasContext).toBe(true);
      expect(secondGeneration?.evidence).toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  });
});

/*
  The sidecar field expansion.

  Every field below is optional in both directions, and the two directions have
  different causes. An un-rebuilt sidecar — the committed binary is older than
  the app more often than not — emits none of them; LMU writes -1 for a time or
  a position it does not have yet. Both have to reach the renderer as absent,
  because a timing screen that shows 0.000 for a driver who has not completed a
  lap is stating a fact that is not true.

  `STATUS` and `STANDINGS` above deliberately stay at the pre-expansion shape,
  so every other test in this file doubles as the un-rebuilt-sidecar case.
*/
describe('expanded sidecar fields', () => {
  /** A status line from a rebuilt sidecar, mid-morning, dry. */
  const EXPANDED_STATUS = {
    ...STATUS,
    timeOfDay: 52925.4,
    startTimeOfDay: 50400,
    ambientTempC: 24.53,
    trackTempC: 31.87,
    raining: 0,
    darkCloud: 0.2,
    cloudCoverage: 40,
    trackGripLevel: 90,
    minPathWetness: 0,
    maxPathWetness: 0,
    avgPathWetness: 0,
    yellowFlagState: 0,
    serverName: 'Sunday League',
  };

  /** Two laps in: a last lap and a personal best, no qualifying time. */
  const EXPANDED_STANDINGS = {
    ...STANDINGS,
    drivers: [
      {
        ...STANDINGS.drivers[0],
        lastSector1: 32.104,
        lastSector2: 71.882,
        curSector1: 31.98,
        curSector2: -1,
        bestSector1: 31.98,
        bestSector2: 71.44,
        bestLapTime: 108.905,
        bestLapSector1: 32.104,
        bestLapSector2: 71.882,
        timeIntoLap: 44.2,
        estimatedLapTime: 109.4,
        pitState: 0,
        inGarageStall: false,
        timeBehindNext: 1.284,
        lapsBehindNext: 0,
        qualification: -1,
        posX: 412.6,
        posZ: -1180.3,
      },
      {
        ...STANDINGS.drivers[1],
        /*
          A driver who has not completed a lap. LMU is not consistent about the
          sentinel it writes — observed live, the last-lap sectors read 0 while
          the bests read -1, in the same row — so both appear here.
        */
        lastSector1: 0,
        lastSector2: 0,
        curSector1: -1,
        curSector2: -1,
        bestSector1: -1,
        bestSector2: -1,
        bestLapTime: -1,
        bestLapSector1: -1,
        bestLapSector2: -1,
        // Negative before the start, which is a real reading rather than a gap.
        timeIntoLap: -19.6,
        estimatedLapTime: 122.8,
        pitState: 3,
        inGarageStall: true,
        timeBehindNext: 0,
        lapsBehindNext: 0,
        qualification: 4,
        posX: 26.7,
        posZ: -213.4,
      },
    ],
  };

  it('should carry the session conditions off an expanded status line', () => {
    feed(EXPANDED_STATUS);

    const { status } = capture.getLiveSessionData();

    expect(status.timeOfDay).toBe(52925.4);
    expect(status.startTimeOfDay).toBe(50400);
    expect(status.ambientTempC).toBe(24.53);
    expect(status.trackTempC).toBe(31.87);
    expect(status.darkCloud).toBe(0.2);
    expect(status.cloudCoverage).toBe(40);
    expect(status.avgPathWetness).toBe(0);
    expect(status.yellowFlagState).toBe(0);
    expect(status.serverName).toBe('Sunday League');
  });

  it('should leave the conditions absent when the sidecar predates them', () => {
    feed(STATUS);

    const { status } = capture.getLiveSessionData();

    expect(status.state).toBe('live');
    expect(status.timeOfDay).toBeUndefined();
    expect(status.ambientTempC).toBeUndefined();
    expect(status.raining).toBeUndefined();
    expect(status.yellowFlagState).toBeUndefined();
    expect(status.serverName).toBeUndefined();
  });

  it('should drop LMU’s -1 yellow flag state rather than carry it', () => {
    feed({ ...EXPANDED_STATUS, yellowFlagState: -1 });

    expect(capture.getLiveSessionData().status.yellowFlagState).toBeUndefined();
  });

  /*
    Observed live: offline, LMU fills mServerName with the literal "-none-",
    which is what the REST sessionInfo payload documented in session.ts shows
    too. Carrying it through would put "Server: -none-" in a session header.
  */
  it('should treat LMU’s offline server placeholder as no server', () => {
    feed({ ...EXPANDED_STATUS, serverName: '-none-' });

    expect(capture.getLiveSessionData().status.serverName).toBeUndefined();
  });

  it('should drop a wetness reading outside the documented 0-1 range', () => {
    feed({ ...EXPANDED_STATUS, raining: -1, maxPathWetness: 0.35 });

    const { status } = capture.getLiveSessionData();

    expect(status.raining).toBeUndefined();
    expect(status.maxPathWetness).toBe(0.35);
  });

  it('should carry sectors, pit state, gaps and world position per driver', () => {
    feed(EXPANDED_STATUS, EXPANDED_STANDINGS);

    const [lead] = capture.getLiveSessionData().drivers;

    // Sector 2 stays cumulative, exactly as the SDK reports it — the timing
    // view differences it, so the raw value is what has to survive the trip.
    expect(lead.lastSector1).toBe(32.104);
    expect(lead.lastSector2).toBe(71.882);
    expect(lead.bestLapTime).toBe(108.905);
    expect(lead.timeBehindNext).toBe(1.284);
    expect(lead.posX).toBe(412.6);
    expect(lead.posZ).toBe(-1180.3);
  });

  it('should drop the sentinel times of a driver with no completed lap', () => {
    feed(EXPANDED_STATUS, EXPANDED_STANDINGS);

    const [, second] = capture.getLiveSessionData().drivers;

    expect(second.lastSector1).toBeUndefined();
    expect(second.bestLapTime).toBeUndefined();
    expect(second.bestLapSector2).toBeUndefined();
    // An invalidated current sector on a driver who has otherwise set times.
    expect(capture.getLiveSessionData().drivers[0].curSector2).toBeUndefined();
  });

  it('should keep the readings where zero and negative are real values', () => {
    feed(EXPANDED_STATUS, EXPANDED_STANDINGS);

    const [lead, second] = capture.getLiveSessionData().drivers;

    // 0 is "not pitting", not a missing pit state.
    expect(lead.pitState).toBe(0);
    expect(lead.inGarageStall).toBe(false);
    expect(second.pitState).toBe(3);
    // Before the start, progress into the lap is genuinely negative.
    expect(second.timeIntoLap).toBe(-19.6);
    // The leader's gap to the car ahead is a real zero, as timeBehindLeader is.
    expect(second.timeBehindNext).toBe(0);
  });

  it('should drop a qualifying position LMU has marked invalid', () => {
    feed(EXPANDED_STATUS, EXPANDED_STANDINGS);

    const [lead, second] = capture.getLiveSessionData().drivers;

    expect(lead.qualification).toBeUndefined();
    expect(second.qualification).toBe(4);
  });

  it('should leave the row untouched when the sidecar predates the fields', () => {
    feed(STATUS, STANDINGS);

    const [lead] = capture.getLiveSessionData().drivers;

    // Everything the row always carried still arrives...
    expect(lead.driverName).toBe('Antares Au');
    expect(lead.lastLapTime).toBe(109.622);
    expect(lead.place).toBe(32);
    // ...and nothing is invented to stand in for what it does not.
    expect(lead.lastSector1).toBeUndefined();
    expect(lead.pitState).toBeUndefined();
    expect(lead.inGarageStall).toBeUndefined();
    expect(lead.posX).toBeUndefined();
  });
});

/*
  Watching a replay populates shared memory exactly as driving does — same
  track, same field, a running session clock — so the supervisor recorded three
  captured sessions for replays that were merely being watched, two of them with
  no field at all. Observed in a real store on 2026-08-06.
*/
describe('replay playback', () => {
  /** The same standings LMU reports while a replay is playing. */
  const REPLAY_STANDINGS = {
    ...STANDINGS,
    drivers: STANDINGS.drivers.map((driver) => ({ ...driver, control: 3 })),
  };

  it('records nothing while a replay is being watched', () => {
    feed(STATUS, REPLAY_STANDINGS, STEWARD_EVENT, CONTEXT);

    expect(writtenKeys()).toEqual([]);
  });

  it('still shows a replay’s incidents on screen', () => {
    feed(STATUS, REPLAY_STANDINGS, STEWARD_EVENT);

    // Worth seeing live; just not worth keeping.
    expect(capture.getLiveSessionData().incidents).toHaveLength(1);
  });

  it('records a real session normally', () => {
    feed(STATUS, STANDINGS, STEWARD_EVENT, CONTEXT);

    expect(writtenKeys()).toContain('liveSessions');
    expect(writtenKeys()).toContain('liveIncidents');
    expect(writtenKeys()).toContain('liveIncidentContexts');
  });

  /*
    Shared memory is populated before the standings that say what the session
    is, so writing on the first status tick produced rows with no field at all —
    and no way to tell a session from the game merely being open.
  */
  it('waits for standings before writing a session row', () => {
    feed(STATUS);

    expect(writtenKeys()).toEqual([]);

    feed(STANDINGS);

    expect(writtenKeys()).toContain('liveSessions');
  });

  /*
    A mixed field is a real session. Only unanimity means replay, which is the
    conservative direction — a real session never contains a replay-controlled
    car, so this cannot produce a false positive.
  */
  it('treats a field that is not entirely replay-controlled as live', () => {
    feed(STATUS, {
      ...STANDINGS,
      drivers: [
        { ...STANDINGS.drivers[0], control: 3 },
        { ...STANDINGS.drivers[1], control: 0 },
      ],
    });

    expect(writtenKeys()).toContain('liveSessions');
  });
});
