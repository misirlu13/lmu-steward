import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DriverAnalysisView } from './DriverAnalysis';
import { CONSTANTS } from '@constants';
import { useApi } from '../providers/ApiContext';
import { useDriverAnalysisData } from '../hooks/useDriverAnalysisData';
import { jumpToIncidentInReplay } from '../utils/replayCommands';
import { ReplayDriverStanding } from '../components/Replay/ReplayDriverStandings';
import { sendMessage } from '../utils/postMessage';

jest.mock('../providers/ApiContext', () => ({
  useApi: jest.fn(),
}));

jest.mock('../hooks/useDriverAnalysisData', () => ({
  useDriverAnalysisData: jest.fn(),
}));

jest.mock('../utils/replayCommands', () => ({
  jumpToIncidentInReplay: jest.fn(),
}));

jest.mock('../utils/postMessage', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../components/Common/ViewHeader', () => ({
  ViewHeader: ({
    breadcrumb,
    title,
    subtitle,
  }: {
    breadcrumb: React.ReactNode;
    title: React.ReactNode;
    subtitle: React.ReactNode;
  }) => (
    <div data-testid="driver-analysis-header">
      <div>{breadcrumb}</div>
      <div>{title}</div>
      <div>{subtitle}</div>
    </div>
  ),
}));

jest.mock('../components/DriverAnalysis/DriverOverviewCard', () => ({
  DriverOverviewCard: () => <div data-testid="driver-overview" />,
}));

jest.mock('../components/DriverAnalysis/DriverPerformanceMetricsCard', () => ({
  DriverPerformanceMetricsCard: () => <div data-testid="driver-performance" />,
}));

jest.mock('../components/DriverAnalysis/DriverFaultAnalysisCard', () => ({
  DriverFaultAnalysisCard: () => <div data-testid="driver-fault" />,
}));

jest.mock('../components/DriverAnalysis/LapByLapPerformanceBreakdown', () => ({
  LapByLapPerformanceBreakdown: () => <div data-testid="lap-breakdown" />,
}));

jest.mock('../components/Replay/ReplayJumpBar', () => ({
  ReplayJumpBar: () => <div data-testid="replay-jump-controls" />,
}));

describe('DriverAnalysisView integration', () => {
  const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
  const useDriverAnalysisDataMock =
    useDriverAnalysisData as jest.MockedFunction<typeof useDriverAnalysisData>;
  const jumpToIncidentInReplayMock =
    jumpToIncidentInReplay as jest.MockedFunction<typeof jumpToIncidentInReplay>;
  const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

  const incident = {
    id: 'incident-1',
    type: 'collision' as const,
    timestampLabel: '00:00:10',
    lapLabel: 'Lap 1',
    drivers: [{ displayName: 'Driver One', carNumber: '12', carClass: 'GT3' }],
    description: 'Collision Event',
  } as unknown as ReplayDriverStanding;

  const routeDriver = {
    driverName: 'Driver One',
    driverId: '44',
    driverSid: '10044',
    slotId: '42',
    carClass: 'GT3',
    fastestLap: '1:40.000',
    incidents: 1,
    riskIndex: 20,
  } as unknown as ReplayDriverStanding;

  const renderView = (quickViewEnabled: boolean, isReplayActive: boolean | null) => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/driver/hash-1/44',
            state: {
              replayTitle: 'Replay Session',
              driver: routeDriver,
              incidents: [incident],
            },
          },
        ]}
      >
        <Routes>
          <Route path="/" element={<div data-testid="dashboard-route" />} />
          <Route
            path="/replay/:replayHash"
            element={<div data-testid="replay-route" />}
          />
          <Route path="/driver/:replayHash/:driverId" element={<DriverAnalysisView />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();

    useDriverAnalysisDataMock.mockReturnValue({
      incidents: [incident],
      filteredIncidents: [incident],
      activeIncident: incident,
      selectedDriverIsAi: false,
      faultIncidentSummary: [],
      faultRiskIndex: 0,
      faultDominantType: null,
      faultTotalIncidents: 0,
      faultDominantPercent: 0,
      faultCollisionStats: { subjectPct: 0, secondaryPct: 0 },
      topCounterpartyText: '--',
      topPenaltyReasonText: '--',
      lapBreakdownRows: [],
    } as unknown as ReturnType<typeof useDriverAnalysisData>);

    jumpToIncidentInReplayMock.mockImplementation(() => undefined);
  });

  it('jumps replay with selected driver identity when viewing an incident in full mode', () => {
    useApiMock.mockReturnValue({
      currentReplay: { hash: 'hash-1' },
      isReplayActive: true,
      quickViewEnabled: false,
    } as unknown as ReturnType<typeof useApi>);

    renderView(false, true);

    fireEvent.click(screen.getByRole('button', { name: /view/i }));

    expect(jumpToIncidentInReplayMock).toHaveBeenCalledWith(incident, {
      driverName: 'Driver One',
      driverId: '44',
      driverSid: '10044',
      slotId: '42',
    });
    expect(screen.getByTestId('replay-jump-controls')).toBeTruthy();
  });

  it('does not trigger replay jump in quick view mode and shows quick view notice', () => {
    useApiMock.mockReturnValue({
      currentReplay: { hash: 'hash-1' },
      isReplayActive: false,
      quickViewEnabled: true,
    } as unknown as ReturnType<typeof useApi>);

    renderView(true, false);

    fireEvent.click(screen.getByRole('button', { name: /view/i }));

    expect(jumpToIncidentInReplayMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Quick View is enabled\. Replay playback actions are unavailable/i),
    ).toBeTruthy();
    expect(screen.queryByTestId('replay-jump-controls')).toBeNull();
  });

  it('returns to dashboard when dashboard breadcrumb is clicked', () => {
    useApiMock.mockReturnValue({
      currentReplay: { hash: 'hash-1' },
      isReplayActive: true,
      quickViewEnabled: false,
    } as unknown as ReturnType<typeof useApi>);

    renderView(false, true);

    fireEvent.click(screen.getByText('Dashboard'));

    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.POST_CLOSE_REPLAY);
  });

  it('navigates back to replay when session analysis breadcrumb is clicked', () => {
    useApiMock.mockReturnValue({
      currentReplay: { hash: 'hash-1' },
      isReplayActive: true,
      quickViewEnabled: false,
    } as unknown as ReturnType<typeof useApi>);

    renderView(false, true);

    fireEvent.click(screen.getByText('Session Analysis'));

    expect(screen.getByTestId('replay-route')).toBeTruthy();
  });
});
