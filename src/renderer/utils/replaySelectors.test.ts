import {
  extractHeatmapSpots,
  extractQualificationEntries,
  extractStandingsEntries,
  extractTrackMapPoints,
} from './replaySelectors';

describe('replaySelectors', () => {
  describe('extractStandingsEntries', () => {
    it('prefers root array when standings data is already an array', () => {
      const entries = [{ id: 1 }];
      expect(extractStandingsEntries(entries)).toBe(entries);
    });

    it('falls back to entries then data arrays', () => {
      const byEntries = { entries: [{ id: 'a' }] };
      const byData = { data: [{ id: 'b' }] };

      expect(extractStandingsEntries(byEntries)).toBe(byEntries.entries);
      expect(extractStandingsEntries(byData)).toBe(byData.data);
      expect(extractStandingsEntries({})).toEqual([]);
    });
  });

  describe('extractQualificationEntries', () => {
    it('extracts qualification arrays from supported shapes', () => {
      const qualificationArray = [{ id: 1 }];
      const qualificationEntries = { qualification: { entries: [{ id: 2 }] } };
      const qualificationData = { qualification: { data: [{ id: 3 }] } };

      expect(extractQualificationEntries({ qualification: qualificationArray })).toBe(
        qualificationArray,
      );
      expect(extractQualificationEntries(qualificationEntries)).toBe(
        qualificationEntries.qualification.entries,
      );
      expect(extractQualificationEntries(qualificationData)).toBe(
        qualificationData.qualification.data,
      );
      expect(extractQualificationEntries({})).toEqual([]);
    });
  });

  describe('extractTrackMapPoints', () => {
    it('uses the first available points array source in priority order', () => {
      const pointsFromRoot = [{ x: 1, y: 2, z: 3 }];
      const pointsFromPoints = { points: [{ x: 4, y: 5, z: 6 }] };

      expect(extractTrackMapPoints(pointsFromRoot)).toEqual(pointsFromRoot);
      expect(extractTrackMapPoints(pointsFromPoints)).toEqual(pointsFromPoints.points);
    });

    it('filters out non-racing path points and invalid coordinates', () => {
      const source = {
        trackMap: [
          { x: 1, y: 2, z: 3, type: 0 },
          { x: 1, y: 2, z: 3, type: '0' },
          { x: 1, y: 2, z: 3, type: 1 },
          { x: Number.NaN, y: 2, z: 3, type: 0 },
        ],
      };

      expect(extractTrackMapPoints(source)).toEqual([
        { x: 1, y: 2, z: 3, type: 0 },
        { x: 1, y: 2, z: 3, type: '0' },
      ]);
    });
  });

  describe('extractHeatmapSpots', () => {
    it('returns heatmap spots only when source value is an array', () => {
      const spots = [{ x: 10, y: 20 }];
      expect(extractHeatmapSpots({ heatmapSpots: spots })).toBe(spots);
      expect(extractHeatmapSpots({ heatmapSpots: {} })).toEqual([]);
      expect(extractHeatmapSpots(undefined)).toEqual([]);
    });
  });
});
