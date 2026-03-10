import { buildReplayStandings } from './replayStandings';

describe('replayStandings', () => {
  it('returns empty array when standings are empty', () => {
    const result = buildReplayStandings({
      standingsEntries: [],
      qualificationEntries: [],
      currentSessionLogData: null,
    });

    expect(result).toEqual([]);
  });

  it('builds standings row with incident counts and risk index', () => {
    const standingsEntries = [
      {
        driverName: 'Alex Driver',
        carNumber: '12',
        position: 1,
        bestLapTime: 100,
      },
    ];

    const qualificationEntries = [
      {
        driverName: 'Alex Driver',
        qualification: 2,
      },
    ];

    const currentSessionLogData = {
      Driver: [
        {
          Name: 'Alex Driver',
          CarNumber: '12',
          CarClass: 'LMP2',
          ClassPosition: 1,
          Position: 1,
          Laps: 5,
          IsPlayer: '0',
          SlotID: '44',
          ID: '77',
          Lap: [{ _: 99.5, num: 1, et: 100 }],
        },
      ],
      Stream: {
        TrackLimits: [{ Driver: 'Alex Driver' }],
        Penalty: [{ Driver: 'Alex Driver', Penalty: 'DT' }],
        Incident: [{ _: 'Alex Driver(12) with Bob Racer(88)', et: 150 }],
      },
    };

    const result = buildReplayStandings({
      standingsEntries,
      qualificationEntries,
      currentSessionLogData,
    });

    expect(result).toHaveLength(1);
    expect(result[0].driverName).toBe('Alex Driver');
    expect(result[0].startingPosition).toBe(2);
    expect(result[0].incidents).toBe(3);
    expect(result[0].riskIndex).toBe(18);
    expect(result[0].carClass).toBe('P2');
    expect(result[0].slotId).toBe('44');
    expect(result[0].driverSid).toBe('77');
  });

  it('falls back to standings data when no matched session driver exists', () => {
    const result = buildReplayStandings({
      standingsEntries: [
        {
          driverName: 'Ghost Driver',
          carNumber: '9',
          carClass: 'LMGT3',
          vehicleName: 'GT Car',
          teamName: 'Team X',
          position: 3,
          qualification: 4,
          lapsCompleted: 0,
        },
      ],
      qualificationEntries: [],
      currentSessionLogData: { Driver: [], Stream: {} },
    });

    expect(result).toHaveLength(1);
    expect(result[0].driverName).toBe('Ghost Driver');
    expect(result[0].position).toBe(3);
    expect(result[0].startingPosition).toBe(4);
    expect(result[0].carClass).toBe('GT3');
    expect(result[0].hasLapData).toBe(false);
  });
});
