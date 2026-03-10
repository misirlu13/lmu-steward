import {
  getTrackMapBounds,
  normalizeTrackWorldPointToSvg,
  trackMapToSVG,
  TrackPoints,
} from './trackMapToSVG';

describe('trackMapToSVG', () => {
  const samplePoints: TrackPoints[] = Array.from({ length: 40 }, (_, index) => ({
    x: index * 3,
    y: 0,
    z: index * 0.1,
  }));

  describe('getTrackMapBounds', () => {
    it('returns null for invalid point arrays', () => {
      expect(getTrackMapBounds([])).toBeNull();
      expect(getTrackMapBounds([{ x: 1, y: 0, z: 1 }])).toBeNull();
      expect(getTrackMapBounds(null as unknown as TrackPoints[])).toBeNull();
    });

    it('returns min/max bounds for valid points', () => {
      const bounds = getTrackMapBounds(samplePoints);

      expect(bounds).not.toBeNull();
      expect(bounds?.minX).toBe(0);
      expect(bounds?.maxX).toBe(117);
      expect(bounds?.minY).toBe(0);
      expect(bounds?.maxY).toBeCloseTo(3.9, 4);
    });
  });

  describe('normalizeTrackWorldPointToSvg', () => {
    it('returns null when bounds are degenerate', () => {
      expect(
        normalizeTrackWorldPointToSvg(
          { x: 10, z: 10 },
          { minX: 5, maxX: 5, minY: 1, maxY: 10 },
        ),
      ).toBeNull();
    });

    it('maps world point into viewBox coordinates', () => {
      const point = normalizeTrackWorldPointToSvg(
        { x: 50, z: 50 },
        { minX: 0, maxX: 100, minY: 0, maxY: 100 },
        1000,
        50,
      );

      expect(point).not.toBeNull();
      expect(point?.x).toBeCloseTo(500, 1);
      expect(point?.y).toBeCloseTo(500, 1);
    });
  });

  describe('trackMapToSVG', () => {
    it('returns empty svg when there are not enough points', () => {
      const svg = trackMapToSVG([{ x: 1, y: 0, z: 1 }]);
      expect(svg).toContain('<svg');
      expect(svg).not.toContain('<path d="M');
    });

    it('builds svg path for valid points', () => {
      const svg = trackMapToSVG(samplePoints, {
        stroke: 'red',
        strokeWidth: 6,
        viewBoxSize: 800,
      });

      expect(svg).toContain('<svg');
      expect(svg).toContain('<path d="M');
      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="6"');
      expect(svg).toContain('viewBox="0 0 800 800"');
    });

    it('filters non-primary points by type', () => {
      const pointsWithPit = [
        ...samplePoints,
        { x: 10, y: 0, z: 10, type: 1 } as unknown as TrackPoints,
      ];
      const svg = trackMapToSVG(pointsWithPit);

      expect(svg).toContain('<path d="M');
      expect(svg).toContain('stroke="white"');
    });
  });
});
