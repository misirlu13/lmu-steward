import {
  LiveIncidentContextRecord,
  LiveIncidentRecord,
  LiveSessionRecord,
} from '@types';

const store = {
  sessions: {} as Record<string, unknown>,
  incidents: {} as Record<string, unknown>,
  contexts: {} as Record<string, unknown>,
};
const writes: Array<[string, Record<string, unknown>]> = [];

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({
    get: (key: string) => {
      if (key === 'liveSessions') return store.sessions;
      if (key === 'liveIncidents') return store.incidents;
      return store.contexts;
    },
    set: (key: string, value: Record<string, unknown>) => {
      writes.push([key, value]);
    },
  }),
  deleteLiveSessionRecords: jest.fn(),
}));

jest.mock('electron-log', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const {
  applyLiveExportPayload,
  buildLiveExportPayload,
  isLiveExportPayload,
} = require('./live-export');

const SESSION_KEY = 'live|Laguna Seca|1|1785798030000';

const session = (
  overrides: Partial<LiveSessionRecord> = {},
): LiveSessionRecord =>
  ({
    sessionKey: SESSION_KEY,
    trackName: 'Laguna Seca',
    session: 1,
    sessionType: 'PRACTICE',
    startedAt: 1785798030000,
    lastSeenAt: 1785798030000,
    driverCount: 38,
    drivers: [{ slotId: 1, driverName: 'A Driver' }],
    link: {
      replayHash: 'exporting-machine-hash',
      replayIdentityKey: 'exporting-identity',
      replayName: 'Laguna Seca P1 7',
      method: 'roster' as const,
      confidence: 1,
      linkedAt: 1786031059199,
    },
    ...overrides,
  }) as LiveSessionRecord;

const incident = (id: string): LiveIncidentRecord =>
  ({
    id,
    sessionKey: SESSION_KEY,
    occurredAt: 1785798030000,
    hasContext: true,
    incident: {
      id: 'live-1-1',
      kind: 'incident',
      etSeconds: 100,
      raw: '<Incident et="100">A(1) reported contact (5.0) with Immovable</Incident>',
      parties: [{ slotId: 1, displayName: 'A Driver' }],
      evidence: { offTrackSlotIds: [], cars: [] },
    },
  }) as unknown as LiveIncidentRecord;

const context = (incidentId: string): LiveIncidentContextRecord =>
  ({
    incidentId,
    sessionKey: SESSION_KEY,
    context: { seq: 1, et: 100, trackLength: 3600, cars: [] },
  }) as unknown as LiveIncidentContextRecord;

const REPLAY = {
  hash: 'importing-machine-hash',
  identityKey: 'importing-identity',
  replayName: 'Laguna Seca P1 7',
};

beforeEach(() => {
  store.sessions = { [SESSION_KEY]: session() };
  store.incidents = { 'i-1': incident('i-1'), 'i-2': incident('i-2') };
  store.contexts = { 'i-1': context('i-1') };
  writes.length = 0;
});

describe('buildLiveExportPayload', () => {
  it('carries the session and its incidents', () => {
    const payload = buildLiveExportPayload('exporting-machine-hash', false);

    expect(payload.session.sessionKey).toBe(SESSION_KEY);
    expect(payload.incidents).toHaveLength(2);
  });

  /*
    The link names a replay hash from the exporting machine, which means nothing
    on the receiving side. A stale hash would be a link pointing at nothing —
    worse than no link, because it looks like one.
  */
  it('strips the exporting machine’s link', () => {
    const payload = buildLiveExportPayload('exporting-machine-hash', false);

    expect(payload.session.link).toBeUndefined();
    expect(payload.session.proposal).toBeUndefined();
  });

  /*
    ⚠️ Traces are per-driver throttle, brake and steering inputs — telemetry a
    driver may not expect a third party to redistribute. They travel only when
    asked for; derived evidence always does.
  */
  it('leaves traces out unless they were asked for', () => {
    const payload = buildLiveExportPayload('exporting-machine-hash', false);

    expect(payload.contexts).toBeUndefined();
    expect(payload.includesTelemetry).toBe(false);
    expect(payload.incidents[0].incident.evidence).toBeDefined();
  });

  it('includes traces when they were asked for', () => {
    const payload = buildLiveExportPayload('exporting-machine-hash', true);

    expect(payload.contexts).toHaveLength(1);
    expect(payload.includesTelemetry).toBe(true);
  });

  // Opting in when nothing was recorded must not claim telemetry travelled.
  it('does not claim telemetry when the session recorded none', () => {
    store.contexts = {};

    expect(
      buildLiveExportPayload('exporting-machine-hash', true).includesTelemetry,
    ).toBe(false);
  });

  it('finds the session by identity key when the hash has moved', () => {
    expect(
      buildLiveExportPayload('some-other-hash', false, 'exporting-identity')
        ?.session.sessionKey,
    ).toBe(SESSION_KEY);
  });

  // Most replays have no capture, and that is not a failure.
  it('returns nothing for a replay with no captured session', () => {
    expect(buildLiveExportPayload('unrelated-hash', false)).toBeNull();
  });
});

describe('isLiveExportPayload', () => {
  it('refuses anything that is not one of ours', () => {
    expect(isLiveExportPayload(null)).toBe(false);
    expect(isLiveExportPayload({})).toBe(false);
    expect(isLiveExportPayload({ version: 1, session: {} })).toBe(false);
    expect(
      isLiveExportPayload({
        version: 1,
        session: { sessionKey: 'k' },
        incidents: [],
      }),
    ).toBe(true);
  });
});

describe('applyLiveExportPayload', () => {
  const payloadFor = (includeTelemetry: boolean) =>
    buildLiveExportPayload('exporting-machine-hash', includeTelemetry);

  it('links the imported session to the replay it arrived with', () => {
    const payload = payloadFor(false);
    store.sessions = {};

    applyLiveExportPayload(payload, REPLAY, 1786100000000);

    const [, written] = writes.find(([key]) => key === 'liveSessions') ?? [];
    const saved = Object.values(written ?? {})[0] as LiveSessionRecord;

    expect(saved.link?.replayHash).toBe('importing-machine-hash');
    expect(saved.link?.replayIdentityKey).toBe('importing-identity');
    expect(saved.link?.linkedAt).toBe(1786100000000);
  });

  /*
    Recorded as manual: nothing was scored against a roster here. The exporting
    steward asserted the pairing, and inventing a confidence on this side would
    misrepresent where that assertion came from.
  */
  it('records the link as manual with no confidence', () => {
    const payload = payloadFor(false);
    store.sessions = {};

    applyLiveExportPayload(payload, REPLAY);

    const [, written] = writes.find(([key]) => key === 'liveSessions') ?? [];
    const saved = Object.values(written ?? {})[0] as LiveSessionRecord;

    expect(saved.link?.method).toBe('manual');
    expect(saved.link?.confidence).toBeNull();
  });

  it('writes the incidents and any traces that came with it', () => {
    const payload = payloadFor(true);
    store.sessions = {};

    const applied = applyLiveExportPayload(payload, REPLAY);

    expect(applied.incidentCount).toBe(2);
    expect(applied.traceCount).toBe(1);
    expect(writes.filter(([key]) => key === 'liveIncidents')).toHaveLength(2);
    expect(
      writes.filter(([key]) => key === 'liveIncidentContexts'),
    ).toHaveLength(1);
  });

  /*
    🛑 Re-importing the same hand-off must not resurrect evidence the user has
    since deleted, nor overwrite a link they corrected by hand.
  */
  it('leaves a session that is already here alone', () => {
    const payload = payloadFor(true);

    expect(applyLiveExportPayload(payload, REPLAY)).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it('refuses a payload that is not one of ours', () => {
    expect(applyLiveExportPayload({ nonsense: true }, REPLAY)).toBeNull();
    expect(writes).toHaveLength(0);
  });
});
