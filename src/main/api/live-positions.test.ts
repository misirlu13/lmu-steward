import { extractLiveCarPositions } from './live-positions';

/**
 * A `/rest/watch/standings` row, cut down to the fields the reducer reads.
 *
 * Shaped after the real response captured in `session.ts`, including the two
 * things about it that matter here: `slotID` is present on every row, and
 * `carNumber` is the empty string on every row — which is why the join cannot
 * use it.
 */
const row = (
  slotID: number,
  driverName: string,
  x: number,
  z: number,
): Record<string, unknown> => ({
  carClass: 'GTE',
  carId: '53d85638b7751fbbdde040bc605c78ee54fc5f29',
  carNumber: '',
  carPosition: { type: -1, x, y: -1.28, z },
  driverName,
  lapDistance: 105.3,
  slotID,
  vehicleName: "D'station Racing #777:LM",
});

describe('extractLiveCarPositions', () => {
  it('should reduce a standings response to slot, name and world position', () => {
    expect(
      extractLiveCarPositions([
        row(0, 'R Mueller', 26.767839431762695, -213.39881896972656),
        row(7, 'Florian Strack', 62.89253616333008, -207.99468994140625),
      ]),
    ).toEqual([
      { slotId: 0, driverName: 'R Mueller', x: 26.8, z: -213.4 },
      { slotId: 7, driverName: 'Florian Strack', x: 62.9, z: -208 },
    ]);
  });

  /*
    The slot is the key and there is no fallback. A row without one cannot be
    joined to anything, and guessing from the array index is exactly the
    assumption the driver-name check downstream exists to catch.
  */
  it('should drop a row with no slot id', () => {
    const [withSlot, withoutSlot] = [
      row(3, 'Craig ORorke', 10, 20),
      row(4, 'Jarrod Swaine', 30, 40),
    ];
    delete withoutSlot.slotID;

    expect(extractLiveCarPositions([withSlot, withoutSlot])).toHaveLength(1);
  });

  /*
    A car with no position is not a car at the origin. LMU has been observed
    omitting fields the SDK header promises, so this is the shape a missing
    reading actually arrives in.
  */
  it('should drop a row with no usable position rather than defaulting it', () => {
    const missing = row(1, 'Daniel Galvan', 0, 0);
    missing.carPosition = null;
    const partial = row(2, 'Niki Johnston', 0, 0);
    partial.carPosition = { type: -1, x: 38.9 };

    expect(
      extractLiveCarPositions([missing, partial, row(5, 'A', 1, 2)]),
    ).toEqual([{ slotId: 5, driverName: 'A', x: 1, z: 2 }]);
  });

  it('should keep a genuine zero coordinate', () => {
    expect(extractLiveCarPositions([row(0, 'R Mueller', 0, 0)])).toEqual([
      { slotId: 0, driverName: 'R Mueller', x: 0, z: 0 },
    ]);
  });

  // The name only exists to be checked against the sidecar's; a row that
  // carries none must still place its car, it just cannot be verified.
  it('should tolerate a missing driver name', () => {
    const nameless = row(9, '', 5, 6);
    delete nameless.driverName;

    expect(extractLiveCarPositions([nameless])).toEqual([
      { slotId: 9, driverName: '', x: 5, z: 6 },
    ]);
  });

  it.each([[null], [undefined], [{}], ['not an array']])(
    'should answer with nothing for %p',
    (payload) => {
      expect(extractLiveCarPositions(payload)).toEqual([]);
    },
  );
});
