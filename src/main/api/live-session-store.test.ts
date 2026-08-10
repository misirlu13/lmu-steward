import {
  LiveCaptureIncident,
  LiveIncidentContext,
  LiveSessionSummary,
} from '@types';
import {
  LIVE_SESSION_START_QUANTUM_MS,
  LiveSessionCandidate,
  buildLiveIncidentRecord,
  deriveLiveSessionKey,
  groupLiveSessionSegments,
  resolveLiveSessionKey,
  startedAtFromLiveSessionKey,
} from './live-session-store';

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({ get: () => ({}), set: () => {} }),
}));

const NOW = 1_800_000_000_000;

describe('deriveLiveSessionKey', () => {
  it('reconstructs the same start from any point in the session', () => {
    // The whole point: a sidecar attaching 10 minutes late must land on the key
    // the original process derived, not open a second session.
    const atStart = deriveLiveSessionKey('Daytona', 10, 0, NOW);
    const tenMinutesLater = deriveLiveSessionKey(
      'Daytona',
      10,
      600,
      NOW + 600_000,
    );

    expect(tenMinutesLater).toBe(atStart);
  });

  it('absorbs clock jitter smaller than the quantum', () => {
    const a = deriveLiveSessionKey('Daytona', 10, 100, NOW);
    const b = deriveLiveSessionKey('Daytona', 10, 100.2, NOW + 900);

    expect(b).toBe(a);
  });

  it('separates a restarted race from the original', () => {
    const first = deriveLiveSessionKey('Daytona', 10, 300, NOW);
    const restarted = deriveLiveSessionKey('Daytona', 10, 0, NOW + 300_000);

    expect(restarted).not.toBe(first);
  });

  it('separates sessions of different types at the same track', () => {
    expect(deriveLiveSessionKey('Daytona', 1, 0, NOW)).not.toBe(
      deriveLiveSessionKey('Daytona', 10, 0, NOW),
    );
  });

  it('keeps practice 1 distinct from practice 4', () => {
    expect(deriveLiveSessionKey('Daytona', 1, 0, NOW)).not.toBe(
      deriveLiveSessionKey('Daytona', 4, 0, NOW),
    );
  });

  it('round-trips the quantised start', () => {
    const key = deriveLiveSessionKey('Daytona', 10, 0, NOW);
    const startedAt = startedAtFromLiveSessionKey(key);

    expect(startedAt % LIVE_SESSION_START_QUANTUM_MS).toBe(0);
    expect(Math.abs(startedAt - NOW)).toBeLessThanOrEqual(
      LIVE_SESSION_START_QUANTUM_MS,
    );
  });

  it('tolerates a missing elapsed time rather than producing NaN', () => {
    const key = deriveLiveSessionKey('Daytona', 10, Number.NaN, NOW);

    expect(key).not.toContain('NaN');
    expect(startedAtFromLiveSessionKey(key)).toBeGreaterThan(0);
  });
});

describe('buildLiveIncidentRecord', () => {
  const context = {
    seq: 1,
    et: 12,
    trackLength: 5000,
    anchorErrorSeconds: 0,
    sectorFlags: [0, 0, 0],
    cars: [{ slotId: 1, frames: [{ t: 0 }] }],
  } as unknown as LiveIncidentContext;

  const incident = {
    id: 'live-1-1',
    kind: 'incident',
    etSeconds: 12,
    raw: 'Contact',
    parties: [],
    context,
    evidence: { offTrackSlotIds: [], cars: [] },
  } as unknown as LiveCaptureIncident;

  const key = deriveLiveSessionKey('Daytona', 10, 12, NOW);

  it('strips the context window but keeps the evidence', () => {
    const record = buildLiveIncidentRecord(key, incident);

    expect(record.incident.context).toBeUndefined();
    expect(record.incident.evidence).toBeDefined();
    expect(record.hasContext).toBe(true);
  });

  it('anchors the incident to wall clock via the session start', () => {
    const record = buildLiveIncidentRecord(key, incident);

    expect(record.occurredAt).toBe(startedAtFromLiveSessionKey(key) + 12_000);
  });

  /*
    Regression. The in-memory id is `live-{generation}-{seq}` and the generation
    counter restarts at 1 with every app launch, so persisting under it made two
    unrelated incidents in one session collide and silently overwrite each other.
  */
  it('does not key on the per-process incident id', () => {
    const record = buildLiveIncidentRecord(key, incident);

    expect(record.id).not.toBe(incident.id);
    expect(record.id.startsWith(key)).toBe(true);
  });

  it('gives the same incident the same id after an app restart', () => {
    const beforeRestart = buildLiveIncidentRecord(key, incident);
    // Same real incident, re-observed by a sidecar whose counters reset.
    const afterRestart = buildLiveIncidentRecord(key, {
      ...incident,
      id: 'live-1-1',
      seq: 1,
    });

    expect(afterRestart.id).toBe(beforeRestart.id);
  });

  it('gives two different incidents in one session different ids', () => {
    const a = buildLiveIncidentRecord(key, incident);
    const b = buildLiveIncidentRecord(key, {
      ...incident,
      id: 'live-1-1',
      etSeconds: 924.7,
      raw: 'Contact elsewhere',
    });

    expect(b.id).not.toBe(a.id);
  });

  it('reports no context when none arrived', () => {
    const record = buildLiveIncidentRecord(key, {
      ...incident,
      context: undefined,
    });

    expect(record.hasContext).toBe(false);
  });
});

describe('resolveLiveSessionKey', () => {
  const candidate = (
    startedAt: number,
    overrides: Partial<LiveSessionCandidate> = {},
  ): LiveSessionCandidate => ({
    sessionKey: `live|Daytona|10|${startedAt}`,
    trackName: 'Daytona',
    session: 10,
    startedAt,
    ...overrides,
  });

  /*
    The bug this exists for. Rounding does not absorb jitter at a bucket
    boundary, it relocates the discontinuity — so a start sitting near one
    flipped between adjacent buckets and split the session in two. Observed
    live as two Laguna Seca rows exactly one quantum apart, 316 incidents and 0.
  */
  it('rejoins a session whose start rounds into the neighbouring bucket', () => {
    const existing = candidate(1_800_000_030_000);
    // Derived start lands just past the midpoint, so it would round upward.
    const now = 1_800_000_046_000;

    expect(resolveLiveSessionKey('Daytona', 10, 0, [existing], now)).toBe(
      existing.sessionKey,
    );
  });

  it('does not split when the derived start drifts either side of a boundary', () => {
    const existing = candidate(1_800_000_030_000);

    const keys = [-14_000, -1, 0, 1, 14_000, 29_000].map((offset) =>
      resolveLiveSessionKey(
        'Daytona',
        10,
        0,
        [existing],
        existing.startedAt + offset,
      ),
    );

    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(existing.sessionKey);
  });

  it('mints a new key when nothing nearby matches', () => {
    const existing = candidate(1_800_000_030_000);
    const muchLater = existing.startedAt + 10 * 60_000;

    expect(
      resolveLiveSessionKey('Daytona', 10, 0, [existing], muchLater),
    ).not.toBe(existing.sessionKey);
  });

  it('does not rejoin a different track or session type', () => {
    const existing = candidate(1_800_000_030_000);
    const now = existing.startedAt;

    expect(
      resolveLiveSessionKey('Laguna Seca', 10, 0, [existing], now),
    ).not.toBe(existing.sessionKey);
    expect(resolveLiveSessionKey('Daytona', 1, 0, [existing], now)).not.toBe(
      existing.sessionKey,
    );
  });

  it('rejoins from any point in the session, not just its start', () => {
    const existing = candidate(1_800_000_030_000);
    // Ten minutes in: elapsed time cancels the later wall clock.
    const now = existing.startedAt + 600_000;

    expect(resolveLiveSessionKey('Daytona', 10, 600, [existing], now)).toBe(
      existing.sessionKey,
    );
  });

  it('picks the closest candidate when two are in range', () => {
    const near = candidate(1_800_000_030_000);
    const far = candidate(1_800_000_055_000);

    expect(
      resolveLiveSessionKey(
        'Daytona',
        10,
        0,
        [far, near],
        near.startedAt + 2000,
      ),
    ).toBe(near.sessionKey);
  });

  it('mints a key when there are no candidates at all', () => {
    const key = resolveLiveSessionKey('Daytona', 10, 0, [], 1_800_000_030_000);

    expect(key).toBe(deriveLiveSessionKey('Daytona', 10, 0, 1_800_000_030_000));
  });
});

describe('groupLiveSessionSegments', () => {
  const MINUTE = 60_000;

  const summary = (
    overrides: Partial<LiveSessionSummary> & { sessionKey: string },
  ): LiveSessionSummary =>
    ({
      trackName: 'Laguna Seca',
      sessionType: 'PRACTICE',
      session: 1,
      startedAt: NOW,
      lastSeenAt: NOW + 30 * MINUTE,
      driverCount: 38,
      incidentCount: 0,
      evidenceCount: 0,
      linkState: 'unlinked',
      ...overrides,
    }) as LiveSessionSummary;

  /** A practice → qualifying → race sitting, with the usual short breaks. */
  const weekend = () => [
    summary({
      sessionKey: 'p1',
      session: 1,
      startedAt: NOW,
      lastSeenAt: NOW + 60 * MINUTE,
    }),
    summary({
      sessionKey: 'q1',
      session: 5,
      sessionType: 'QUALIFY',
      startedAt: NOW + 70 * MINUTE,
      lastSeenAt: NOW + 85 * MINUTE,
    }),
    summary({
      sessionKey: 'r',
      session: 10,
      sessionType: 'RACE',
      startedAt: NOW + 110 * MINUTE,
      lastSeenAt: NOW + 230 * MINUTE,
    }),
  ];

  it('chains a practice, qualifying and race sitting into one weekend', () => {
    expect(
      groupLiveSessionSegments(weekend(), 'r').map((s) => s.sessionKey),
    ).toEqual(['p1', 'q1', 'r']);
  });

  it('answers the same group from any segment in it', () => {
    const sessions = weekend();

    expect(groupLiveSessionSegments(sessions, 'p1')).toEqual(
      groupLiveSessionSegments(sessions, 'r'),
    );
  });

  /*
    The span from practice to the race is longer than the gap threshold, so a
    "within N hours of the anchor" rule would drop the earliest segment. Chaining
    is what holds a long weekend together.
  */
  it('holds together a weekend longer than the gap threshold', () => {
    const sessions = weekend();

    expect(
      groupLiveSessionSegments(sessions, 'r').map((s) => s.sessionKey),
    ).toContain('p1');
  });

  /*
    The case the plan calls out: a league running the same track twice in a
    night must not merge. The separator is the dead time between them, not the
    track and not the session number.
  */
  it('starts a new group after a long break at the same track', () => {
    const sessions = [
      ...weekend(),
      summary({
        sessionKey: 'evening-p1',
        session: 1,
        startedAt: NOW + 230 * MINUTE + 120 * MINUTE,
        lastSeenAt: NOW + 400 * MINUTE,
      }),
    ];

    expect(
      groupLiveSessionSegments(sessions, 'r').map((s) => s.sessionKey),
    ).not.toContain('evening-p1');
    expect(
      groupLiveSessionSegments(sessions, 'evening-p1').map((s) => s.sessionKey),
    ).toEqual(['evening-p1']);
  });

  it('never groups two tracks together', () => {
    const sessions = [
      ...weekend(),
      summary({
        sessionKey: 'other-track',
        trackName: 'Bahrain',
        startedAt: NOW + 115 * MINUTE,
        lastSeenAt: NOW + 150 * MINUTE,
      }),
    ];

    expect(
      groupLiveSessionSegments(sessions, 'r').map((s) => s.sessionKey),
    ).not.toContain('other-track');
  });

  /*
    A restarted race is the same event. Breaking the group on a repeated session
    number would make a steward's practice incidents disappear from the picker
    the moment race control pressed restart.
  */
  it('keeps a restarted race in the weekend it restarted from', () => {
    const sessions = [
      ...weekend(),
      summary({
        sessionKey: 'r-restart',
        session: 10,
        sessionType: 'RACE',
        startedAt: NOW + 235 * MINUTE,
        lastSeenAt: NOW + 350 * MINUTE,
      }),
    ];

    expect(
      groupLiveSessionSegments(sessions, 'r-restart').map((s) => s.sessionKey),
    ).toEqual(['p1', 'q1', 'r', 'r-restart']);
  });

  it('returns nothing for an anchor that is not on disk yet', () => {
    expect(groupLiveSessionSegments(weekend(), 'not-persisted-yet')).toEqual(
      [],
    );
  });
});
