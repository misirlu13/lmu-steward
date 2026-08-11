import { StewardDecision } from '@types';
import { ReplayDriverStanding } from '../components/Replay/ReplayDriverStandings';
import { ReplayIncidentEvent } from '../components/Replay/replayTimelineTypes';
import { buildSessionExport, toExportDriverId } from './sessionExportModel';
import {
  csvCell,
  sessionExportFileName,
  toSessionCsv,
  toSessionJson,
  toSessionMarkdown,
  UTF8_BOM,
} from './sessionExportFormats';

const standing = (
  overrides: Partial<ReplayDriverStanding> & { position: number },
): ReplayDriverStanding => ({
  driverName: `Driver ${overrides.position}`,
  driverId: `d${overrides.position}`,
  teamName: 'Team',
  carName: 'Car',
  carClass: 'HY',
  fastestLap: '1:45.812',
  incidents: 0,
  riskIndex: 0,
  ...overrides,
});

const incident = (
  overrides: Partial<ReplayIncidentEvent> & { id: string },
): ReplayIncidentEvent => ({
  timestampLabel: '12:34',
  lapLabel: 'L4',
  type: 'collision',
  drivers: [],
  ...overrides,
});

const build = (args: Partial<Parameters<typeof buildSessionExport>[0]> = {}) =>
  buildSessionExport({
    replay: {
      replayName: 'race',
      hash: 'abc123',
      // Seconds, as LMU writes them — not milliseconds.
      timestamp: Date.parse('2026-07-04T13:00:00Z') / 1000,
      metadata: { sceneDesc: 'Bahrain', session: 'RACE' },
    },
    sessionLogData: {},
    rootLogData: { TrackLength: 5412 },
    standings: [],
    incidents: [],
    lapsCompleted: 41,
    generatedAt: new Date('2026-08-03T10:00:00Z'),
    ...args,
  });

describe('toExportDriverId', () => {
  // LMU reports an unpopulated id as "0"; exporting that as an identity would
  // collapse a whole AI field to one driver in a league's database.
  it('should drop placeholder identities', () => {
    expect(toExportDriverId('0')).toBeUndefined();
    expect(toExportDriverId('')).toBeUndefined();
    expect(toExportDriverId('   ')).toBeUndefined();
    expect(toExportDriverId(undefined)).toBeUndefined();
  });

  it('should keep a real id', () => {
    expect(toExportDriverId(' 3532 ')).toBe('3532');
  });
});

describe('buildSessionExport', () => {
  it('should order standings by finishing position', () => {
    const data = build({
      standings: [standing({ position: 3 }), standing({ position: 1 })],
    });

    expect(data.standings.map((d) => d.position)).toEqual([1, 3]);
  });

  it('should order incidents by elapsed time', () => {
    const data = build({
      incidents: [
        incident({ id: 'b', etSeconds: 200 }),
        incident({ id: 'a', etSeconds: 100 }),
      ],
    });

    expect(data.incidents.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('should count incidents by type', () => {
    const data = build({
      incidents: [
        incident({ id: 'a', type: 'collision' }),
        incident({ id: 'b', type: 'collision' }),
        incident({ id: 'c', type: 'track-limit' }),
        incident({ id: 'd', type: 'penalty' }),
      ],
    });

    expect(data.counts).toEqual({
      collisions: 2,
      trackLimits: 1,
      penalties: 1,
      total: 4,
    });
  });

  it('should carry session metadata the record needs to stand alone', () => {
    const data = build();

    expect(data.session).toMatchObject({
      track: 'Bahrain',
      sessionType: 'RACE',
      lapsCompleted: 41,
      trackLengthMeters: 5412,
      replayHash: 'abc123',
    });
    expect(data.session.date).toBe('2026-07-04T13:00:00.000Z');
  });
});

describe('toSessionCsv', () => {
  it('should quote values containing separators, quotes or newlines', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('Smith, John')).toBe('"Smith, John"');
    expect(csvCell('He said "go"')).toBe('"He said ""go"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('should not quote a hash, which is common in LMU driver names', () => {
    expect(csvCell('S F#7575')).toBe('S F#7575');
  });

  it('should lead with a BOM so Excel reads UTF-8 driver names correctly', () => {
    const csv = toSessionCsv(build());

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
  });

  it('should keep a comma in a driver name inside one cell', () => {
    const csv = toSessionCsv(
      build({
        standings: [standing({ position: 1, driverName: 'López, José' })],
      }),
    );

    expect(csv).toContain('"López, José"');
  });

  it('should include every incident, decided or not', () => {
    const csv = toSessionCsv(
      build({
        incidents: [
          incident({ id: 'a', description: 'contact at T1' }),
          incident({ id: 'b', description: 'cut track', type: 'track-limit' }),
        ],
      }),
    );

    expect(csv).toContain('contact at T1');
    expect(csv).toContain('cut track');
  });
});

describe('toSessionMarkdown', () => {
  it('should escape a pipe so it cannot break out of its cell', () => {
    const markdown = toSessionMarkdown(
      build({ standings: [standing({ position: 1, driverName: 'a|b' })] }),
    );

    expect(markdown).toContain('a\\|b');
  });

  it('should mark AI entries', () => {
    const markdown = toSessionMarkdown(
      build({ standings: [standing({ position: 1, isAiDriver: true })] }),
    );

    expect(markdown).toContain('_(AI)_');
  });

  it('should say so plainly when a session had no incidents', () => {
    expect(toSessionMarkdown(build())).toContain('No incidents were recorded');
  });
});

describe('toSessionJson', () => {
  it('should round-trip the model', () => {
    const data = build({ standings: [standing({ position: 1 })] });

    expect(JSON.parse(toSessionJson(data))).toEqual(data);
  });
});

describe('sessionExportFileName', () => {
  it('should build a slug from the track, session and date', () => {
    expect(sessionExportFileName(build(), 'csv')).toBe(
      'bahrain-race-2026-07-04.csv',
    );
  });

  it('should strip characters that would confuse a filesystem', () => {
    const data = build({
      replay: {
        metadata: { sceneDesc: 'Le Mans / Sarthe: 24h', session: 'RACE' },
        timestamp: Date.parse('2026-07-04T13:00:00Z') / 1000,
      },
    });

    expect(sessionExportFileName(data, 'markdown')).toBe(
      'le-mans-sarthe-24h-race-2026-07-04.md',
    );
  });

  it('should still produce a name when the session is unidentified', () => {
    const data = build({ replay: null });

    expect(sessionExportFileName(data, 'json')).toBe('session-2026-08-03.json');
  });
});

describe('decisions in the export', () => {
  const decision = (
    overrides: Partial<StewardDecision> = {},
  ): StewardDecision => ({
    id: 'Bahrain|RACE|inc-1|76561198000000001',
    basis: 'incident',
    incidentId: 'inc-1',
    sessionKey: 'Bahrain|RACE',
    sessionTrack: 'Bahrain',
    sessionType: 'RACE',
    target: { steamId: '76561198000000001', driverName: 'Antares Au' },
    involvedParties: [],
    outcome: 'penalty-5s',
    stewardAuthor: 'Steward',
    decidedAt: Date.parse('2026-07-04T13:30:00Z'),
    state: 'DECIDED',
    status: 'provisional',
    revisions: [],
    ...overrides,
  });

  it('should include a decision made live, which has no replay hash yet', () => {
    const data = build({ decisions: [decision()] });

    expect(data.decisions).toHaveLength(1);
    expect(data.decisions[0].driverName).toBe('Antares Au');
  });

  /*
    The record is kept so a call can be shown to have been made and taken back,
    which is an audit question. This file answers a different one — what was
    called in this session — and a league publishing it would otherwise be
    publishing a penalty that does not stand.
  */
  it('should exclude a call that was withdrawn', () => {
    const data = build({
      decisions: [decision({ state: 'WITHDRAWN', outcome: undefined })],
    });

    expect(data.decisions).toEqual([]);
  });

  it('should keep the calls that still stand beside a withdrawn one', () => {
    const data = build({
      decisions: [
        decision({ state: 'WITHDRAWN', outcome: undefined }),
        decision({ id: 'still-stands', outcome: 'penalty-10s' }),
      ],
    });

    expect(data.decisions).toHaveLength(1);
    expect(data.decisions[0].outcome).toBe('penalty-10s');
  });

  it('should exclude decisions belonging to another session', () => {
    const data = build({
      decisions: [
        decision({ sessionKey: 'Monza|RACE', sessionTrack: 'Monza' }),
      ],
    });

    expect(data.decisions).toEqual([]);
  });

  it('should prefer the replay hash once a session has synced', () => {
    const data = build({
      decisions: [
        decision({ replayHash: 'abc123' }),
        decision({ id: 'other', replayHash: 'different' }),
      ],
    });

    expect(data.decisions).toHaveLength(1);
  });

  // The whole point of the question this answered: a report must say who a
  // penalty was against.
  it('should name the driver a penalty was assigned to in every format', () => {
    const data = build({ decisions: [decision()] });

    expect(toSessionCsv(data)).toContain('Antares Au');
    expect(toSessionMarkdown(data)).toContain('Antares Au');
    expect(toSessionJson(data)).toContain('Antares Au');
  });

  it('should mark an incident-scoped finding as having no driver', () => {
    const data = build({
      decisions: [decision({ target: undefined, outcome: 'no-action' })],
    });

    expect(toSessionMarkdown(data)).toContain('_(incident)_');
  });

  it('should say so plainly when no decisions were recorded', () => {
    expect(toSessionMarkdown(build())).toContain(
      'No steward decisions were recorded',
    );
  });
});

// Field names verified against the real session logs in fixture-test-set/, not
// assumed: <TrackEvent> and <Setting> are populated in every log inspected,
// while <ServerName> exists but was empty even in multiplayer logs.
describe('session metadata taken from the log', () => {
  const withLog = () =>
    build({
      rootLogData: {
        TrackLength: 5497.4,
        TrackEvent: '6 Hours of Spa-Francorchamps',
        Setting: 'Multiplayer',
        ServerName: '',
      },
    });

  it('should carry the event name and setting', () => {
    const data = withLog();

    expect(data.session.event).toBe('6 Hours of Spa-Francorchamps');
    expect(data.session.setting).toBe('Multiplayer');
  });

  it('should treat an empty server name as absent', () => {
    expect(withLog().session.serverName).toBeUndefined();
  });

  it('should head the report with the event rather than the track', () => {
    expect(toSessionMarkdown(withLog())).toContain(
      '# 6 Hours of Spa-Francorchamps — RACE',
    );
  });

  it('should still keep the track name as a fact when an event is named', () => {
    expect(toSessionMarkdown(withLog())).toContain('**Track:** Bahrain');
  });

  it('should fall back to the track when the log names no event', () => {
    expect(toSessionMarkdown(build())).toContain('# Bahrain — RACE');
  });
});

// Every case below was found by exporting a real 35-driver race and reading the
// file, not by reasoning about the types.
describe('regressions found against a real export', () => {
  it('should read replay timestamps as seconds, not milliseconds', () => {
    // Treating them as ms dated the whole export to January 1970 — visible in
    // the filename before the file was even opened.
    const data = build({ replay: { timestamp: 1785294694 } });

    expect(data.session.date?.slice(0, 4)).toBe('2026');
  });

  it('should take event and setting from the log root, not the session branch', () => {
    // resolveReplaySessionLogData returns only the session's own node, so
    // reading root-level fields from it silently yielded nothing.
    const data = build({
      sessionLogData: { MostLapsCompleted: 4 },
      rootLogData: { TrackEvent: 'Lone Star Le Mans', Setting: 'Multiplayer' },
    });

    expect(data.session.event).toBe('Lone Star Le Mans');
    expect(data.session.setting).toBe('Multiplayer');
  });

  it('should label the identity column as a driver id, not a Steam ID', () => {
    // The real export carried short numeric ids like 3532 here. Calling that a
    // Steam ID would invite a league to join their roster on the wrong key.
    const csv = toSessionCsv(build());

    expect(csv).toContain('Driver ID');
    expect(csv).toContain('Driver IDs');
  });
});

describe('event name that merely repeats the track', () => {
  // Observed in a real multiplayer export: <TrackEvent> was the track name.
  const sameAsTrack = () =>
    build({
      rootLogData: { TrackEvent: 'Bahrain', Setting: 'Multiplayer' },
    });

  it('should not print the track twice under two labels', () => {
    const markdown = toSessionMarkdown(sameAsTrack());

    expect(markdown).toContain('# Bahrain — RACE');
    expect(markdown).not.toContain('**Track:** Bahrain');
  });

  it('should omit the CSV event row when it adds nothing', () => {
    expect(toSessionCsv(sameAsTrack())).not.toContain('Event,Bahrain');
  });

  it('should still keep a genuine event name', () => {
    const data = build({
      rootLogData: { TrackEvent: '6 Hours of Spa-Francorchamps' },
    });

    expect(toSessionCsv(data)).toContain('Event,6 Hours of Spa-Francorchamps');
    expect(toSessionMarkdown(data)).toContain('**Track:** Bahrain');
  });
});

// Every multiplayer log inspected had Dedicated=0 and an empty ServerName, so
// the name most likely only appears on a hosted server — which is what a league
// would run.
describe('server identification', () => {
  it('should omit the server row when there is no name to report', () => {
    const csv = toSessionCsv(
      build({ rootLogData: { ServerName: '', Dedicated: '0' } }),
    );

    expect(csv).not.toContain('Server,');
    expect(csv).toContain('Dedicated server,no');
  });

  it('should report a hosted server when one is named', () => {
    const data = build({
      rootLogData: { ServerName: 'Endurance League R4', Dedicated: '1' },
    });

    expect(toSessionCsv(data)).toContain('Server,Endurance League R4');
    expect(toSessionMarkdown(data)).toContain('dedicated server');
  });

  it('should still report a dedicated server when the log names no setting', () => {
    const data = build({ rootLogData: { Dedicated: '1' } });

    expect(toSessionMarkdown(data)).toContain('**Setting:** dedicated server');
  });

  it('should say nothing about dedication when the log does not', () => {
    expect(toSessionCsv(build())).not.toContain('Dedicated server');
  });
});
