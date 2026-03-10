import {
  buildReplayAvailableClasses,
  buildReplayDriverCoverageNote,
  buildReplayDurationLabel,
  buildReplayLapsCompletion,
  buildReplaySessionTypeColor,
  buildReplaySessionTypeLabel,
  buildReplaySummaryClassCounts,
  buildReplayWeather,
  computeReplayIncidentScorePerDriver,
} from './replaySummaryViewModel';

describe('replaySummaryViewModel', () => {
  it('builds class counts from standings entries', () => {
    const result = buildReplaySummaryClassCounts([
      { carClass: 'P2' },
      { carClass: 'P2' },
      { carClass: 'GT3' },
      {},
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        { label: 'P2', value: 2 },
        { label: 'GT3', value: 1 },
        { label: 'Unknown', value: 1 },
      ]),
    );
  });

  it('formats lap completion with and without valid max laps', () => {
    expect(
      buildReplayLapsCompletion({
        lapsCompleted: 20,
        maximumLaps: 40,
      }),
    ).toEqual({
      lapsCompletedLabel: '20/40',
      lapsCompletionPercent: 50,
    });

    expect(
      buildReplayLapsCompletion({
        lapsCompleted: 20,
        maximumLaps: 0,
      }),
    ).toEqual({
      lapsCompletedLabel: '20',
      lapsCompletionPercent: 0,
    });
  });

  it('builds duration label and incident score per driver', () => {
    expect(buildReplayDurationLabel(65)).toBe('00:01:05');
    expect(
      computeReplayIncidentScorePerDriver({
        totalIncidents: 12,
        driverCount: 3,
      }),
    ).toBe(4);
    expect(
      computeReplayIncidentScorePerDriver({
        totalIncidents: 12,
        driverCount: 0,
      }),
    ).toBe(12);
  });

  it('builds driver coverage note only for partial coverage', () => {
    expect(
      buildReplayDriverCoverageNote({
        standingsDriverCount: 10,
        sessionDrivers: [{}, {}, {}],
      }),
    ).toBe('Showing 3 of 10 drivers with lap-level log data.');

    expect(
      buildReplayDriverCoverageNote({
        standingsDriverCount: 3,
        sessionDrivers: [{}, {}, {}],
      }),
    ).toBeUndefined();
  });

  it('builds weather model and session badge values', () => {
    expect(
      buildReplayWeather({
        raining: 0,
        darkCloud: 0.7,
        ambientTemp: 18.4,
        trackTemp: 24.2,
        windSpeed: { velocity: 11.7 },
      }),
    ).toEqual({
      condition: 'cloudy',
      lowTempC: 18,
      highTempC: 24,
      wind: '12 km/h',
    });

    const labelMap = { RACE: 'Race', QUALIFY: 'Qualifying' };
    const colorMap = { RACE: 'error.main' };

    expect(
      buildReplaySessionTypeLabel({
        sessionType: 'RACE',
        sessionTypeLabelMap: labelMap,
      }),
    ).toBe('Race');
    expect(
      buildReplaySessionTypeLabel({
        sessionType: 'UNKNOWN',
        sessionTypeLabelMap: labelMap,
      }),
    ).toBe('Practice');
    expect(
      buildReplaySessionTypeColor({
        sessionType: 'RACE',
        sessionTypeColorMap: colorMap,
      }),
    ).toBe('error.main');
    expect(
      buildReplaySessionTypeColor({
        sessionType: undefined,
        sessionTypeColorMap: colorMap,
      }),
    ).toBe('success.main');
  });

  it('builds available classes from standings and timeline events', () => {
    const result = buildReplayAvailableClasses({
      standings: [
        { carClass: 'P2' },
        { carClass: 'GT3' },
        { carClass: 'P2' },
        { carClass: '' },
      ],
      timelineEvents: [
        {
          drivers: [{ carClass: 'GT3' }, { carClass: 'HY' }],
        },
        {
          drivers: [{ carClass: undefined }],
        },
      ],
    });

    expect(result).toEqual(['P2', 'GT3', 'HY']);
  });
});
