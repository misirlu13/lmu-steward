/*
 * The career layer's job is to never lose a session. These cover the parts that
 * would lose one quietly: identity filtering, the content-derived key that has
 * to survive a rename, and the rule that a deleted log marks a record rather
 * than removing it.
 *
 * Declarations above the imports for the reason given in replay.test.ts —
 * importing a module under test evaluates it, and the store mock has to exist
 * by then.
 */
/* eslint-disable import/first */
const storeData: Record<string, unknown> = {};
const profileData: { profileInfo: { name: string } | null } = {
  profileInfo: null,
};

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CareerSessionRecord } from '@types';
import {
  buildCareerAggregate,
  buildCareerLogIndex,
  claimCareerIdentity,
  ensureCareerIdentity,
  normalizeIdentityName,
  readCareerIdentity,
  readCareerSessions,
  readTrackIdentity,
  scanCareer,
  setCareerSessionExcluded,
} from './career';
import { resetLogIndexCacheForTests } from './log-index';

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({
    get: (key: string) => storeData[key],
    set: (key: string, value: unknown) => {
      storeData[key] = value;
    },
    clear: () => {},
  }),
  readProfileCache: () => profileData,
}));
/* eslint-enable import/first */

const buildLog = (options: {
  player: string;
  sessionStartedAt: number;
  venue?: string;
  layout?: string;
  gridPos?: number;
  position?: number;
  laps?: number;
  incidents?: number;
  bestLap?: number;
}): string => {
  const venue = options.venue ?? 'Autodromo Nazionale Monza';
  const layout = options.layout ?? 'layoutMonza';
  const laps = Array.from(
    { length: options.laps ?? 3 },
    (_unused, index) =>
      `<Lap num="${index + 1}" p="${options.position ?? 3}" et="${(index + 1) * 90}" s1="40" s2="30" s3="25" topspeed="250" fuelUsed="0.02" fcompound="0,Medium">9${index}.5000</Lap>`,
  ).join('');
  const incidents = Array.from(
    { length: options.incidents ?? 0 },
    (_unused, index) =>
      `<Incident et="${index + 1}.0">${options.player}(9) reported contact (250.00) with another vehicle Rival(4)</Incident>`,
  ).join('');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rFactorXML version="1.0">',
    '<RaceResults>',
    '<Setting>Multiplayer</Setting>',
    '<DateTime>1000</DateTime>',
    `<TrackVenue>${venue}</TrackVenue>`,
    `<TrackData>C:\\LMU\\Installed\\Locations\\Monza_2023\\1.27\\${layout}.mas</TrackData>`,
    '<TrackLength>5793.0</TrackLength>',
    '<GameVersion>1.4000</GameVersion>',
    '<Race>',
    `<DateTime>${options.sessionStartedAt}</DateTime>`,
    `<Stream>${incidents}</Stream>`,
    '<Driver>',
    `<Name>${options.player}</Name>`,
    '<CarType>Porsche 911 GT3 R LMGT3</CarType>',
    '<CarClass>GT3</CarClass>',
    '<CarNumber>31</CarNumber>',
    '<TeamName>Test Team</TeamName>',
    '<isPlayer>1</isPlayer>',
    `<GridPos>${options.gridPos ?? 5}</GridPos>`,
    `<Position>${options.position ?? 3}</Position>`,
    `<ClassGridPos>${options.gridPos ?? 5}</ClassGridPos>`,
    `<ClassPosition>${options.position ?? 3}</ClassPosition>`,
    laps,
    `<BestLapTime>${options.bestLap ?? 90.5}</BestLapTime>`,
    `<Laps>${options.laps ?? 3}</Laps>`,
    '<Pitstops>1</Pitstops>',
    '<FinishStatus>Finished Normally</FinishStatus>',
    '<ControlAndAids startLap="1" endLap="3">PlayerControl</ControlAndAids>',
    '</Driver>',
    '<Driver>',
    '<Name>Rival</Name>',
    '<CarClass>GT3</CarClass>',
    '<isPlayer>0</isPlayer>',
    '<GridPos>1</GridPos>',
    '<Position>1</Position>',
    '<ClassGridPos>1</ClassGridPos>',
    '<ClassPosition>1</ClassPosition>',
    '<BestLapTime>89.0</BestLapTime>',
    '<Laps>3</Laps>',
    '<FinishStatus>Finished Normally</FinishStatus>',
    '<ControlAndAids startLap="1" endLap="3">AIControl</ControlAndAids>',
    '</Driver>',
    '</Race>',
    '</RaceResults>',
    '</rFactorXML>',
  ].join('');
};

describe('main/career', () => {
  let logDir: string;

  /*
   * Always through the career's own parser, as production does. It binds the
   * driver's names into the parse, which is what makes identity work at all in
   * a multiplayer field where every entry is flagged as a human.
   */
  const scan = async (options: Parameters<typeof scanCareer>[0] = {}) =>
    scanCareer({ index: await buildCareerLogIndex(logDir), ...options });

  beforeEach(() => {
    Object.keys(storeData).forEach((key) => delete storeData[key]);
    profileData.profileInfo = { name: 'Bradley Drake' };
    resetLogIndexCacheForTests();
    logDir = mkdtempSync(join(tmpdir(), 'lmu-career-'));
  });

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  it('normalises the multiplayer discriminator off a driver name', () => {
    expect(normalizeIdentityName('Steve Davis#1924')).toBe('steve davis');
    expect(normalizeIdentityName("  Craig O'Rorke ")).toBe("craig o'rorke");
  });

  it('reads folder, layout and version out of the track path', () => {
    expect(
      readTrackIdentity(
        'C:\\LMU\\Installed\\Locations\\ImolaWEC_2024\\1.25\\layoutImolaELMS.mas',
      ),
    ).toEqual({
      folder: 'ImolaWEC_2024',
      version: '1.25',
      layout: 'layoutImolaELMS',
    });
  });

  it('seeds the primary identity from the LMU profile', () => {
    expect(ensureCareerIdentity().primary).toBe('Bradley Drake');
  });

  it('records the sessions the user drove', async () => {
    writeFileSync(
      join(logDir, '2026_07_18_09_13_39-31R1.xml'),
      buildLog({ player: 'Bradley Drake', sessionStartedAt: 2000, laps: 4 }),
    );
    ensureCareerIdentity();

    const report = await scan();
    const sessions = Object.values(readCareerSessions());

    expect(report.sessionsRecorded).toBe(1);
    expect(sessions[0]).toMatchObject({
      driverName: 'Bradley Drake',
      sessionType: 'RACE',
      trackFolder: 'Monza_2023',
      trackLayout: 'layoutMonza',
      trackVersion: '1.27',
      trackLengthM: 5793,
      classGridPos: 5,
      classFinishPos: 3,
      lapsCompleted: 4,
      filePresent: true,
    });
  });

  /*
   * Importing someone else's replay writes their result log into this same
   * folder. On an install where import has been used those can be most of the
   * directory, so this is the common case rather than an edge one.
   */
  it('ignores logs belonging to another driver', async () => {
    writeFileSync(
      join(logDir, 'mine-31R1.xml'),
      buildLog({ player: 'Bradley Drake', sessionStartedAt: 2000 }),
    );
    writeFileSync(
      join(logDir, 'theirs-31R1.xml'),
      buildLog({ player: 'Someone Else', sessionStartedAt: 3000 }),
    );
    ensureCareerIdentity();

    const report = await scan();

    expect(report.sessionsRecorded).toBe(1);
    expect(report.skippedUnclaimed).toBe(1);
    expect(readCareerIdentity().unclaimed).toEqual([
      { name: 'Someone Else', sessionCount: 1 },
    ]);
  });

  /*
   * `isPlayer` marks every human on the grid, not the local driver: measured at
   * one per offline race weekend but 240 of 242 multiplayer logs carrying
   * several, one of them twenty-three. Identity therefore comes from the name.
   * Without this, a multiplayer log credits whichever human happened to be read
   * last — a stranger's race filed under this driver's career.
   */
  it('picks the right driver out of a field where everyone is human', async () => {
    const humans = ['Someone Else', 'Bradley Drake', 'Another Person']
      .map(
        (player) =>
          buildLog({ player, sessionStartedAt: 2000 })
            .split('<Driver>')[1]
            .split('</Driver>')[0],
      )
      .map((block) => `<Driver>${block}</Driver>`)
      .join('');

    writeFileSync(
      join(logDir, 'multiplayer-31R1.xml'),
      buildLog({ player: 'Bradley Drake', sessionStartedAt: 2000 }).replace(
        /<Driver>[\s\S]*<\/Driver>/,
        humans,
      ),
    );
    ensureCareerIdentity();

    await scan();
    const sessions = Object.values(readCareerSessions());

    expect(sessions).toHaveLength(1);
    expect(sessions[0].driverName).toBe('Bradley Drake');
  });

  /*
   * Importing a replay of a race the user also drove copies no result log,
   * because theirs is already in the folder. Excluding every path the import
   * store knows would therefore delete their own sessions; only the logs the
   * import actually wrote are somebody else's.
   */
  it('keeps a session whose log an import found rather than wrote', async () => {
    const ownPath = join(logDir, 'own-but-also-imported-31R1.xml');
    writeFileSync(
      ownPath,
      buildLog({ player: 'Bradley Drake', sessionStartedAt: 2000 }),
    );
    ensureCareerIdentity();

    // The caller passes only logs the import wrote, so this one is absent.
    const report = await scan({ importedLogPaths: new Set() });

    expect(report.sessionsRecorded).toBe(1);
  });

  it('excludes a log this app imported even when it names the user', async () => {
    const importedPath = join(logDir, 'imported-31R1.xml');
    writeFileSync(
      importedPath,
      buildLog({ player: 'Bradley Drake', sessionStartedAt: 2000 }),
    );
    ensureCareerIdentity();

    const report = await scan({
      importedLogPaths: new Set([importedPath]),
    });

    expect(report.skippedImported).toBe(1);
    expect(report.sessionsRecorded).toBe(0);
  });

  it('folds a claimed name into the career', async () => {
    writeFileSync(
      join(logDir, 'alias-31R1.xml'),
      buildLog({ player: 'BD_Racing', sessionStartedAt: 2000 }),
    );
    ensureCareerIdentity();
    await scan();

    expect(Object.keys(readCareerSessions())).toHaveLength(0);

    await claimCareerIdentity('BD_Racing');
    await scan();

    expect(Object.keys(readCareerSessions())).toHaveLength(1);
    expect(readCareerIdentity().unclaimed).toEqual([]);
  });

  /*
   * The key is derived from the session's own content, so the same session read
   * from a renamed file updates its row instead of being recorded twice.
   */
  it('does not duplicate a session whose log was renamed', async () => {
    const original = join(logDir, 'first-31R1.xml');
    const xml = buildLog({ player: 'Bradley Drake', sessionStartedAt: 2000 });
    writeFileSync(original, xml);
    ensureCareerIdentity();
    await scan();

    rmSync(original);
    writeFileSync(join(logDir, 'renamed-31R1.xml'), xml);
    resetLogIndexCacheForTests();
    await scan();

    expect(Object.keys(readCareerSessions())).toHaveLength(1);
  });

  it('keeps restarted races as separate sessions', async () => {
    writeFileSync(
      join(logDir, 'first-31R1.xml'),
      buildLog({ player: 'Bradley Drake', sessionStartedAt: 2000 }),
    );
    writeFileSync(
      join(logDir, 'restart-31R1.xml'),
      buildLog({ player: 'Bradley Drake', sessionStartedAt: 2600 }),
    );
    ensureCareerIdentity();

    await scan();

    expect(Object.keys(readCareerSessions())).toHaveLength(2);
  });

  /*
   * The whole point of the feature. Once the log is gone nothing can rebuild
   * the session, so it must survive its source.
   */
  it('keeps a session after its log is deleted, marking the file gone', async () => {
    const logPath = join(logDir, 'gone-31R1.xml');
    writeFileSync(
      logPath,
      buildLog({ player: 'Bradley Drake', sessionStartedAt: 2000 }),
    );
    ensureCareerIdentity();
    await scan();

    rmSync(logPath);
    resetLogIndexCacheForTests();
    const report = await scan();

    const sessions = Object.values(readCareerSessions());
    expect(sessions).toHaveLength(1);
    expect(sessions[0].filePresent).toBe(false);
    expect(report.sessionsMissingFiles).toBe(1);
  });

  it('keeps an exclusion set by the user across a re-parse', async () => {
    const logPath = join(logDir, 'excluded-31R1.xml');
    writeFileSync(
      logPath,
      buildLog({ player: 'Bradley Drake', sessionStartedAt: 2000 }),
    );
    ensureCareerIdentity();
    await scan();

    const [sessionKey] = Object.keys(readCareerSessions());
    setCareerSessionExcluded(sessionKey, true);

    resetLogIndexCacheForTests();
    await scan({ rebuild: true });

    expect(readCareerSessions()[sessionKey].excluded).toBe(true);
  });

  it('skips re-parsing a log whose fingerprint is unchanged', async () => {
    writeFileSync(
      join(logDir, 'stable-31R1.xml'),
      buildLog({ player: 'Bradley Drake', sessionStartedAt: 2000 }),
    );
    ensureCareerIdentity();

    expect((await scan()).logsParsed).toBe(1);
    expect((await scan()).logsParsed).toBe(0);
    expect((await scan({ rebuild: true })).logsParsed).toBe(1);
  });
});

describe('main/career aggregate', () => {
  const session = (
    overrides: Partial<CareerSessionRecord> = {},
  ): CareerSessionRecord =>
    ({
      sessionKey: Math.random().toString(36).slice(2),
      driverName: 'Bradley Drake',
      startedAt: 1000,
      sessionType: 'RACE',
      setting: 'Multiplayer',
      trackVenue: 'Monza',
      trackFolder: 'Monza_2023',
      trackLayout: 'layoutMonza',
      trackVersion: '1.27',
      trackLengthM: 5000,
      trackEvent: '',
      gameVersion: '1.4000',
      carClass: 'GT3',
      carType: 'Porsche 911 GT3 R LMGT3',
      carNumber: '31',
      teamName: 'Team',
      aids: 'PlayerControl',
      gridPos: 5,
      classGridPos: 5,
      finishPos: 3,
      classFinishPos: 3,
      lapsCompleted: 10,
      pitstops: 1,
      finishStatus: 'Finished Normally',
      dnfReason: null,
      finishTimeSec: 900,
      bestLapSec: 90,
      theoreticalBestSec: 89,
      averageLapSec: 91,
      lapStdDevSec: 0.5,
      topSpeedKph: 250,
      lapsLed: 0,
      firstLapPos: 4,
      timedLapCount: 10,
      sessionBestLapSec: 88,
      classBestLapSec: 88,
      fieldSize: 20,
      classFieldSize: 11,
      aiCount: 0,
      humanCount: 20,
      classes: ['GT3'],
      incidentsCaused: 1,
      incidentsInvolved: 1,
      incidentForceMax: 200,
      contactWithVehicle: 1,
      contactWithScenery: 0,
      penalties: [],
      trackLimitWarnings: 0,
      trackLimitInvalidLaps: 0,
      opponents: [],
      sourceFileName: 'a.xml',
      sourcePath: 'C:/logs/a.xml',
      sourceFingerprint: '1:1',
      filePresent: true,
      excluded: false,
      firstSeenAt: 1,
      ...overrides,
    }) as CareerSessionRecord;

  const identity = { primary: 'Bradley Drake', aliases: [], unclaimed: [] };

  it('counts practice for distance but never for results', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ sessionType: 'RACE', classFinishPos: 1 }),
        session({
          sessionType: 'PRACTICE',
          classFinishPos: 1,
          lapsCompleted: 20,
        }),
      ],
      identity,
      null,
    );

    expect(aggregate.headline.sessions).toBe(2);
    expect(aggregate.headline.races).toBe(1);
    expect(aggregate.results.wins).toBe(1);
    expect(aggregate.headline.lapsCompleted).toBe(30);
    expect(aggregate.headline.distanceKm).toBe(150);
  });

  it('splits wins by multiplayer and race weekend while keeping one total', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ classFinishPos: 1, setting: 'Multiplayer' }),
        session({ classFinishPos: 1, setting: 'Race Weekend' }),
        session({ classFinishPos: 1, setting: 'Race Weekend' }),
      ],
      identity,
      null,
    );

    expect(aggregate.results.wins).toBe(3);
    expect(aggregate.results.winsMultiplayer).toBe(1);
    expect(aggregate.results.winsRaceWeekend).toBe(2);
  });

  /*
   * 8th of 40 is a better drive than 5th of 6, so tracks rank on where a finish
   * sits in its class field rather than on the raw number.
   */
  it('ranks tracks on finish percentile, not raw position', () => {
    const aggregate = buildCareerAggregate(
      [
        ...Array.from({ length: 3 }, () =>
          session({
            trackFolder: 'Big',
            trackLayout: 'big',
            classFinishPos: 8,
            classFieldSize: 40,
          }),
        ),
        ...Array.from({ length: 3 }, () =>
          session({
            trackFolder: 'Small',
            trackLayout: 'small',
            classFinishPos: 5,
            classFieldSize: 6,
          }),
        ),
      ],
      identity,
      null,
    );

    const big = aggregate.tracks.find((track) => track.trackFolder === 'Big');
    const small = aggregate.tracks.find(
      (track) => track.trackFolder === 'Small',
    );

    expect(big?.averageFinishPercentile).toBeLessThan(
      small?.averageFinishPercentile ?? 1,
    );
  });

  it('leaves a track unranked until it has enough races', () => {
    const aggregate = buildCareerAggregate(
      [session({ trackFolder: 'Thin', trackLayout: 'thin' })],
      identity,
      null,
    );

    expect(aggregate.tracks[0].averageFinishPercentile).toBeNull();
  });

  it('measures incidents against distance, not against sessions', () => {
    const aggregate = buildCareerAggregate(
      [session({ incidentsCaused: 2, lapsCompleted: 10, trackLengthM: 5000 })],
      identity,
      null,
    );

    // 2 incidents over 50 km.
    expect(aggregate.discipline.incidentsPer100Km).toBeCloseTo(4);
  });

  it('counts the longest run of sessions with no incident or penalty', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ startedAt: 1, incidentsCaused: 0 }),
        session({ startedAt: 2, incidentsCaused: 0 }),
        session({ startedAt: 3, incidentsCaused: 1 }),
        session({ startedAt: 4, incidentsCaused: 0 }),
        session({ startedAt: 5, incidentsCaused: 0 }),
        session({ startedAt: 6, incidentsCaused: 0 }),
      ],
      identity,
      null,
    );

    expect(aggregate.discipline.longestCleanStreak).toBe(3);
  });

  it('keeps an excluded session in the library but out of every total', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ classFinishPos: 1 }),
        session({ classFinishPos: 1, excluded: true }),
      ],
      identity,
      null,
    );

    expect(aggregate.results.wins).toBe(1);
    expect(aggregate.headline.sessions).toBe(1);
    expect(aggregate.dataHealth.excludedSessions).toBe(1);
  });

  it('reports sessions whose files are gone without dropping them', () => {
    const aggregate = buildCareerAggregate(
      [session({ filePresent: false }), session()],
      identity,
      null,
    );

    expect(aggregate.headline.sessions).toBe(2);
    expect(aggregate.dataHealth.sessionsWithMissingFiles).toBe(1);
  });

  it('separates mechanical retirements from accidents', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ finishStatus: 'DNF', dnfReason: 'Suspension' }),
        session({ finishStatus: 'DNF', dnfReason: 'Accident' }),
        session({ finishStatus: 'DQ', dnfReason: null }),
      ],
      identity,
      null,
    );

    expect(aggregate.results.dnfs).toBe(2);
    expect(aggregate.results.dnfMechanical).toBe(1);
    expect(aggregate.results.dnfAccident).toBe(1);
    expect(aggregate.results.disqualifications).toBe(1);
  });

  /*
   * The pace figure that matters, and deliberately relative. A personal best
   * says how quick the car and track are; this says how close to the pace the
   * driver was, and survives a change of both.
   */
  it('measures pace as the gap to the quickest lap of the same session', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ bestLapSec: 101, sessionBestLapSec: 100 }),
        session({ bestLapSec: 103, sessionBestLapSec: 100 }),
      ],
      identity,
      null,
    );

    // 1% off in one session, 3% in the other.
    expect(aggregate.pace.averageGapToSessionBest).toBeCloseTo(0.02);
  });

  /*
   * A driver who joined, ran an out-lap and left is not slow — they did not
   * run. Left in, those sessions dominate: a real career read 10.9% off the
   * pace on a recent set containing single-lap installs at 24%.
   */
  it('ignores sessions the driver barely ran when measuring pace', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ bestLapSec: 101, sessionBestLapSec: 100, timedLapCount: 10 }),
        session({ bestLapSec: 140, sessionBestLapSec: 100, timedLapCount: 1 }),
      ],
      identity,
      null,
    );

    expect(aggregate.pace.averageGapToSessionBest).toBeCloseTo(0.01);
  });

  /*
   * A thin sample reads as a verdict. Four sessions on a Spa variant measured
   * 20% off the pace next to the 2% of the Spa actually driven, which says the
   * driver is weak there when it says they have barely been there.
   */
  it('leaves pace unranked for a layout with too few timed sessions', () => {
    const thin = Array.from({ length: 4 }, () =>
      session({ trackFolder: 'Thin', trackLayout: 'thin' }),
    );
    const thick = Array.from({ length: 6 }, () =>
      session({ trackFolder: 'Thick', trackLayout: 'thick' }),
    );

    const aggregate = buildCareerAggregate([...thin, ...thick], identity, null);
    const byFolder = new Map(
      aggregate.tracks.map((track) => [track.trackFolder, track]),
    );

    expect(byFolder.get('Thin')?.averageGapToSessionBest).toBeNull();
    expect(byFolder.get('Thick')?.averageGapToSessionBest).not.toBeNull();
  });

  /*
   * Race laps carry pit stops, safety cars and traffic — ±10.4s against
   * qualifying's ±1.1s on a real career — so mixing them reports the shape of
   * the sessions rather than the steadiness of the driver.
   */
  it('measures consistency from qualifying alone', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ sessionType: 'QUALIFY', lapStdDevSec: 1 }),
        session({ sessionType: 'RACE', lapStdDevSec: 20 }),
        session({ sessionType: 'PRACTICE', lapStdDevSec: 15 }),
      ],
      identity,
      null,
    );

    expect(aggregate.pace.averageConsistencySec).toBeCloseTo(1);
  });

  it('keeps only improvements in a personal-best history', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ startedAt: 1, bestLapSec: 100 }),
        session({ startedAt: 2, bestLapSec: 101 }),
        session({ startedAt: 3, bestLapSec: 99 }),
        session({ startedAt: 4, bestLapSec: 99.5 }),
      ],
      identity,
      null,
    );

    expect(aggregate.tracks[0].bestLapHistory).toEqual([
      { at: 1, sec: 100 },
      { at: 3, sec: 99 },
    ]);
  });

  /*
   * "Raced against most" and "most contact with" are different questions, and
   * the second is the one no other tool answers.
   */
  it('separates who you race from who you hit, and excludes AI', () => {
    const aggregate = buildCareerAggregate(
      [
        session({
          opponents: [
            { name: 'Rival', carClass: 'GT3', isAi: false },
            { name: 'Robot', carClass: 'GT3', isAi: true },
          ],
          contactByOpponent: { Nemesis: 3 },
        }),
        session({
          opponents: [{ name: 'Rival', carClass: 'GT3', isAi: false }],
          contactByOpponent: { Nemesis: 2, Rival: 1 },
        }),
      ],
      identity,
      null,
    );

    expect(aggregate.rivals.mostRaced.map((rival) => rival.name)).toEqual([
      'Rival',
    ]);
    expect(aggregate.rivals.nemeses[0]).toMatchObject({
      name: 'Nemesis',
      contacts: 5,
    });
  });

  it('scopes every figure to the active filter', () => {
    const sessions = [
      session({ setting: 'Multiplayer', classFinishPos: 1, carClass: 'GT3' }),
      session({ setting: 'Race Weekend', classFinishPos: 1, carClass: 'GT3' }),
      session({ setting: 'Multiplayer', classFinishPos: 1, carClass: 'Hyper' }),
    ];

    expect(buildCareerAggregate(sessions, identity, null).results.wins).toBe(3);
    expect(
      buildCareerAggregate(sessions, identity, null, {
        gameType: 'multiplayer',
      }).results.wins,
    ).toBe(2);
    expect(
      buildCareerAggregate(sessions, identity, null, {
        gameType: 'multiplayer',
        carClass: 'GT3',
      }).results.wins,
    ).toBe(1);
  });

  /*
   * Narrowing the view must never remove the way back out of it, so the choices
   * come from every session rather than the filtered ones.
   */
  it('offers filter choices from the whole career, not the filtered view', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ carClass: 'GT3', trackFolder: 'Monza_2023' }),
        session({ carClass: 'Hyper', trackFolder: 'Spa_2024' }),
      ],
      identity,
      null,
      { carClass: 'GT3' },
    );

    expect(aggregate.headline.sessions).toBe(1);
    expect(aggregate.filterOptions.carClasses).toEqual(['GT3', 'Hyper']);
    expect(aggregate.filterOptions.tracks).toHaveLength(2);
  });

  it('marks milestones as they were reached', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ startedAt: 100, lapsCompleted: 60, classFinishPos: 8 }),
        session({ startedAt: 200, lapsCompleted: 60, classFinishPos: 2 }),
        session({ startedAt: 300, lapsCompleted: 10, classFinishPos: 1 }),
      ],
      identity,
      null,
    );

    const byKey = new Map(
      aggregate.milestones.map((milestone) => [milestone.key, milestone]),
    );

    expect(byKey.get('first-session')?.achievedAt).toBe(100);
    expect(byKey.get('races-1')?.achievedAt).toBe(100);
    expect(byKey.get('laps-100')?.achievedAt).toBe(200);
    expect(byKey.get('first-podium')?.achievedAt).toBe(200);
    expect(byKey.get('first-win')?.achievedAt).toBe(300);
  });

  it('reads driver aids without treating the control mode as one', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ startedAt: 100, aids: 'PlayerControl,ABS=2,Clutch' }),
        session({ startedAt: 200, aids: 'PlayerControl,ABS=1' }),
      ],
      identity,
      null,
    );

    const aids = aggregate.activity.aidUsage.map((entry) => entry.aid);

    expect(aids).toContain('ABS=2');
    expect(aids).toContain('ABS=1');
    expect(aids).not.toContain('PlayerControl');
  });

  it('reports the best single-race comeback', () => {
    const aggregate = buildCareerAggregate(
      [
        session({ gridPos: 20, finishPos: 4 }),
        session({ gridPos: 3, finishPos: 2 }),
      ],
      identity,
      null,
    );

    expect(aggregate.results.bestComeback).toBe(16);
    expect(aggregate.results.netPositionsGained).toBe(17);
  });
});
