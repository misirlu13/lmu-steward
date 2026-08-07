import { LiveSessionRecord } from '@types';

const store = { sessions: {} as Record<string, unknown> };
const deleteLiveSessionRecords = jest.fn();

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({
    get: () => store.sessions,
    set: jest.fn(),
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
  isRetentionEnabled,
  previewExpiredLiveSessions,
  retentionAnchor,
  sweepExpiredLiveSessions,
} = require('./live-retention');

const NOW = Date.parse('2026-08-06T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => NOW - days * DAY;

const session = (
  sessionKey: string,
  overrides: Partial<LiveSessionRecord> = {},
): LiveSessionRecord =>
  ({
    sessionKey,
    trackName: 'Laguna Seca',
    session: 1,
    sessionType: 'PRACTICE',
    startedAt: daysAgo(1),
    lastSeenAt: daysAgo(1),
    driverCount: 38,
    drivers: [],
    ...overrides,
  }) as LiveSessionRecord;

const link = (linkedAt: number) => ({
  replayHash: 'hash',
  replayIdentityKey: 'identity',
  replayName: 'Laguna Seca P1 7',
  method: 'roster' as const,
  confidence: 1,
  linkedAt,
});

beforeEach(() => {
  store.sessions = {};
  deleteLiveSessionRecords.mockReset();
});

describe('isRetentionEnabled', () => {
  // "Never delete" is a supported choice, not a missing setting.
  it('treats null as never expiring', () => {
    expect(isRetentionEnabled(null)).toBe(false);
    expect(isRetentionEnabled(undefined)).toBe(false);
    expect(isRetentionEnabled(0)).toBe(false);
    expect(isRetentionEnabled(30)).toBe(true);
  });
});

describe('retentionAnchor', () => {
  it('ages an unlinked session from when it was captured', () => {
    expect(retentionAnchor(session('a', { startedAt: daysAgo(40) }))).toBe(
      daysAgo(40),
    );
  });

  /*
    A session that gained a replay to be reviewed against has become more
    useful, not less. Expiring it on its original schedule would delete evidence
    at the moment it became worth keeping.
  */
  it('ages a linked session from when it was linked', () => {
    expect(
      retentionAnchor(
        session('a', { startedAt: daysAgo(60), link: link(daysAgo(2)) }),
      ),
    ).toBe(daysAgo(2));
  });

  // Linking is a one-time event, so it cannot extend a life indefinitely.
  it('never ages a session from earlier than its capture', () => {
    expect(
      retentionAnchor(
        session('a', { startedAt: daysAgo(5), link: link(daysAgo(90)) }),
      ),
    ).toBe(daysAgo(5));
  });
});

describe('sweepExpiredLiveSessions', () => {
  it('removes a session past the window', () => {
    store.sessions = { old: session('old', { startedAt: daysAgo(45) }) };

    expect(sweepExpiredLiveSessions(30, NOW)).toBe(1);
    expect(deleteLiveSessionRecords).toHaveBeenCalledWith('old');
  });

  it('keeps a session inside the window', () => {
    store.sessions = { recent: session('recent', { startedAt: daysAgo(10) }) };

    expect(sweepExpiredLiveSessions(30, NOW)).toBe(0);
    expect(deleteLiveSessionRecords).not.toHaveBeenCalled();
  });

  /*
    🛑 "Never" has to mean never. This is the setting standing between a user
    and the permanent loss of the only record of a race they did not keep a
    replay of.
  */
  it('deletes nothing at all when retention is never', () => {
    store.sessions = {
      ancient: session('ancient', { startedAt: daysAgo(999) }),
    };

    expect(sweepExpiredLiveSessions(null, NOW)).toBe(0);
    expect(sweepExpiredLiveSessions(undefined, NOW)).toBe(0);
    expect(deleteLiveSessionRecords).not.toHaveBeenCalled();
  });

  it('spares an old session that was linked recently', () => {
    store.sessions = {
      revived: session('revived', {
        startedAt: daysAgo(80),
        link: link(daysAgo(3)),
      }),
    };

    expect(sweepExpiredLiveSessions(30, NOW)).toBe(0);
    expect(deleteLiveSessionRecords).not.toHaveBeenCalled();
  });

  /*
    Link state is not a retention axis. An unlinked session may link later when
    a replay is imported from another machine, and the user who does not keep
    replays is exactly the one for whom the capture is the only record.
  */
  it('expires linked and unlinked sessions alike once both are old', () => {
    store.sessions = {
      unlinked: session('unlinked', { startedAt: daysAgo(45) }),
      linked: session('linked', {
        startedAt: daysAgo(50),
        link: link(daysAgo(45)),
      }),
    };

    expect(sweepExpiredLiveSessions(30, NOW)).toBe(2);
    expect(deleteLiveSessionRecords).toHaveBeenCalledWith('unlinked');
    expect(deleteLiveSessionRecords).toHaveBeenCalledWith('linked');
  });

  it('reports how many were actually removed when one fails', () => {
    store.sessions = {
      a: session('a', { startedAt: daysAgo(45) }),
      b: session('b', { startedAt: daysAgo(45) }),
    };
    deleteLiveSessionRecords.mockImplementation((key: string) => {
      if (key === 'a') {
        throw new Error('locked');
      }
    });

    expect(sweepExpiredLiveSessions(30, NOW)).toBe(1);
  });
});

describe('previewExpiredLiveSessions', () => {
  /*
    Shortening the window destroys data and a settings dropdown is not where a
    user expects that, so the confirmation names what will go rather than
    relying on a generic "cannot be undone".
  */
  it('summarises what would go without removing anything', () => {
    store.sessions = {
      a: session('a', { startedAt: daysAgo(60), trackName: 'Laguna Seca' }),
      b: session('b', { startedAt: daysAgo(45), trackName: 'Daytona' }),
      keep: session('keep', { startedAt: daysAgo(2) }),
    };

    const preview = previewExpiredLiveSessions(
      30,
      new Map([
        ['a', 316],
        ['b', 801],
        ['keep', 5],
      ]),
      NOW,
    );

    expect(preview.sessionCount).toBe(2);
    expect(preview.incidentCount).toBe(1117);
    expect(preview.oldestAt).toBe(daysAgo(60));
    expect(preview.newestAt).toBe(daysAgo(45));
    expect(preview.trackNames.sort()).toEqual(['Daytona', 'Laguna Seca']);
    expect(deleteLiveSessionRecords).not.toHaveBeenCalled();
  });

  it('reports nothing when the window removes nothing', () => {
    store.sessions = { keep: session('keep', { startedAt: daysAgo(2) }) };

    expect(previewExpiredLiveSessions(30, new Map(), NOW).sessionCount).toBe(0);
  });

  it('reports nothing when retention is never', () => {
    store.sessions = { old: session('old', { startedAt: daysAgo(999) }) };

    expect(previewExpiredLiveSessions(null, new Map(), NOW).sessionCount).toBe(
      0,
    );
  });

  // Listing one track once keeps the summary readable for a weekend of practice.
  it('lists each track once', () => {
    store.sessions = {
      a: session('a', { startedAt: daysAgo(45) }),
      b: session('b', { startedAt: daysAgo(46) }),
    };

    expect(previewExpiredLiveSessions(30, new Map(), NOW).trackNames).toEqual([
      'Laguna Seca',
    ]);
  });
});
