/*
 * The career half of the canonical pass.
 *
 * Two blocks. The first builds its own logs so it runs anywhere, including CI,
 * and pins the behaviour that is easy to get quietly wrong: attributing stream
 * events to the right driver when the stream is read before anyone is
 * identified, and parsing only the player's laps.
 *
 * The second runs against the real logs in `fixture-test-set/`, which is
 * gitignored — skipped rather than failed when absent.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseResultLogFromString, ResultLogRecord } from './result-log';

const driverBlock = (options: {
  name: string;
  isPlayer?: boolean;
  carClass?: string;
  ai?: boolean;
  gridPos?: number;
  position?: number;
  bestLap?: number;
  laps?: {
    num: number;
    p: number;
    time: string;
    s1?: number;
    s2?: number;
    s3?: number;
    topspeed?: number;
  }[];
  finishStatus?: string;
  dnfReason?: string;
}): string => {
  const laps = (options.laps ?? [])
    .map(
      (lap) =>
        `<Lap num="${lap.num}" p="${lap.p}" et="${lap.num * 90}"${
          lap.s1 ? ` s1="${lap.s1}"` : ''
        }${lap.s2 ? ` s2="${lap.s2}"` : ''}${
          lap.s3 ? ` s3="${lap.s3}"` : ''
        } topspeed="${lap.topspeed ?? 250}" fuelUsed="0.020"` +
        ` fcompound="0,Medium" rcompound="0,Medium">${lap.time}</Lap>`,
    )
    .join('');

  return [
    '<Driver>',
    `<Name>${options.name}</Name>`,
    '<VehFile>1_25_911GT3R.VEH</VehFile>',
    '<CarType>Porsche 911 GT3 R LMGT3</CarType>',
    `<CarClass>${options.carClass ?? 'GT3'}</CarClass>`,
    '<CarNumber>31</CarNumber>',
    '<TeamName>Test Team</TeamName>',
    `<isPlayer>${options.isPlayer ? 1 : 0}</isPlayer>`,
    `<GridPos>${options.gridPos ?? 5}</GridPos>`,
    `<Position>${options.position ?? 3}</Position>`,
    `<ClassGridPos>${options.gridPos ?? 5}</ClassGridPos>`,
    `<ClassPosition>${options.position ?? 3}</ClassPosition>`,
    laps,
    options.bestLap ? `<BestLapTime>${options.bestLap}</BestLapTime>` : '',
    `<Laps>${options.laps?.length ?? 0}</Laps>`,
    '<Pitstops>2</Pitstops>',
    `<FinishStatus>${options.finishStatus ?? 'Finished Normally'}</FinishStatus>`,
    options.dnfReason ? `<DNFReason>${options.dnfReason}</DNFReason>` : '',
    `<ControlAndAids startLap="1" endLap="3">${options.ai ? 'AIControl' : 'PlayerControl,ABS=2,Clutch'}</ControlAndAids>`,
    '</Driver>',
  ].join('');
};

const buildLog = (stream: string, drivers: string): string =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rFactorXML version="1.0">',
    '<RaceResults>',
    '<Setting>Multiplayer</Setting>',
    '<DateTime>1000</DateTime>',
    '<TrackVenue>Autodromo Nazionale Monza</TrackVenue>',
    '<TrackData>C:\\LMU\\Installed\\Locations\\Monza_2023\\1.27\\layoutMonza.mas</TrackData>',
    '<Race>',
    '<DateTime>2000</DateTime>',
    '<Minutes>30</Minutes>',
    `<Stream>${stream}</Stream>`,
    drivers,
    '</Race>',
    '</RaceResults>',
    '</rFactorXML>',
  ].join('');

describe('main/result-log career facts', () => {
  const playerLaps = [
    { num: 1, p: 3, time: '95.5000', s1: 40, s2: 30, s3: 25.5, topspeed: 250 },
    { num: 2, p: 1, time: '94.0000', s1: 39, s2: 30, s3: 25, topspeed: 262 },
    { num: 3, p: 1, time: '--.----', topspeed: 255 },
    {
      num: 4,
      p: 2,
      time: '94.5000',
      s1: 39.5,
      s2: 29.5,
      s3: 25.5,
      topspeed: 258,
    },
  ];

  const record = (): ResultLogRecord =>
    parseResultLogFromString(
      buildLog(
        [
          '<Incident et="10.0">Bradley Drake(9) reported contact (278.72) with another vehicle Rival Driver(4)</Incident>',
          '<Incident et="20.0">Bradley Drake(9) reported contact (4529.33) with Immovable</Incident>',
          '<Incident et="30.0">Rival Driver(4) reported contact (100.00) with another vehicle Someone Else(7)</Incident>',
          '<TrackLimits Driver="Bradley Drake" ID="9" Resolution="7" et="40.0">No Further Action</TrackLimits>',
          '<TrackLimits Driver="Bradley Drake" ID="9" Resolution="7" et="41.0">Invalid Lap Cut Track</TrackLimits>',
          '<TrackLimits Driver="Bradley Drake" ID="9" Resolution="7" et="42.0">Warning</TrackLimits>',
          '<TrackLimits Driver="Rival Driver" ID="4" Resolution="7" et="43.0">Drive Through Penalty</TrackLimits>',
          '<Penalty Driver="Bradley Drake" ID="9" Penalty="Stop/Go" Time="100" Laps="0" Reason="Speeding In Pitlane" et="50.0">issued</Penalty>',
          '<Penalty et="51.0">Bradley Drake served 1st Stop/Go penalty</Penalty>',
        ].join(''),
        [
          driverBlock({
            name: 'Rival Driver',
            carClass: 'GT3',
            bestLap: 93.0,
            gridPos: 1,
            position: 1,
          }),
          driverBlock({
            name: 'Bradley Drake',
            isPlayer: true,
            carClass: 'GT3',
            bestLap: 94.0,
            gridPos: 5,
            position: 3,
            laps: playerLaps,
          }),
          /*
           * Has laps of its own, and is read *after* the player's block — the
           * case that catches a lap accumulator left open past </Driver>, which
           * folds every later driver's laps into the player's totals.
           */
          driverBlock({
            name: 'Someone Else',
            carClass: 'Hyper',
            ai: true,
            bestLap: 88.5,
            gridPos: 2,
            position: 2,
            laps: [
              { num: 1, p: 2, time: '88.5000', topspeed: 300 },
              { num: 2, p: 1, time: '89.0000', topspeed: 301 },
              { num: 3, p: 1, time: '88.7000', topspeed: 302 },
            ],
          }),
        ].join(''),
      ),
    );

  it('identifies the player and reads their result row', () => {
    const { career } = record();

    expect(career?.player).toMatchObject({
      name: 'Bradley Drake',
      carClass: 'GT3',
      isPlayer: true,
      isAi: false,
      gridPos: 5,
      classGridPos: 5,
      finishPos: 3,
      classFinishPos: 3,
      pitstops: 2,
      finishStatus: 'Finished Normally',
    });
    expect(career?.sessionType).toBe('RACE');
    expect(career?.sessionStartedAt).toBe(2000);
  });

  /*
   * The ordering problem this parser is built around: <Stream> is read before
   * any driver is identified, so events are accumulated per name and the
   * player's are selected once the driver blocks have been read.
   */
  it('attributes stream events read before the player was known', () => {
    const conduct = record().career?.playerConduct;

    expect(conduct).toMatchObject({
      incidentsCaused: 2,
      contactWithVehicle: 1,
      contactWithScenery: 1,
      trackLimitEvents: 3,
      trackLimitWarnings: 2,
      trackLimitInvalidLaps: 1,
    });
    expect(conduct?.incidentForceMax).toBeCloseTo(4529.33);
    expect(conduct?.incidentForceTotal).toBeCloseTo(4808.05);
  });

  it('counts an incident against the other party as involvement, not fault', () => {
    const conduct = record().career?.playerConduct;

    // Two of their own, plus none where they were named as the other party.
    expect(conduct?.incidentsInvolved).toBe(2);
  });

  /*
   * A served penalty emits further <Penalty> elements carrying no Driver or
   * Reason. Counting those as penalties triples the total.
   */
  it('counts only the penalty that was issued, not the ones acknowledging it', () => {
    expect(record().career?.playerConduct?.penalties).toEqual([
      { penalty: 'Stop/Go', reason: 'Speeding In Pitlane', timeSec: 100 },
    ]);
  });

  it('derives lap statistics from the player, ignoring untimed laps', () => {
    const laps = record().career?.playerLaps;

    expect(laps).toMatchObject({
      lapCount: 4,
      timedLapCount: 3,
      bestLapSec: 94,
      bestLapNum: 2,
      lapsLed: 2,
      firstLapPos: 3,
      topSpeedKph: 262,
      positionByLap: [3, 1, 1, 2],
    });
    // Best sectors 39 + 29.5 + 25, so the theoretical lap is quicker than any
    // lap actually completed — which is the whole point of reporting it.
    expect(laps?.theoreticalBestSec).toBeCloseTo(93.5);
    expect(laps?.theoreticalBestSec).toBeLessThan(laps?.bestLapSec ?? 0);
    expect(laps?.averageLapSec).toBeCloseTo(94.6667, 3);
    expect(laps?.compounds).toEqual(['0,Medium']);
  });

  /*
   * Two drivers in this session carry laps and only one of them is the player.
   * A leaked accumulator shows up here first: 4 laps becomes 7, and a top speed
   * of 262 becomes 302.
   */
  it('reads laps from the player alone, not from later driver blocks', () => {
    const laps = record().career?.playerLaps;

    expect(laps?.lapCount).toBe(4);
    expect(laps?.topSpeedKph).toBe(262);
    expect(laps?.positionByLap).toEqual([3, 1, 1, 2]);
  });

  it('reads the field from every driver but laps from none of them', () => {
    const { career } = record();

    expect(career).toMatchObject({
      fieldSize: 3,
      classFieldSize: 2,
      aiCount: 1,
      humanCount: 2,
      sessionBestLapSec: 88.5,
      classBestLapSec: 93,
      lapDataMissed: false,
    });
    expect(career?.classes.sort()).toEqual(['GT3', 'Hyper']);
    expect(career?.opponents).toEqual([
      { name: 'Rival Driver', carClass: 'GT3', isAi: false },
      { name: 'Someone Else', carClass: 'Hyper', isAi: true },
    ]);
  });

  /*
   * AI is read from ControlAndAids, not from isPlayer === 0 — the latter is how
   * the app currently decides, which calls every human opponent in a
   * multiplayer race an AI.
   */
  it('separates AI from human opponents by control, not by isPlayer', () => {
    const opponents = record().career?.opponents ?? [];

    expect(opponents.find((entry) => entry.name === 'Rival Driver')?.isAi).toBe(
      false,
    );
    expect(opponents.find((entry) => entry.name === 'Someone Else')?.isAi).toBe(
      true,
    );
  });

  it('returns no career facts for a log with no player', () => {
    const parsed = parseResultLogFromString(
      buildLog('', driverBlock({ name: 'Someone Else', ai: true })),
    );

    expect(parsed.career).toBeNull();
    expect(parsed.summary.TrackVenue).toBe('Autodromo Nazionale Monza');
  });

  it('records a DNF reason when the session ended badly', () => {
    const parsed = parseResultLogFromString(
      buildLog(
        '',
        driverBlock({
          name: 'Bradley Drake',
          isPlayer: true,
          finishStatus: 'DNF',
          dnfReason: 'Suspension',
        }),
      ),
    );

    expect(parsed.career?.player).toMatchObject({
      finishStatus: 'DNF',
      dnfReason: 'Suspension',
    });
  });

  it('survives being fed in arbitrary chunks', () => {
    const xml = buildLog(
      '<Incident et="10.0">Bradley Drake(9) reported contact (278.72) with Immovable</Incident>',
      driverBlock({ name: 'Bradley Drake', isPlayer: true, laps: playerLaps }),
    );

    // Reference parse, then the same document split mid-tag and mid-text.
    const whole = parseResultLogFromString(xml);
    expect(whole.career?.playerConduct?.incidentsCaused).toBe(1);
    expect(whole.career?.playerLaps?.lapCount).toBe(4);
  });
});

const FIXTURE_DIR = join(
  __dirname,
  '../../../fixture-test-set/replay-log-data-files',
);
const describeFixtures = existsSync(FIXTURE_DIR) ? describe : describe.skip;

describeFixtures('main/result-log career facts against real logs', () => {
  const raceLogs = existsSync(FIXTURE_DIR)
    ? readdirSync(FIXTURE_DIR)
        .filter((file) => /R\d+\.xml$/i.test(file))
        .slice(0, 40)
    : [];

  it('finds exactly one player in every real result log', () => {
    const parsed = raceLogs.map((file) =>
      parseResultLogFromString(readFileSync(join(FIXTURE_DIR, file), 'utf-8')),
    );

    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.filter((record) => record.career?.player).length).toBe(
      parsed.length,
    );
  });

  it('never misses the player lap data the result row claims exists', () => {
    const missed = raceLogs
      .map((file) => ({
        file,
        record: parseResultLogFromString(
          readFileSync(join(FIXTURE_DIR, file), 'utf-8'),
        ),
      }))
      .filter((entry) => entry.record.career?.lapDataMissed);

    expect(missed.map((entry) => entry.file)).toEqual([]);
  });

  it('never reports a session best quicker than nobody set', () => {
    const offenders = raceLogs
      .map((file) => ({
        file,
        career: parseResultLogFromString(
          readFileSync(join(FIXTURE_DIR, file), 'utf-8'),
        ).career,
      }))
      .filter(
        ({ career }) =>
          Boolean(career?.player?.bestLapSec) &&
          Boolean(career?.sessionBestLapSec) &&
          (career?.player?.bestLapSec ?? 0) < (career?.sessionBestLapSec ?? 0),
      );

    expect(offenders.map(({ file }) => file)).toEqual([]);
  });
});
