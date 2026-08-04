import { LiveIncidentRecord, LiveSessionRecord } from '@types';

const store = {
  sessions: {} as Record<string, unknown>,
  incidents: {} as Record<string, unknown>,
};
const deleteLiveSessionRecords = jest.fn();

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({
    get: (key: string) =>
      key === 'liveSessions' ? store.sessions : store.incidents,
    set: () => {},
  }),
  deleteLiveSessionRecords: (key: string) => deleteLiveSessionRecords(key),
}));

jest.mock('electron-log', () => ({ error: jest.fn(), info: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const {
  listLiveSessionSummaries,
  deleteLiveSession,
} = require('./live-session-store');

const session = (
  sessionKey: string,
  overrides: Partial<LiveSessionRecord> = {},
): LiveSessionRecord =>
  ({
    sessionKey,
    trackName: 'Laguna Seca',
    session: 1,
    sessionType: 'PRACTICE',
    startedAt: 1000,
    lastSeenAt: 2000,
    driverCount: 38,
    drivers: [],
    ...overrides,
  }) as LiveSessionRecord;

const incident = (
  id: string,
  sessionKey: string,
  hasContext: boolean,
): LiveIncidentRecord =>
  ({
    id,
    sessionKey,
    occurredAt: 0,
    hasContext,
    incident: { id, kind: 'incident', etSeconds: 1, raw: '', parties: [] },
  }) as unknown as LiveIncidentRecord;

beforeEach(() => {
  store.sessions = {};
  store.incidents = {};
  deleteLiveSessionRecords.mockReset();
});

describe('listLiveSessionSummaries', () => {
  it('counts incidents and evidence per session', () => {
    store.sessions = { a: session('a') };
    store.incidents = {
      i1: incident('i1', 'a', true),
      i2: incident('i2', 'a', false),
      i3: incident('i3', 'a', true),
    };

    const [summary] = listLiveSessionSummaries();

    expect(summary.incidentCount).toBe(3);
    expect(summary.evidenceCount).toBe(2);
  });

  it('does not attribute one session’s incidents to another', () => {
    store.sessions = { a: session('a'), b: session('b', { startedAt: 5000 }) };
    store.incidents = {
      i1: incident('i1', 'a', true),
      i2: incident('i2', 'b', false),
      i3: incident('i3', 'b', false),
    };

    const byKey = Object.fromEntries(
      listLiveSessionSummaries().map((s: { sessionKey: string }) => [
        s.sessionKey,
        s,
      ]),
    );

    expect(byKey.a.incidentCount).toBe(1);
    expect(byKey.b.incidentCount).toBe(2);
    expect(byKey.b.evidenceCount).toBe(0);
  });

  it('lists the newest session first', () => {
    store.sessions = {
      old: session('old', { startedAt: 1000 }),
      recent: session('recent', { startedAt: 9000 }),
    };

    expect(
      listLiveSessionSummaries().map(
        (s: { sessionKey: string }) => s.sessionKey,
      ),
    ).toEqual(['recent', 'old']);
  });

  it('reports a session that recorded nothing rather than hiding it', () => {
    store.sessions = { a: session('a') };

    const [summary] = listLiveSessionSummaries();

    expect(summary.incidentCount).toBe(0);
    expect(summary.evidenceCount).toBe(0);
  });

  it('falls back to the roster length when no driver count was stored', () => {
    store.sessions = {
      a: session('a', {
        driverCount: undefined,
        drivers: [{ slotId: 1 }, { slotId: 2 }],
      } as Partial<LiveSessionRecord>),
    };

    expect(listLiveSessionSummaries()[0].driverCount).toBe(2);
  });

  it('returns nothing when no session was ever captured', () => {
    expect(listLiveSessionSummaries()).toEqual([]);
  });
});

describe('deleteLiveSession', () => {
  it('delegates to the store and reports success', () => {
    expect(deleteLiveSession('a')).toBe(true);
    expect(deleteLiveSessionRecords).toHaveBeenCalledWith('a');
  });

  // Capture must survive a failed delete; the caller re-reads the list either way.
  it('reports failure instead of throwing', () => {
    deleteLiveSessionRecords.mockImplementation(() => {
      throw new Error('locked');
    });

    expect(deleteLiveSession('a')).toBe(false);
  });
});
