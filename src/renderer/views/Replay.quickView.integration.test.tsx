import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { ReplayView } from './Replay';
import { useApi } from '../providers/ApiContext';
import { sendMessage } from '../utils/postMessage';

jest.mock('../providers/ApiContext', () => ({
  useApi: jest.fn(),
}));

jest.mock('../utils/postMessage', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../components/Replay/ReplayJumpBar', () => ({
  ReplayJumpBar: () => <div data-testid="replay-jump-bar" />,
}));

jest.mock('../components/Common/ViewHeader', () => ({
  ViewHeader: ({
    breadcrumb,
    title,
    subtitle,
    actions,
  }: {
    breadcrumb: React.ReactNode;
    title: React.ReactNode;
    subtitle: React.ReactNode;
    actions: React.ReactNode;
  }) => (
    <div data-testid="view-header">
      <div>{breadcrumb}</div>
      <div>{title}</div>
      <div>{subtitle}</div>
      <div>{actions}</div>
    </div>
  ),
}));

jest.mock('../components/Common/ReplaySubtitle', () => ({
  ReplaySubtitle: () => <div data-testid="replay-subtitle" />,
}));

jest.mock('../components/Replay/ReplayActions', () => ({
  ReplayActions: () => <div data-testid="replay-actions" />,
}));

jest.mock('../components/Replay/ReplayLoadingScreen', () => ({
  ReplayLoadingScreen: () => <div data-testid="replay-loading-screen" />,
}));

jest.mock('../components/Replay/ReplayChat', () => ({
  ReplayChat: () => <div data-testid="replay-chat" />,
}));

jest.mock('../components/Replay/ReplaySummary', () => ({
  ReplaySummary: ({
    isQuickViewModeActive,
  }: {
    isQuickViewModeActive?: boolean;
  }) => (
    <div data-testid="replay-summary">
      quick-view:{String(isQuickViewModeActive)}
    </div>
  ),
}));

jest.mock('../components/Replay/ReplayMasterIncidentTimeline', () => ({
  ReplayMasterIncidentTimeline: () => (
    <div data-testid="master-incident-timeline" />
  ),
}));

jest.mock('../components/Replay/ReplayDriverStandings', () => ({
  ReplayDriverStandings: () => <div data-testid="driver-standings" />,
}));

jest.mock('../components/Replay/ReplayIncidentHeatmap', () => ({
  ReplayIncidentHeatmap: () => <div data-testid="incident-heatmap" />,
}));

describe('ReplayView quick view integration', () => {
  const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
  const sendMessageMock = sendMessage as jest.MockedFunction<
    typeof sendMessage
  >;

  const replayRecord = {
    hash: 'hash-1',
    metadata: {
      sceneDesc: 'SEBRINGWEC',
      session: 'RACE',
    },
    timestamp: 1_741_040_000,
    logData: {
      TrackLength: 5000,
      Race: {
        MostLapsCompleted: 0,
        Driver: [],
        Stream: {
          Score: [{ et: 0 }],
        },
      },
    },
  } as const;

  /*
    Only the fields this view reads. `liveSessionStatus` is one of them: View
    Replay is gated on it, because loading a replay takes over the game.
  */
  const mockApi = (overrides: Record<string, unknown>) => {
    useApiMock.mockReturnValue({
      currentReplay: null,
      currentTrackMap: null,
      isConnected: true,
      hasApiStatusResponse: true,
      liveSessionStatus: { state: 'detached' },
      replays: { status: 'success', data: [replayRecord] },
      subscribeToApiChannel: jest.fn(() => () => {}),
      ...overrides,
    } as unknown as ReturnType<typeof useApi>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderReplay = () => {
    render(
      <MemoryRouter initialEntries={['/replay/hash-1']}>
        <Routes>
          <Route path="/" element={<div data-testid="dashboard-route" />} />
          <Route path="/replay/:replayHash" element={<ReplayView />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('shows quick view messaging when replay is not yet loaded', () => {
    mockApi({
      loadingState: { loading: false, percentage: 0 },
      isReplayActive: false,
      quickViewEnabled: true,
    });

    renderReplay();

    expect(
      screen.getByText(
        /Quick View is enabled\. Replay playback-dependent data is limited/i,
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('replay-summary').textContent).toContain(
      'quick-view:true',
    );
  });

  it('keeps full replay mode active when replay is already active for this route', () => {
    mockApi({
      currentReplay: replayRecord,
      loadingState: { loading: false, percentage: -1 },
      isReplayActive: true,
      quickViewEnabled: true,
    });

    renderReplay();

    expect(
      screen.queryByText(
        /Quick View is enabled\. Replay playback-dependent data is limited/i,
      ),
    ).toBeNull();
    expect(screen.getByTestId('replay-summary').textContent).toContain(
      'quick-view:false',
    );
  });

  /*
   * The breadcrumb navigates and nothing more. A steward moving between the
   * analysis and the list expects to come back to it — which is what the
   * "still loaded in Le Mans Ultimate" banner on the list is there to offer.
   */
  it('leaves the replay loaded when the replays breadcrumb is clicked', () => {
    mockApi({
      currentReplay: replayRecord,
      loadingState: { loading: false, percentage: -1 },
      isReplayActive: true,
      quickViewEnabled: true,
    });

    renderReplay();

    fireEvent.click(screen.getByText('Replays'));

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      CONSTANTS.API.POST_CLOSE_REPLAY,
    );
  });

  /*
    Quick View's whole purpose is that the replay is not loaded yet, so this is
    the one place a steward can ask for it mid-race. Loading it calls
    /rest/watch/play, which takes over the running session.
  */
  it('will not load the replay from Quick View while a session is live', () => {
    mockApi({
      loadingState: { loading: false, percentage: 0 },
      isReplayActive: false,
      quickViewEnabled: true,
      liveSessionStatus: { state: 'live', trackName: 'Sebring' },
    });

    renderReplay();

    expect(screen.getByText('View Replay').closest('button')).toBeDisabled();
  });

  it('offers the Quick View load when no session is running', () => {
    mockApi({
      loadingState: { loading: false, percentage: 0 },
      isReplayActive: false,
      quickViewEnabled: true,
    });

    renderReplay();

    expect(screen.getByText('View Replay').closest('button')).toBeEnabled();
  });
});
