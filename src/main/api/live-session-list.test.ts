import { LiveIncidentRecord, LiveSessionRecord } from '@types';

const store = {
  sessions: {} as Record<string, unknown>,
  incidents: {} as Record<string, unknown>,
};
const deleteLiveSessionRecords = jest.fn();

const storeSet = jest.fn();

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({
    get: (key: string) =>
      key === 'liveSessions' ? store.sessions : store.incidents,
    set: (key: string, value: unknown) => storeSet(key, value),
  }),
  deleteLiveSessionRecords: (key: string) => deleteLiveSessionRecords(key),
}));

jest.mock('electron-log', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const {
  listLiveSessionSummaries,
  deleteLiveSession,
  dismissLiveSessionMatch,
  findLiveSessionForReplay,
  linkLiveSessionToReplay,
  listLiveIncidentTimesBySession,
  listLiveSessionSegments,
  persistLiveIncident,
  persistLiveIncidentContext,
  unlinkLiveSession,
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
  storeSet.mockReset();
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

describe('link state', () => {
  const link = {
    replayHash: 'hash-1',
    replayIdentityKey: 'identity-1',
    replayName: 'Sebring International Raceway R1 9',
    method: 'roster' as const,
    confidence: 0.9,
    linkedAt: 4000,
  };

  const written = () =>
    storeSet.mock.calls
      .filter(([key]: [string]) => key === 'liveSessions')
      .map(
        ([, value]: [string, Record<string, unknown>]) =>
          Object.values(value)[0],
      )
      .pop() as LiveSessionRecord;

  it('reports a session with neither link nor proposal as unlinked', () => {
    store.sessions = { a: session('a') };

    expect(listLiveSessionSummaries()[0].linkState).toBe('unlinked');
  });

  it('reports a confirmed link', () => {
    store.sessions = { a: session('a', { link }) };

    const [summary] = listLiveSessionSummaries();

    expect(summary.linkState).toBe('linked');
    expect(summary.link.replayName).toBe(link.replayName);
  });

  /*
    A proposal is a suggestion, never a link. The list has to say which it is,
    because confirming one is the only thing that puts a driver's name against
    an incident in an export.
  */
  it('reports a proposal as awaiting confirmation, not as linked', () => {
    store.sessions = {
      a: session('a', {
        proposal: { replayHash: 'hash-1', replayName: 'R1 9', confidence: 0.9 },
      } as Partial<LiveSessionRecord>),
    };

    expect(listLiveSessionSummaries()[0].linkState).toBe('proposed');
  });

  it('clears the proposal once the link is confirmed', () => {
    store.sessions = {
      a: session('a', {
        proposal: { replayHash: 'hash-1' },
      } as Partial<LiveSessionRecord>),
    };

    linkLiveSessionToReplay('a', link);

    expect(written().link).toEqual(link);
    expect(written().proposal).toBeUndefined();
  });

  /*
    Unlinking has to dismiss as well, or the next match pass immediately
    re-proposes the replay the user has just rejected.
  */
  it('dismisses further suggestions when a link is removed', () => {
    store.sessions = { a: session('a', { link }) };

    unlinkLiveSession('a');

    expect(written().link).toBeUndefined();
    expect(written().matchDismissedAt).toEqual(expect.any(Number));
  });

  it('records a dismissal without touching what was captured', () => {
    store.sessions = {
      a: session('a', {
        proposal: { replayHash: 'hash-1' },
      } as Partial<LiveSessionRecord>),
    };

    dismissLiveSessionMatch('a');

    expect(written().proposal).toBeUndefined();
    expect(written().matchDismissedAt).toEqual(expect.any(Number));
    expect(written().trackName).toBe('Laguna Seca');
  });

  it('finds the session behind a replay by hash', () => {
    store.sessions = { a: session('a', { link }) };

    expect(findLiveSessionForReplay('hash-1')?.sessionKey).toBe('a');
  });

  // The replay cache re-hashes; the archive store's fallback exists for the
  // same reason and a link must not quietly disappear either.
  it('finds the session by identity key when the hash has moved', () => {
    store.sessions = { a: session('a', { link }) };

    expect(
      findLiveSessionForReplay('other-hash', 'identity-1')?.sessionKey,
    ).toBe('a');
  });

  it('finds nothing for an unlinked replay', () => {
    store.sessions = { a: session('a') };

    expect(findLiveSessionForReplay('hash-1', 'identity-1')).toBeNull();
  });
});

describe('listLiveIncidentTimesBySession', () => {
  it('groups incident elapsed times by the session that captured them', () => {
    store.incidents = {
      i1: incident('i1', 'a', false),
      i2: incident('i2', 'b', false),
    };

    const times = listLiveIncidentTimesBySession();

    expect(times.get('a')).toEqual([1]);
    expect(times.get('b')).toEqual([1]);
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

/*
  Regression. Four incidents reached a real store with session_key = '',
  written before the first status line had established a session. They belong to
  no session, so they are invisible in the sessions list and cannot be deleted
  through the UI — permanent, unreachable clutter.
*/
describe('writes without a session', () => {
  it('drops an incident that has no session key', () => {
    persistLiveIncident({ id: '#abc', sessionKey: '', hasContext: false });

    expect(storeSet).not.toHaveBeenCalled();
  });

  it('drops an incident context that has no session key', () => {
    persistLiveIncidentContext({ incidentId: '#abc', sessionKey: '' });

    expect(storeSet).not.toHaveBeenCalled();
  });

  it('still writes once a session key exists', () => {
    persistLiveIncident({ id: '#abc', sessionKey: 'live|X|1|1000' });

    expect(storeSet).toHaveBeenCalledWith(
      'liveIncidents',
      expect.objectContaining({ '#abc': expect.anything() }),
    );
  });
});

describe('listLiveSessionSegments', () => {
  const MINUTE = 60_000;
  const NOW = 1_800_000_000_000;

  const at = (
    key: string,
    startedAt: number,
    lengthMinutes: number,
    trackName = 'Laguna Seca',
  ) =>
    session(key, {
      trackName,
      startedAt,
      lastSeenAt: startedAt + lengthMinutes * MINUTE,
    });

  beforeEach(() => {
    store.sessions = {
      p1: at('p1', NOW, 60),
      q1: at('q1', NOW + 70 * MINUTE, 15),
      race: at('race', NOW + 110 * MINUTE, 120),
      elsewhere: at('elsewhere', NOW + 115 * MINUTE, 60, 'Bahrain'),
    };
  });

  it('answers with the weekend around the session it was given', () => {
    const { anchorSessionKey, segments } = listLiveSessionSegments('race');

    expect(anchorSessionKey).toBe('race');
    expect(segments.map((s: { sessionKey: string }) => s.sessionKey)).toEqual([
      'p1',
      'q1',
      'race',
    ]);
  });

  /*
    The state between the game loading a session and capture writing its first
    row. Answering it with the newest record on disk would put another
    weekend's practice in front of the steward under a live heading.
  */
  it('answers empty for a running session that has not been persisted yet', () => {
    const { segments } = listLiveSessionSegments('not-written-yet');

    expect(segments).toEqual([]);
  });

  // With the game closed there is no anchor to be given, and the last thing
  // captured is the only sensible thing to open on.
  it('anchors on the most recent capture when no session was named', () => {
    const { anchorSessionKey } = listLiveSessionSegments();

    expect(anchorSessionKey).toBe('elsewhere');
  });

  it('answers empty when nothing has ever been captured', () => {
    store.sessions = {};

    expect(listLiveSessionSegments('race')).toEqual({
      anchorSessionKey: 'race',
      segments: [],
    });
  });
});
