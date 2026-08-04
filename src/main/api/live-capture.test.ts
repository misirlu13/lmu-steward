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
import { LiveSessionData } from '@types';
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

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({ get: () => ({}), set: jest.fn() }),
}));

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
};

let capture: Capture;

const feed = (...objects: unknown[]) => {
  objects.forEach((object) => {
    spawned.stdout.emit('data', `${JSON.stringify(object)}\n`);
  });
};

beforeEach(() => {
  jest.resetModules();
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
    expect(capture.getLiveSessionData().incidents[0].context).toBeUndefined();

    feed(CONTEXT);

    const [incident] = capture.getLiveSessionData().incidents;

    expect(incident.context?.cars.map((car) => car.slotId)).toEqual([19, 44]);
    expect(incident.evidence?.aheadSlotId).toBe(19);
    expect(incident.evidence?.isTrafficIncident).toBe(true);
    expect(incident.evidence?.closingSpeedKph).toBeGreaterThan(0);
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
      expect(firstGeneration?.context).toBeUndefined();
      expect(secondGeneration?.context).toBeDefined();
      expect(secondGeneration?.evidence).toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
