import {
  deriveReplayHeatmapWorldSpots,
  resolveReplayHeatmapWorldSpots,
} from './replayHeatmapWorldSpots';

describe('replayHeatmapWorldSpots', () => {
  it('returns empty when required inputs are invalid', () => {
    expect(
      deriveReplayHeatmapWorldSpots({
        timelineEvents: [],
        heatmapTrackPoints: [],
        trackLengthMeters: 5000,
      }),
    ).toEqual([]);
  });

  it('maps explicit and fallback event distances onto the track polyline', () => {
    const result = deriveReplayHeatmapWorldSpots({
      timelineEvents: [
        {
          id: 'a',
          timestampLabel: '00:00:10',
          lapLabel: '1',
          type: 'collision',
          drivers: [],
          distanceMeters: 500,
          heatmapSeverity: 'critical',
        },
        {
          id: 'b',
          timestampLabel: '00:00:05',
          lapLabel: '1',
          type: 'track-limit',
          drivers: [],
          etSeconds: 5,
        },
        {
          id: 'c',
          timestampLabel: '00:00:10',
          lapLabel: '1',
          type: 'penalty',
          drivers: [],
          etSeconds: 10,
          heatmapSeverity: 'minor',
        },
      ],
      heatmapTrackPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 0 },
      ],
      trackLengthMeters: 1000,
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ x: 50, z: 0, size: 36, severity: 'critical' });
    expect(result[1]).toMatchObject({ x: 50, z: 0, size: 28, severity: 'serious' });
    expect(result[2]).toMatchObject({ x: 0, z: 0, size: 20, severity: 'minor' });
  });

  it('prefers valid source world spots and normalizes malformed fields', () => {
    const result = resolveReplayHeatmapWorldSpots({
      sourceWorldSpots: [
        {
          id: 123,
          x: '10',
          z: 20,
          size: '30',
          severity: 'invalid-severity',
        },
      ],
      fallbackWorldSpots: [
        { id: 'fallback', x: 1, z: 2, size: 24, severity: 'minor' },
      ],
    });

    expect(result).toEqual([
      {
        id: '123',
        x: 10,
        z: 20,
        size: 30,
        severity: 'serious',
      },
    ]);
  });

  it('uses fallback world spots when source spots are missing or invalid', () => {
    const fallback = [{ id: 'fallback', x: 1, z: 2, size: 24, severity: 'minor' as const }];

    const emptySource = resolveReplayHeatmapWorldSpots({
      sourceWorldSpots: null,
      fallbackWorldSpots: fallback,
    });

    const invalidSource = resolveReplayHeatmapWorldSpots({
      sourceWorldSpots: [{ x: 'not-a-number', z: 2, size: 24 }],
      fallbackWorldSpots: fallback,
    });

    expect(emptySource).toEqual(fallback);
    expect(invalidSource).toEqual(fallback);
  });
});
