import { LiveSessionRecord } from '@types';
import {
  filterReplayTargets,
  LIVE_MATCH_WINDOW_MS,
  liveSessionRoster,
  matchLiveSession,
  scoreIncidentAgreement,
  sessionTypeForRawSession,
} from './live-replay-match';
import { LogCandidate } from './replay-import-match';
import { ReplayMatchTarget } from './replay';

jest.mock('electron-log', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('./replay', () => ({ listReplayMatchTargets: () => [] }));
jest.mock('./live-session-store', () => ({
  readLiveSessions: () => ({}),
  setLiveSessionProposal: jest.fn(),
}));

const START = Date.parse('2026-08-01T18:00:00Z');

const GRID = [
  'Massimo Amodio',
  'Max van Wageningen',
  'Albert Jemielity',
  'Haque Gerry',
  'Francesco Truscelli',
  'Tadeas Lycka',
];

const session = (
  overrides: Partial<LiveSessionRecord> = {},
): LiveSessionRecord =>
  ({
    sessionKey: 'live|Sebring International Raceway|10|1',
    trackName: 'Sebring International Raceway',
    session: 10,
    sessionType: 'RACE',
    startedAt: START,
    lastSeenAt: START,
    driverCount: GRID.length,
    drivers: GRID.map((driverName, slotId) => ({ slotId, driverName })),
    ...overrides,
  }) as LiveSessionRecord;

const target = (
  hash: string,
  overrides: Partial<ReplayMatchTarget> = {},
): ReplayMatchTarget => ({
  hash,
  identityKey: `identity-${hash}`,
  replayName: `Sebring International Raceway R1 ${hash}`,
  sceneDesc: 'SEBRINGWEC',
  sessionType: 'RACE',
  timestamp: START / 1000,
  logPath: `C:/logs/${hash}.xml`,
  imported: false,
  ...overrides,
});

const logFor = (
  driverNames: string[],
  incidentTimes: number[] = [],
): LogCandidate => ({
  fileName: 'log.xml',
  filePath: 'C:/logs/log.xml',
  session: 'RACE',
  eventDateTime: START / 1000,
  trackVenue: 'Sebring International Raceway',
  trackCourse: 'Sebring International Raceway',
  trackEvent: 'Sebring',
  driverNames,
  incidentTimes,
});

const matchWith = (
  logs: Record<string, LogCandidate | null>,
  targets: ReplayMatchTarget[],
  overrides: {
    session?: LiveSessionRecord;
    liveIncidentTimes?: number[];
  } = {},
) =>
  matchLiveSession({
    session: overrides.session ?? session(),
    targets,
    liveIncidentTimes: overrides.liveIncidentTimes ?? [],
    readLog: async (filePath) => logs[filePath] ?? null,
  });

describe('sessionTypeForRawSession', () => {
  it('maps LMU’s raw session enum onto the replay session types', () => {
    expect(sessionTypeForRawSession(0)).toBe('PRACTICE');
    expect(sessionTypeForRawSession(4)).toBe('PRACTICE');
    expect(sessionTypeForRawSession(5)).toBe('QUALIFY');
    expect(sessionTypeForRawSession(8)).toBe('QUALIFY');
    expect(sessionTypeForRawSession(11)).toBe('RACE');
  });

  // Warmup has no replay session type of its own, and dropping it would leave
  // the session unmatchable rather than merely imprecise.
  it('reads warmup as practice', () => {
    expect(sessionTypeForRawSession(9)).toBe('PRACTICE');
  });
});

describe('liveSessionRoster', () => {
  /*
    Shared memory carries the multiplayer discriminator and the log's
    <Driver><Name> does not, so leaving it on would drop the overlap to zero for
    exactly the sessions that matter most — league races.
  */
  it('strips the multiplayer discriminator from driver names', () => {
    expect(
      liveSessionRoster(
        session({
          drivers: [{ slotId: 0, driverName: 'Carlos David#6607' }],
        } as Partial<LiveSessionRecord> as LiveSessionRecord),
      ),
    ).toEqual(['Carlos David']);
  });
});

describe('filterReplayTargets', () => {
  it('keeps a replay of the same track and session type', () => {
    expect(filterReplayTargets(session(), [target('a')])).toHaveLength(1);
  });

  it('drops a replay of a different session type', () => {
    expect(
      filterReplayTargets(session(), [target('a', { sessionType: 'QUALIFY' })]),
    ).toHaveLength(0);
  });

  it('drops a replay from another track', () => {
    expect(
      filterReplayTargets(session(), [
        target('a', {
          sceneDesc: 'MONZAWEC',
          replayName: 'Autodromo Nazionale Monza R1 2',
        }),
      ]),
    ).toHaveLength(0);
  });

  it('drops a replay from another weekend entirely', () => {
    expect(
      filterReplayTargets(session(), [
        target('a', {
          timestamp: (START + LIVE_MATCH_WINDOW_MS + 60_000) / 1000,
        }),
      ]),
    ).toHaveLength(0);
  });

  // A replay with no log has no roster, so there is nothing to score it on.
  it('drops a replay with no result log', () => {
    expect(
      filterReplayTargets(session(), [target('a', { logPath: null })]),
    ).toHaveLength(0);
  });
});

describe('scoreIncidentAgreement', () => {
  it('reports the share of live incidents the log also holds', () => {
    expect(scoreIncidentAgreement([10, 20, 30], [10.4, 20, 99])).toBeCloseTo(
      2 / 3,
    );
  });

  /*
    A clean session has nothing to compare, and reporting 0 would read as
    disagreement — which is why this signal can only ever confirm.
  */
  it('reports nothing rather than zero when either side recorded none', () => {
    expect(scoreIncidentAgreement([], [10])).toBeNull();
    expect(scoreIncidentAgreement([10], [])).toBeNull();
  });
});

describe('matchLiveSession', () => {
  it('proposes the replay whose grid matches', async () => {
    const result = await matchWith(
      {
        'C:/logs/a.xml': logFor(GRID),
        'C:/logs/b.xml': logFor(['Someone Else', 'Another Name', 'A Third']),
      },
      [target('a'), target('b')],
    );

    expect(result.reason).toBe('proposed');
    expect(result.proposed?.replayHash).toBe('a');
    expect(result.proposed?.confidence).toBe(1);
  });

  /*
    🛑 The rule the whole feature turns on. A wrong link puts a driver's name
    against an incident they were not in, in an export a league may publish.
  */
  it('refuses to propose anything below the confidence floor', async () => {
    const result = await matchWith(
      {
        'C:/logs/a.xml': logFor([GRID[0], 'Someone Else', 'Another Name']),
        'C:/logs/b.xml': logFor(['A Third', 'A Fourth', 'A Fifth']),
      },
      [target('a'), target('b')],
    );

    expect(result.reason).toBe('below-floor');
    expect(result.proposed).toBeNull();
  });

  it('refuses to propose when two replays are too close to separate', async () => {
    const result = await matchWith(
      {
        'C:/logs/a.xml': logFor(GRID),
        'C:/logs/b.xml': logFor(GRID),
      },
      [target('a'), target('b')],
    );

    expect(result.reason).toBe('ambiguous');
    expect(result.proposed).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  /*
    The restarted-race case: same track, same session type, same grid, two
    replays. Only the incidents separate them, which is what incident agreement
    exists for.
  */
  it('separates a restarted race on incident agreement', async () => {
    const result = await matchWith(
      {
        'C:/logs/a.xml': logFor(GRID, [12, 40.5, 88, 130]),
        'C:/logs/b.xml': logFor(GRID, [500, 620, 700, 800]),
      },
      [target('a'), target('b')],
      { liveIncidentTimes: [12, 40.5, 88, 130] },
    );

    expect(result.reason).toBe('proposed');
    expect(result.proposed?.replayHash).toBe('a');
    expect(result.proposed?.incidentAgreement).toBe(1);
  });

  /*
    Regression. Candidates the roster scored identically come back in name
    order, which is arbitrary — reading agreement off the first of them instead
    of off the whole tied group proposed the wrong replay for one of two real
    Laguna Seca practice sessions with the same 38-car AI field.
  */
  it('picks the best agreement in the tied group, not the roster’s first place', async () => {
    const result = await matchWith(
      {
        'C:/logs/a.xml': logFor(GRID, [500, 620, 700, 800]),
        'C:/logs/b.xml': logFor(GRID, [12, 40.5, 88, 130]),
      },
      [target('a'), target('b')],
      { liveIncidentTimes: [12, 40.5, 88, 130] },
    );

    expect(result.reason).toBe('proposed');
    expect(result.proposed?.replayHash).toBe('b');
  });

  // Too few incidents for agreement to mean anything; a human decides instead.
  it('stays ambiguous when there were too few incidents to break the tie', async () => {
    const result = await matchWith(
      {
        'C:/logs/a.xml': logFor(GRID, [12, 40.5]),
        'C:/logs/b.xml': logFor(GRID, [500, 620]),
      },
      [target('a'), target('b')],
      { liveIncidentTimes: [12, 40.5] },
    );

    expect(result.reason).toBe('ambiguous');
    expect(result.proposed).toBeNull();
  });

  /*
    Import accepts a lone candidate unscored because the user handed over both
    files. Here the candidate set is one we assembled, so a single replay at the
    right track is a coincidence and still has to earn its score.
  */
  it('still scores a lone candidate rather than accepting it outright', async () => {
    const result = await matchWith(
      { 'C:/logs/a.xml': logFor(['Someone Else', 'Another', 'A Third']) },
      [target('a')],
    );

    expect(result.reason).toBe('below-floor');
    expect(result.proposed).toBeNull();
  });

  it('proposes nothing when the session had too few drivers to discriminate', async () => {
    const result = await matchWith(
      {
        'C:/logs/a.xml': logFor(GRID),
        'C:/logs/b.xml': logFor(GRID),
      },
      [target('a'), target('b')],
      {
        session: session({
          drivers: [{ slotId: 0, driverName: GRID[0] }],
        } as Partial<LiveSessionRecord> as LiveSessionRecord),
      },
    );

    expect(result.reason).toBe('roster-too-small');
    expect(result.proposed).toBeNull();
  });

  // An unlinked session is a normal resting state, not an error.
  it('reports no candidates without treating it as a failure', async () => {
    const result = await matchWith({}, []);

    expect(result.reason).toBe('no-candidates');
    expect(result.candidates).toEqual([]);
  });

  it('carries the identity key so a link survives a re-hash', async () => {
    const result = await matchWith({ 'C:/logs/a.xml': logFor(GRID) }, [
      target('a'),
      target('b', { logPath: null }),
    ]);

    expect(result.proposed?.replayIdentityKey).toBe('identity-a');
  });
});
