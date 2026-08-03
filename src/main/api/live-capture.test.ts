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
});
