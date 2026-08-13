import {
  LiveCaptureDriver,
  LiveIncidentContext,
  LiveIncidentFrame,
} from '@types';
import { daytonaContactContext } from './live-incident-context.fixture';
import {
  deriveIncidentEvidence,
  lapDistanceDelta,
  trackPositionLabel,
} from './live-incident-evidence';

const frame = (overrides: Partial<LiveIncidentFrame>): LiveIncidentFrame => ({
  t: 0,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  speed: 0,
  yaw: 0,
  throttle: 0,
  brake: 0,
  steering: 0,
  lapDist: 0,
  pathLateral: 0,
  trackEdge: 10,
  flag: 0,
  sector: 1,
  lap: 1,
  ...overrides,
});

const context = (
  overrides: Partial<LiveIncidentContext>,
): LiveIncidentContext => ({
  seq: 1,
  et: 100,
  trackLength: 5000,
  anchorErrorSeconds: 0,
  sectorFlags: [11, 11, 11],
  cars: [],
  ...overrides,
});

const driver = (slotId: number, vehicleClass: string): LiveCaptureDriver => ({
  slotId,
  steamId: `steam-${slotId}`,
  driverName: `Driver ${slotId}`,
  vehicleName: `#${slotId} Car`,
  vehicleClass,
  place: slotId,
  lapsCompleted: 1,
  lastLapTime: 90,
  timeBehindLeader: 0,
  lapsBehindLeader: 0,
  penalties: 0,
  inPits: false,
  control: 2,
  flag: 0,
  pitStops: 0,
  finishStatus: 0,
});

describe('deriveIncidentEvidence', () => {
  describe('against a real captured contact', () => {
    // Daytona, 2026-08-02. An LMP2 (44) catches a GT3 (19) under braking and
    // hits it — the multiclass traffic case the tool exists for.
    const evidence = deriveIncidentEvidence(daytonaContactContext, [
      driver(19, 'GT3'),
      driver(44, 'LMP2'),
    ]);

    it('should identify the leading car as the one ahead', () => {
      expect(evidence.aheadSlotId).toBe(19);
    });

    it('should report the cars converging rather than separating', () => {
      expect(evidence.closingSpeedKph).toBeGreaterThan(0);
    });

    it('should place both cars on track', () => {
      expect(evidence.offTrackSlotIds).toEqual([]);
    });

    it('should describe where on track it happened without inventing a corner name', () => {
      expect(evidence.trackPositionLabel).toBe(
        'Sector 3 · 3,808 m (66% of lap)',
      );
    });

    it('should recognise it as multiclass traffic', () => {
      expect(evidence.isTrafficIncident).toBe(true);
    });

    it('should report both cars hard on the brakes before contact', () => {
      evidence.cars.forEach((car) => {
        expect(car.brakeApplied?.seconds).toBeGreaterThan(0);
        expect(car.peakDecelMps2).toBeGreaterThan(0);
      });
    });

    it('should mark the leading car’s braking as a floor, since it predates the window', () => {
      const leader = evidence.cars.find((car) => car.slotId === 19);

      expect(leader?.brakeApplied).toEqual({ seconds: 2, truncated: true });
    });

    it('should report the following car’s braking as an exact figure', () => {
      const follower = evidence.cars.find((car) => car.slotId === 44);

      expect(follower?.brakeApplied?.truncated).toBe(false);
      expect(follower?.brakeApplied?.seconds).toBeCloseTo(1.46, 2);
    });

    it('should not claim a blue flag that was never shown', () => {
      evidence.cars.forEach((car) => {
        expect(car.blueFlagShown).toBeUndefined();
      });
    });
  });

  describe('closing speed', () => {
    const approaching = (speedA: number, speedB: number, gap: number) =>
      context({
        cars: [
          {
            slotId: 1,
            frames: [-0.4, -0.3, -0.2, -0.1].map((t) =>
              frame({ t, z: 0, vz: speedA, speed: speedA }),
            ),
          },
          {
            slotId: 2,
            frames: [-0.4, -0.3, -0.2, -0.1].map((t) =>
              frame({ t, z: -gap, vz: speedB, speed: speedB }),
            ),
          },
        ],
      });

    it('should be positive when the car behind is faster', () => {
      const evidence = deriveIncidentEvidence(approaching(40, 50, 10), []);
      // Car 2 is 10m behind on -z and closing at 10 m/s.
      expect(evidence.closingSpeedKph).toBeCloseTo(36, 1);
    });

    it('should be negative when the gap is opening', () => {
      const evidence = deriveIncidentEvidence(approaching(50, 40, 10), []);
      expect(evidence.closingSpeedKph).toBeCloseTo(-36, 1);
    });

    it('should be absent for a solo incident with only one car', () => {
      const evidence = deriveIncidentEvidence(
        context({ cars: [{ slotId: 1, frames: [frame({ t: 0 })] }] }),
        [],
      );

      expect(evidence.closingSpeedKph).toBeUndefined();
      expect(evidence.aheadSlotId).toBeUndefined();
    });
  });

  describe('off track', () => {
    it('should compare magnitudes, since both offsets are signed to the car side', () => {
      const evidence = deriveIncidentEvidence(
        context({
          cars: [
            // Well beyond a track edge that happens to be reported negative.
            {
              slotId: 1,
              frames: [frame({ t: 0, pathLateral: -9.4, trackEdge: -7.2 })],
            },
            {
              slotId: 2,
              frames: [frame({ t: 0, pathLateral: -3.5, trackEdge: -7.2 })],
            },
          ],
        }),
        [],
      );

      expect(evidence.offTrackSlotIds).toEqual([1]);
    });
  });

  describe('blue flag', () => {
    it('should measure how long blue had been shown continuously up to contact', () => {
      const evidence = deriveIncidentEvidence(
        context({
          cars: [
            {
              slotId: 1,
              frames: [
                frame({ t: -3, flag: 0 }),
                frame({ t: -2, flag: 6 }),
                frame({ t: -1, flag: 6 }),
                frame({ t: 0, flag: 6 }),
              ],
            },
          ],
        }),
        [],
      );

      expect(evidence.cars[0].blueFlagShown).toEqual({
        seconds: 2,
        truncated: false,
      });
    });

    it('should not count a blue flag that had already been withdrawn', () => {
      const evidence = deriveIncidentEvidence(
        context({
          cars: [
            {
              slotId: 1,
              frames: [frame({ t: -2, flag: 6 }), frame({ t: 0, flag: 0 })],
            },
          ],
        }),
        [],
      );

      expect(evidence.cars[0].blueFlagShown).toBeUndefined();
    });

    it('should mark a blue flag already shown at the oldest frame as a floor', () => {
      const evidence = deriveIncidentEvidence(
        context({
          cars: [
            {
              slotId: 1,
              frames: [frame({ t: -4, flag: 6 }), frame({ t: 0, flag: 6 })],
            },
          ],
        }),
        [],
      );

      expect(evidence.cars[0].blueFlagShown).toEqual({
        seconds: 4,
        truncated: true,
      });
    });
  });

  describe('class interaction', () => {
    it('should flag contact between different classes as traffic', () => {
      const evidence = deriveIncidentEvidence(
        context({
          cars: [
            { slotId: 1, frames: [frame({ t: 0 })] },
            { slotId: 2, frames: [frame({ t: 0, lapDist: 50 })] },
          ],
        }),
        [driver(1, 'Hyper'), driver(2, 'LMGT3')],
      );

      expect(evidence.isTrafficIncident).toBe(true);
    });

    it('should leave it undefined when a party is not in the standings', () => {
      const evidence = deriveIncidentEvidence(
        context({
          cars: [
            { slotId: 1, frames: [frame({ t: 0 })] },
            { slotId: 2, frames: [frame({ t: 0, lapDist: 50 })] },
          ],
        }),
        [driver(1, 'Hyper')],
      );

      expect(evidence.isTrafficIncident).toBeUndefined();
    });
  });
});

describe('lapDistanceDelta', () => {
  it('should return a plain difference away from the start/finish line', () => {
    expect(lapDistanceDelta(3000, 2950, 5000)).toBe(50);
  });

  it('should fold a wrap across the line back into a small lead', () => {
    // 20m past the line versus 30m before it: 50m ahead, not a lap behind.
    expect(lapDistanceDelta(20, 4970, 5000)).toBe(50);
  });

  it('should fold a wrap the other way', () => {
    expect(lapDistanceDelta(4970, 20, 5000)).toBe(-50);
  });
});

describe('trackPositionLabel', () => {
  it("should translate LMU's sector encoding, where 0 means sector 3", () => {
    expect(trackPositionLabel(frame({ sector: 0, lapDist: 2500 }), 5000)).toBe(
      'Sector 3 · 2,500 m (50% of lap)',
    );
  });

  it('should omit the sector when the car has none reported', () => {
    expect(trackPositionLabel(frame({ sector: -1, lapDist: 1200 }), 5000)).toBe(
      '1,200 m (24% of lap)',
    );
  });

  it('should degrade to bare distance when track length is unknown', () => {
    expect(trackPositionLabel(frame({ sector: 1, lapDist: 1200 }), 0)).toBe(
      'Sector 1 · 1,200 m',
    );
  });
});
