import { LiveCarPosition } from '@types';
import {
  LiveCarPositionMap,
  mergeLiveCarPositions,
} from './useLiveCarPositions';
import { LiveStanding } from '../components/Live/liveFixtures';

const standing = (
  slotId: number | undefined,
  displayName: string,
  posX?: number,
  posZ?: number,
): LiveStanding => ({
  steamId: slotId === undefined ? displayName : `slot-${slotId}`,
  slotId,
  position: 1,
  classPosition: 1,
  displayName,
  carNumber: '7',
  carClass: 'HY',
  gapToLeader: '—',
  interval: '—',
  lastLap: '—',
  lastSectors: [undefined, undefined, undefined],
  bestLap: '—',
  bestLapSectors: [undefined, undefined, undefined],
  outstandingPenalties: 0,
  trackLimitStrikes: 0,
  incidentCount: 0,
  inPits: false,
  pitStatus: 'TRK',
  posX,
  posZ,
});

const feed = (...positions: LiveCarPosition[]): LiveCarPositionMap =>
  new Map(positions.map((position) => [position.slotId, position]));

describe('mergeLiveCarPositions', () => {
  it('should write the fast position over the slow one when the rosters agree', () => {
    const field = [standing(3, 'R Mueller', 10, 20)];

    const merged = mergeLiveCarPositions(
      field,
      feed({ slotId: 3, driverName: 'R Mueller', x: 100, z: 200 }),
    );

    expect(merged.fromFastFeed).toBe(1);
    expect(merged.standings[0]).toMatchObject({ posX: 100, posZ: 200 });
    // Everything else about the row still comes from the 1 Hz feed.
    expect(merged.standings[0].displayName).toBe('R Mueller');
  });

  /*
    The failure this whole design exists to prevent, and the one a fixture
    cannot produce honestly: `slotID` in the REST rows and `slotId` from the
    sidecar are the same number in a session nobody has left, and diverge once a
    slot is vacated. If they diverge, the names disagree — and the wrong
    coordinates must not be written, because a car drawn confidently in the
    wrong place is worse than a car drawn a second late in the right one.
  */
  it('should refuse a position whose driver name disagrees with the sidecar', () => {
    const field = [standing(3, 'R Mueller', 10, 20)];

    const merged = mergeLiveCarPositions(
      field,
      feed({ slotId: 3, driverName: 'Florian Strack', x: 100, z: 200 }),
    );

    expect(merged.fromFastFeed).toBe(0);
    expect(merged.standings[0]).toMatchObject({ posX: 10, posZ: 20 });
  });

  /*
    A whole field of mismatches is the join being systematically wrong — REST
    keying on the array index rather than on `mID`, say. Every car keeps its
    1 Hz position, and `fromFastFeed` reads zero so the panel can say the fast
    feed is not in use rather than claiming a rate it is not delivering.
  */
  it('should fall back to the slow feed entirely when no name matches', () => {
    const field = [
      standing(0, 'R Mueller', 1, 2),
      standing(1, 'Daniel Galvan', 3, 4),
    ];

    const merged = mergeLiveCarPositions(
      field,
      feed(
        { slotId: 0, driverName: 'Daniel Galvan', x: 90, z: 90 },
        { slotId: 1, driverName: 'Niki Johnston', x: 91, z: 91 },
      ),
    );

    expect(merged.fromFastFeed).toBe(0);
    // The same array, so nothing downstream re-renders for a feed it rejected.
    expect(merged.standings).toBe(field);
  });

  it('should place the cars it can verify and leave the rest on the slow feed', () => {
    const field = [
      standing(0, 'R Mueller', 1, 2),
      standing(1, 'Daniel Galvan', 3, 4),
    ];

    const merged = mergeLiveCarPositions(
      field,
      feed(
        { slotId: 0, driverName: 'R Mueller', x: 90, z: 90 },
        { slotId: 1, driverName: 'Somebody Else', x: 91, z: 91 },
      ),
    );

    expect(merged.fromFastFeed).toBe(1);
    expect(merged.standings[0]).toMatchObject({ posX: 90, posZ: 90 });
    expect(merged.standings[1]).toMatchObject({ posX: 3, posZ: 4 });
  });

  // Whitespace and case only. Anything more generous would paper over the very
  // disagreement the check is here to notice.
  it('should match names that differ only in case and padding', () => {
    const merged = mergeLiveCarPositions(
      [standing(2, "Craig O'Rorke")],
      feed({ slotId: 2, driverName: "  craig o'rorke ", x: 7, z: 8 }),
    );

    expect(merged.fromFastFeed).toBe(1);
  });

  it('should leave a car with no slot alone', () => {
    const field = [standing(undefined, 'Fixture Driver', 5, 6)];

    const merged = mergeLiveCarPositions(
      field,
      feed({ slotId: 0, driverName: 'Fixture Driver', x: 90, z: 90 }),
    );

    expect(merged.fromFastFeed).toBe(0);
    expect(merged.standings).toBe(field);
  });

  /*
    The game closing empties the feed. The rows keep whatever the sidecar last
    said, which is the honest 1 Hz answer, and the map says nothing about 5 Hz.
  */
  it('should return the field untouched when the feed is empty', () => {
    const field = [standing(0, 'R Mueller', 1, 2)];

    expect(mergeLiveCarPositions(field, new Map())).toEqual({
      standings: field,
      fromFastFeed: 0,
    });
  });
});
