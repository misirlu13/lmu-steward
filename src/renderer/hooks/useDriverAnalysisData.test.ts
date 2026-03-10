import { renderHook } from '@testing-library/react';
import { LMUReplay } from '@types';
import { useDriverAnalysisData } from './useDriverAnalysisData';
import { ReplayDriverStanding } from '../components/Replay/ReplayDriverStandings';
import { ReplayIncidentEvent } from '../components/Replay/ReplayMasterIncidentTimeline';

describe('useDriverAnalysisData', () => {
  const baseDriver = {
    driverName: 'Driver A',
    driverId: '111',
    position: 1,
    carClass: 'GT3',
    fastestLap: '1:30.000',
    incidents: 0,
    riskIndex: 0,
  } as unknown as ReplayDriverStanding;

  it('falls back to route incidents and keeps only selected driver incidents when session data is unavailable', () => {
    const routeIncidents = [
      {
        id: 'collision-1',
        type: 'collision',
        timestampLabel: '00:00:10',
        lapLabel: 'Lap 1',
        drivers: [{ displayName: 'Driver A', carNumber: '12', carClass: 'GT3' }],
      },
      {
        id: 'penalty-1',
        type: 'penalty',
        timestampLabel: '00:00:20',
        lapLabel: 'Lap 1',
        drivers: [{ displayName: 'Driver B', carNumber: '99', carClass: 'P2' }],
      },
    ] as unknown as ReplayIncidentEvent[];

    const { result } = renderHook(() =>
      useDriverAnalysisData({
        currentReplay: null,
        driver: baseDriver,
        routeIncidents,
        selectedIncidentTypes: ['collision'],
        activeIncidentId: null,
      }),
    );

    expect(result.current.incidents).toHaveLength(1);
    expect(result.current.incidents[0].id).toBe('collision-1');
    expect(result.current.filteredIncidents).toHaveLength(1);
    expect(result.current.filteredIncidents[0].type).toBe('collision');
  });

  it('builds timeline incidents from session stream and computes lap/fault outputs for selected driver', () => {
    const currentReplay = {
      metadata: { session: 'RACE' },
      logData: {
        Race: {
          Driver: [
            {
              Name: 'Driver A',
              ID: '111',
              CarNumber: '12',
              CarClass: 'GT3',
              IsPlayer: '0',
              Lap: [
                { num: 1, _: 90.0, p: 1, et: 90 },
                { num: 2, _: 91.2, p: 2, et: 181 },
              ],
            },
            {
              Name: 'Driver B',
              ID: '222',
              CarNumber: '99',
              CarClass: 'LMP2',
              IsPlayer: '1',
            },
          ],
          Stream: {
            TrackLimits: [
              {
                Driver: 'Driver A',
                ID: '111',
                et: 95,
                _: 'Warning',
                WarningPoints: '1',
                CurrentPoints: '1',
              },
            ],
            Penalty: [
              {
                Driver: 'Driver A',
                ID: '111',
                et: 100,
                Lap: 2,
                Penalty: 'Drive Through',
                Reason: 'Cut Track',
                _: 'Drive Through',
              },
            ],
            Incident: [
              {
                et: 110,
                _: 'Driver A(12) with Driver B(99) reported contact (150.0)',
              },
              {
                et: 120,
                _: 'Driver C(10) with Driver D(11) reported contact (20.0)',
              },
            ],
          },
        },
      },
    } as unknown as LMUReplay;

    const { result } = renderHook(() =>
      useDriverAnalysisData({
        currentReplay,
        driver: baseDriver,
        selectedIncidentTypes: ['collision', 'track-limit', 'penalty'],
        activeIncidentId: null,
      }),
    );

    expect(result.current.incidents.map((entry) => entry.type)).toEqual([
      'track-limit',
      'penalty',
      'collision',
    ]);
    expect(result.current.selectedDriverIsAi).toBe(true);
    expect(result.current.faultTotalIncidents).toBe(3);
    expect(result.current.topPenaltyReasonText).toContain('Cut Track');

    const lap2Row = result.current.lapBreakdownRows.find((entry) => entry.lapNumber === 2);
    expect(lap2Row).toBeTruthy();
    expect(lap2Row?.hasTrackLimit).toBe(true);
    expect(lap2Row?.hasIncident).toBe(true);
    expect(lap2Row?.penaltyLabel).toBe('DRIVE THROUGH');
  });
});
