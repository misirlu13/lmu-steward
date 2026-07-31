import { SessionType } from '@types';
import { VcrTrailer, VcrDriver } from './vcr-metadata';
import {
  LogCandidate,
  scoreLogCandidates,
  validateImportPair,
} from './replay-import-match';

/**
 * Two Monza events on the evening of 18 July 2026, taken from a real hand-off.
 * They share a track, a session type and a date, so the grid is the only thing
 * that separates them.
 */
const EVENT_ONE_GRID = [
  'Artyom Manisha',
  'Boris Pergamenshchikov',
  'Tikhon Kharitonov',
  'Igor Romanov',
  'Alexander Chikov',
  'Danil Nagaitsev',
  'Yan Baida',
  'Maxim Matveykov',
  'Artem Strekalovskiy',
  'Qwert ASDFG',
  'Angelo Allario',
  'matvey horelikay',
  'Edouard Roussel',
  'Dmitriy Nootakoe',
];

const EVENT_TWO_GRID = [
  'Artyom Manisha',
  'Boris Pergamenshchikov',
  'Tikhon Kharitonov',
  'Igor Romanov',
  'Alexander Chikov',
  'Danil Nagaitsev',
  'Yan Baida',
  'Maxim Matveykov',
  'Konstantin Firsenkov',
  'Sergey Kukish',
  'Mikhail Krasov',
  'Artem Spitsin',
];

const buildTrailer = (driverNames: string[]): VcrTrailer => ({
  sceneDesc: 'MONZAWEC',
  session: 'RACE',
  trackScene: 'MONZAWEC.SCN',
  trackAiw: 'MONZAWEC.AIW',
  trackFolder: 'Monza_2023',
  trackVersion: '1.27',
  trackContentHash: 'abc',
  originInstallPath: 'C:\\LMU',
  drivers: driverNames.map(
    (name, index): VcrDriver => ({
      name,
      vehicleId: `${index}_26_TEAM`,
      contentId: '',
      teamName: name,
      carNumber: String(index + 1),
    }),
  ),
});

const buildCandidate = (
  fileName: string,
  driverNames: string[],
  session: SessionType = 'RACE',
): LogCandidate => ({
  fileName,
  filePath: `C:/logs/${fileName}`,
  session,
  eventDateTime: 1784398360,
  trackVenue: 'Autodromo Nazionale Monza',
  trackCourse: 'Autodromo Nazionale Monza',
  trackEvent: 'Autodromo Nazionale Monza',
  driverNames,
});

describe('main/replay import pairing', () => {
  it('proposes the log whose grid matches, over one from the same evening', () => {
    /*
     * The .Vcr roster also carries the recording player, who is absent from the
     * log's driver list. Overlap is fuzzy by nature and must not be treated as
     * set equality.
     */
    const trailer = buildTrailer([...EVENT_TWO_GRID, 'Pedro Couceiro']);

    const result = scoreLogCandidates(trailer, [
      buildCandidate('event-one-race.xml', EVENT_ONE_GRID),
      buildCandidate('event-two-race.xml', EVENT_TWO_GRID),
    ]);

    expect(result.reason).toBe('proposed');
    expect(result.proposed?.candidate.fileName).toBe('event-two-race.xml');
    expect(result.ranked[0].confidence).toBeGreaterThan(
      result.ranked[1].confidence,
    );
  });

  it('reports the overlap it used, so the choice can be shown to the user', () => {
    const trailer = buildTrailer([...EVENT_TWO_GRID, 'Pedro Couceiro']);

    const result = scoreLogCandidates(trailer, [
      buildCandidate('event-two-race.xml', EVENT_TWO_GRID),
      buildCandidate('event-one-race.xml', EVENT_ONE_GRID),
    ]);

    expect(result.proposed).toMatchObject({
      intersection: EVENT_TWO_GRID.length,
      vcrCount: EVENT_TWO_GRID.length + 1,
      logCount: EVENT_TWO_GRID.length,
    });
  });

  it('ignores case and accents when comparing names', () => {
    const trailer = buildTrailer([
      'Sébastien Buemi',
      'Brendon Hartley',
      'Ryo Hirakawa',
    ]);

    const result = scoreLogCandidates(trailer, [
      buildCandidate('a.xml', [
        'SEBASTIEN BUEMI',
        'brendon hartley',
        'Ryo Hirakawa',
      ]),
      buildCandidate('b.xml', [
        'Someone Else',
        'Another Person',
        'Third Driver',
      ]),
    ]);

    expect(result.proposed?.candidate.fileName).toBe('a.xml');
    expect(result.proposed?.confidence).toBe(1);
  });

  /**
   * A solo or two-driver practice session cannot be told apart by its grid.
   * Guessing would be worse than asking — the wrong log means every incident and
   * lap in the app belongs to somebody else's race.
   */
  it('refuses to propose when the roster is too small to discriminate', () => {
    const trailer = buildTrailer(['Artem Kozachun', 'Pedro Couceiro']);

    const result = scoreLogCandidates(trailer, [
      buildCandidate('a.xml', ['Artem Kozachun', 'Pedro Couceiro']),
      buildCandidate('b.xml', ['Artem Kozachun', 'Pedro Couceiro']),
    ]);

    expect(result.proposed).toBeNull();
    expect(result.reason).toBe('roster-too-small');
  });

  it('refuses to propose when no candidate clears the floor', () => {
    const trailer = buildTrailer(EVENT_TWO_GRID);

    const result = scoreLogCandidates(trailer, [
      buildCandidate('a.xml', ['Nobody Here', 'Someone Else', 'Third Person']),
      buildCandidate('b.xml', [
        'Different Again',
        'Another One',
        'And Another',
      ]),
    ]);

    expect(result.proposed).toBeNull();
    expect(result.reason).toBe('below-floor');
  });

  it('refuses to propose when two candidates are too close to separate', () => {
    const trailer = buildTrailer(EVENT_TWO_GRID);
    const nearIdentical = [...EVENT_TWO_GRID];

    const result = scoreLogCandidates(trailer, [
      buildCandidate('a.xml', EVENT_TWO_GRID),
      buildCandidate('b.xml', nearIdentical),
    ]);

    expect(result.proposed).toBeNull();
    expect(result.reason).toBe('ambiguous');
  });

  /**
   * One .Vcr handed over with one log. Scoring would only invent a reason to
   * reject a pairing the user has already made by what they sent.
   */
  it('accepts a lone candidate without scoring it', () => {
    const trailer = buildTrailer(['Artem Kozachun', 'Pedro Couceiro']);

    const result = scoreLogCandidates(trailer, [
      buildCandidate('only.xml', ['Completely', 'Different', 'People']),
    ]);

    expect(result.reason).toBe('only-candidate');
    expect(result.proposed?.candidate.fileName).toBe('only.xml');
  });

  it('reports when there is nothing to pair with', () => {
    const result = scoreLogCandidates(buildTrailer(EVENT_TWO_GRID), []);

    expect(result.proposed).toBeNull();
    expect(result.reason).toBe('no-candidates');
  });
});

describe('main/replay import pair validation', () => {
  const MONZA_ALIASES = ['autodromo nazionale monza'];

  it('accepts a correct pairing with no issues', () => {
    const result = validateImportPair(
      buildTrailer([...EVENT_TWO_GRID, 'Pedro Couceiro']),
      buildCandidate('race.xml', EVENT_TWO_GRID),
      MONZA_ALIASES,
    );

    expect(result.issues).toEqual([]);
    expect(result.canImport).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  /**
   * The mistake this validator exists for: a steward handed a weekend has
   * several logs from one track on one evening, and the neighbouring event's
   * log is the easiest wrong pick there is.
   */
  it('warns when the grids do not line up', () => {
    const result = validateImportPair(
      buildTrailer(EVENT_TWO_GRID),
      buildCandidate('wrong-race.xml', EVENT_ONE_GRID),
      MONZA_ALIASES,
    );

    expect(result.issues.map((issue) => issue.code)).toContain(
      'roster-mismatch',
    );
    // A warning, not a block — the steward may know something we do not.
    expect(result.canImport).toBe(true);
  });

  it('blocks a session type mismatch', () => {
    const result = validateImportPair(
      buildTrailer(EVENT_TWO_GRID),
      buildCandidate('quali.xml', EVENT_TWO_GRID, 'QUALIFY'),
      MONZA_ALIASES,
    );

    expect(result.issues[0]).toMatchObject({
      severity: 'error',
      code: 'session-mismatch',
    });
    expect(result.canImport).toBe(false);
  });

  it('blocks a log with no event date, since there is nothing to stamp', () => {
    const result = validateImportPair(
      buildTrailer(EVENT_TWO_GRID),
      { ...buildCandidate('race.xml', EVENT_TWO_GRID), eventDateTime: null },
      MONZA_ALIASES,
    );

    expect(result.issues.map((issue) => issue.code)).toContain('no-event-date');
    expect(result.canImport).toBe(false);
  });

  it('warns on a track mismatch without blocking', () => {
    const result = validateImportPair(
      buildTrailer(EVENT_TWO_GRID),
      {
        ...buildCandidate('race.xml', EVENT_TWO_GRID),
        trackVenue: 'Circuit de Spa-Francorchamps',
        trackCourse: 'Circuit de Spa-Francorchamps',
        trackEvent: 'Circuit de Spa-Francorchamps',
      },
      MONZA_ALIASES,
    );

    expect(result.issues.map((issue) => issue.code)).toContain(
      'track-mismatch',
    );
    expect(result.canImport).toBe(true);
  });

  it('says so plainly when the grid is too small to check', () => {
    const result = validateImportPair(
      buildTrailer(['Artem Kozachun', 'Pedro Couceiro']),
      buildCandidate('practice.xml', ['Artem Kozachun'], 'RACE'),
      MONZA_ALIASES,
    );

    expect(result.issues.map((issue) => issue.code)).toContain(
      'roster-too-small',
    );
    // Reporting a confidence from a two-name grid would be meaningless.
    expect(result.confidence).toBeNull();
    expect(result.canImport).toBe(true);
  });
});
