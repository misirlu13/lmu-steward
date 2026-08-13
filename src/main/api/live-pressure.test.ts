import { LiveCaptureDriver } from '@types';
import {
  MIN_CLOSING_SPEED_KPH,
  PRESSURE_GAP_LIMIT_SECONDS,
  PRESSURE_GAP_RELEASE_SECONDS,
  deriveLivePressureBattles,
  resetLivePressureState,
} from './live-pressure';

const TRACK_LENGTH = 3590.4;

// The derivation carries smoothing state per pair, so each case starts clean.
beforeEach(() => {
  resetLivePressureState();
});

const car = (overrides: Partial<LiveCaptureDriver>): LiveCaptureDriver =>
  ({
    slotId: 1,
    steamId: '0',
    driverName: 'Driver',
    vehicleName: 'Car',
    vehicleClass: 'LMP2',
    place: 1,
    lapsCompleted: 1,
    lastLapTime: 90,
    timeBehindLeader: 0,
    lapsBehindLeader: 0,
    penalties: 0,
    inPits: false,
    control: 1,
    flag: 0,
    pitStops: 0,
    finishStatus: 0,
    lapDist: 0,
    speedKph: 180,
    ...overrides,
  }) as LiveCaptureDriver;

describe('deriveLivePressureBattles', () => {
  it('pairs a car with the one directly ahead on track', () => {
    // 25m at 180kph (50 m/s) is half a second.
    const battles = deriveLivePressureBattles(
      [car({ slotId: 1, lapDist: 1000 }), car({ slotId: 2, lapDist: 1025 })],
      TRACK_LENGTH,
    );

    expect(battles).toHaveLength(1);
    expect(battles[0].behindSlotId).toBe(1);
    expect(battles[0].aheadSlotId).toBe(2);
    expect(battles[0].gapSeconds).toBeCloseTo(0.5, 2);
  });

  it('pairs across the start line rather than dropping the battle', () => {
    // The chaser is 20m before the line; the leader is 5m past it.
    const battles = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: TRACK_LENGTH - 20 }),
        car({ slotId: 2, lapDist: 5 }),
      ],
      TRACK_LENGTH,
    );

    expect(battles).toHaveLength(1);
    expect(battles[0].behindSlotId).toBe(1);
    expect(battles[0].aheadSlotId).toBe(2);
    expect(battles[0].gapSeconds).toBeCloseTo(25 / 50, 2);
  });

  it('ignores cars too far apart to be interacting', () => {
    expect(
      deriveLivePressureBattles(
        [car({ slotId: 1, lapDist: 0 }), car({ slotId: 2, lapDist: 1500 })],
        TRACK_LENGTH,
      ),
    ).toEqual([]);
  });

  it('reports closing speed signed by who is faster', () => {
    const [battle] = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: 1000, speedKph: 200 }),
        car({ slotId: 2, lapDist: 1025, speedKph: 180 }),
      ],
      TRACK_LENGTH,
    );

    expect(battle.closingSpeedKph).toBeCloseTo(20, 1);
  });

  it('reports a negative closing speed when the chaser is dropping back', () => {
    const [battle] = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: 1000, speedKph: 170 }),
        car({ slotId: 2, lapDist: 1025, speedKph: 190 }),
      ],
      TRACK_LENGTH,
    );

    expect(battle.closingSpeedKph).toBeLessThan(0);
  });

  it('flags a cross-class pairing as traffic', () => {
    const [battle] = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: 1000, vehicleClass: 'Hypercar' }),
        car({ slotId: 2, lapDist: 1025, vehicleClass: 'LMGT3' }),
      ],
      TRACK_LENGTH,
    );

    expect(battle.isTraffic).toBe(true);
  });

  it('does not flag a same-class fight as traffic', () => {
    const [battle] = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: 1000, vehicleClass: 'LMP2' }),
        car({ slotId: 2, lapDist: 1025, vehicleClass: 'LMP2' }),
      ],
      TRACK_LENGTH,
    );

    expect(battle.isTraffic).toBe(false);
  });

  it('excludes cars in the pits', () => {
    expect(
      deriveLivePressureBattles(
        [
          car({ slotId: 1, lapDist: 1000 }),
          car({ slotId: 2, lapDist: 1025, inPits: true }),
        ],
        TRACK_LENGTH,
      ),
    ).toEqual([]);
  });

  /*
    A stationary car divides by a speed near zero and reports an enormous gap,
    which would then be filtered out inconsistently rather than never appearing.
  */
  it('excludes a crawling or stationary car', () => {
    expect(
      deriveLivePressureBattles(
        [
          car({ slotId: 1, lapDist: 1000, speedKph: 0 }),
          car({ slotId: 2, lapDist: 1025 }),
        ],
        TRACK_LENGTH,
      ),
    ).toEqual([]);
  });

  it('does not pair a lone car with itself around the lap', () => {
    expect(
      deriveLivePressureBattles(
        [car({ slotId: 1, lapDist: 1000 })],
        TRACK_LENGTH,
      ),
    ).toEqual([]);
  });

  it('returns nothing without a usable track length', () => {
    const field = [
      car({ slotId: 1, lapDist: 1000 }),
      car({ slotId: 2, lapDist: 1025 }),
    ];

    expect(deriveLivePressureBattles(field, 0)).toEqual([]);
    expect(deriveLivePressureBattles(field, Number.NaN)).toEqual([]);
  });

  it('orders the closest battle first', () => {
    const battles = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: 1000 }),
        car({ slotId: 2, lapDist: 1050 }),
        car({ slotId: 3, lapDist: 1060 }),
      ],
      TRACK_LENGTH,
    );

    expect(battles.length).toBeGreaterThan(1);
    expect(battles[0].gapSeconds).toBeLessThanOrEqual(battles[1].gapSeconds);
  });

  /*
    Classification order is useless here: practice and qualifying rank by best
    lap time, so the car classified behind may be anywhere on track.
  */
  it('ignores classification order entirely', () => {
    const battles = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: 1025, place: 20, timeBehindLeader: 90 }),
        car({ slotId: 2, lapDist: 1000, place: 1, timeBehindLeader: 0 }),
      ],
      TRACK_LENGTH,
    );

    expect(battles).toHaveLength(1);
    // Slot 2 is behind on track despite being classified first.
    expect(battles[0].behindSlotId).toBe(2);
    expect(battles[0].aheadSlotId).toBe(1);
  });

  it('keeps every gap within the advertised limit', () => {
    const battles = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: 0 }),
        car({ slotId: 2, lapDist: 30 }),
        car({ slotId: 3, lapDist: 400 }),
      ],
      TRACK_LENGTH,
    );

    battles.forEach((battle) => {
      expect(battle.gapSeconds).toBeLessThanOrEqual(PRESSURE_GAP_LIMIT_SECONDS);
    });
  });
});

describe('closing speed smoothing', () => {
  const field = (speedKph: number) => [
    car({ slotId: 1, lapDist: 1000, speedKph }),
    car({ slotId: 2, lapDist: 1025, speedKph: 180 }),
  ];

  it('reports the real value on first sight rather than easing up from zero', () => {
    const [battle] = deriveLivePressureBattles(field(200), TRACK_LENGTH, 1000);

    expect(battle.closingSpeedKph).toBeCloseTo(20, 1);
  });

  /*
    The reason this exists: two cars a second apart reach the same braking zone
    a second apart, so the raw figure swings tens of kph while the drivers are
    doing nothing unusual.
  */
  it('damps a one-tick spike instead of following it', () => {
    deriveLivePressureBattles(field(180), TRACK_LENGTH, 1000);
    const [battle] = deriveLivePressureBattles(field(280), TRACK_LENGTH, 2000);

    expect(battle.closingSpeedKph).toBeGreaterThan(0);
    expect(battle.closingSpeedKph).toBeLessThan(50);
  });

  it('still converges on a sustained change', () => {
    let last = 0;
    for (let t = 1000; t <= 21000; t += 1000) {
      const [battle] = deriveLivePressureBattles(field(220), TRACK_LENGTH, t);
      last = battle.closingSpeedKph;
    }

    expect(last).toBeCloseTo(40, 0);
  });

  it('does not carry a trend across a reset', () => {
    deriveLivePressureBattles(field(280), TRACK_LENGTH, 1000);
    resetLivePressureState();
    const [battle] = deriveLivePressureBattles(field(180), TRACK_LENGTH, 2000);

    expect(battle.closingSpeedKph).toBeCloseTo(0, 1);
  });

  it('is independent of how often it is called', () => {
    deriveLivePressureBattles(field(180), TRACK_LENGTH, 1000);
    const [slow] = deriveLivePressureBattles(field(280), TRACK_LENGTH, 4000);

    resetLivePressureState();
    deriveLivePressureBattles(field(180), TRACK_LENGTH, 1000);
    for (let t = 2000; t <= 4000; t += 1000) {
      deriveLivePressureBattles(field(280), TRACK_LENGTH, t);
    }
    const [fast] = deriveLivePressureBattles(field(280), TRACK_LENGTH, 4000);

    // Same elapsed time, different number of samples: within a few kph.
    expect(Math.abs(fast.closingSpeedKph - slow.closingSpeedKph)).toBeLessThan(
      6,
    );
  });
});

describe('membership hysteresis', () => {
  const pair = (gapMetres: number) => [
    car({ slotId: 1, lapDist: 1000, speedKph: 180 }),
    car({ slotId: 2, lapDist: 1000 + gapMetres, speedKph: 180 }),
  ];

  it('keeps a pair that drifts just past the entry limit', () => {
    // 100m at 50 m/s is 2.0s; 115m is 2.3s, inside the release limit.
    expect(
      deriveLivePressureBattles(pair(100), TRACK_LENGTH, 1000),
    ).toHaveLength(1);
    expect(
      deriveLivePressureBattles(pair(115), TRACK_LENGTH, 2000),
    ).toHaveLength(1);
  });

  it('drops a pair once it passes the release limit', () => {
    deriveLivePressureBattles(pair(100), TRACK_LENGTH, 1000);
    const gone = deriveLivePressureBattles(
      pair(PRESSURE_GAP_RELEASE_SECONDS * 50 + 20),
      TRACK_LENGTH,
      2000,
    );

    expect(gone).toEqual([]);
  });

  it('does not admit a new pair on the wider release limit', () => {
    // 115m is 2.3s: inside release, outside entry, and never seen before.
    expect(deriveLivePressureBattles(pair(115), TRACK_LENGTH, 1000)).toEqual(
      [],
    );
  });
});

/*
  What the pressure monitor renders beside the gap. Everything here is either a
  reading or `undefined` — a time-to-catch that cannot be computed is absent
  rather than negative, infinite, or a large number standing in for "never".
*/
describe('what a battle reports besides the gap', () => {
  it('carries the speed of both cars as read, unsmoothed', () => {
    const [battle] = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: 1000, speedKph: 212.4 }),
        car({ slotId: 2, lapDist: 1025, speedKph: 189.6 }),
      ],
      TRACK_LENGTH,
    );

    expect(battle.behindSpeedKph).toBe(212);
    expect(battle.aheadSpeedKph).toBe(190);
  });

  /*
    From the gap in metres over the closing rate, not from the gap in seconds.
    Those are different quantities: `gapSeconds` is how long the chaser takes to
    reach where the leader is *now*.

    50 m at 18 kph closing (5 m/s) is 10 s. The gap in seconds for the same pair
    is 1.0, so a formula that divided that by the closing speed would answer
    0.2 — plausible enough to ship and wrong by a factor of fifty.
  */
  it('derives time to catch from the distance, not from the gap in seconds', () => {
    const [battle] = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: 1000, speedKph: 180 }),
        car({ slotId: 2, lapDist: 1050, speedKph: 162 }),
      ],
      TRACK_LENGTH,
    );

    expect(battle.gapSeconds).toBeCloseTo(1.0, 2);
    expect(battle.closingSpeedKph).toBeCloseTo(18, 1);
    expect(battle.timeToCatchSeconds).toBeCloseTo(10, 1);
  });

  // A car dropping back is not going to catch anyone. `—`, not a negative.
  it('reports no time to catch for a car losing ground', () => {
    const [battle] = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: 1000, speedKph: 160 }),
        car({ slotId: 2, lapDist: 1025, speedKph: 200 }),
      ],
      TRACK_LENGTH,
    );

    expect(battle.closingSpeedKph).toBeLessThan(0);
    expect(battle.timeToCatchSeconds).toBeUndefined();
  });

  /*
    Two cars holding station. The arithmetic does not fail here, it just stops
    describing anything: at a fraction of a kph the answer is minutes, which is
    a number about float noise rather than about two drivers.
  */
  it('reports no time to catch below the minimum closing speed', () => {
    const [battle] = deriveLivePressureBattles(
      [
        car({ slotId: 1, lapDist: 1000, speedKph: 180 }),
        car({
          slotId: 2,
          lapDist: 1025,
          speedKph: 180 - MIN_CLOSING_SPEED_KPH / 2,
        }),
      ],
      TRACK_LENGTH,
    );

    expect(battle.closingSpeedKph).toBeGreaterThan(0);
    expect(battle.timeToCatchSeconds).toBeUndefined();
  });
});
