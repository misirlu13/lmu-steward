import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ReplayView } from './Replay';
import { useApi } from '../providers/ApiContext';
import { useNavbar } from '../providers/NavbarContext';

jest.mock('../providers/ApiContext', () => ({
  useApi: jest.fn(),
}));

jest.mock('../providers/NavbarContext', () => ({
  useNavbar: jest.fn(),
}));

jest.mock('../utils/postMessage', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../components/Replay/ReplayJumpBar', () => ({
  ReplayJumpBar: () => <div data-testid="replay-jump-bar" />,
}));

jest.mock('../components/Common/ViewHeader', () => ({
  ViewHeader: ({
    title,
    subtitle,
    actions,
  }: {
    title: React.ReactNode;
    subtitle: React.ReactNode;
    actions: React.ReactNode;
  }) => (
    <div data-testid="view-header">
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
  ReplaySummary: ({ isQuickViewModeActive }: { isQuickViewModeActive?: boolean }) => (
    <div data-testid="replay-summary">quick-view:{String(isQuickViewModeActive)}</div>
  ),
}));

jest.mock('../components/Replay/ReplayMasterIncidentTimeline', () => ({
  ReplayMasterIncidentTimeline: () => <div data-testid="master-incident-timeline" />,
}));

jest.mock('../components/Replay/ReplayDriverStandings', () => ({
  ReplayDriverStandings: () => <div data-testid="driver-standings" />,
}));

jest.mock('../components/Replay/ReplayIncidentHeatmap', () => ({
  ReplayIncidentHeatmap: () => <div data-testid="incident-heatmap" />,
}));

describe('ReplayView quick view integration', () => {
  const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
  const useNavbarMock = useNavbar as jest.MockedFunction<typeof useNavbar>;

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

  beforeEach(() => {
    jest.clearAllMocks();
    useNavbarMock.mockReturnValue({
      setContent: jest.fn(),
    } as unknown as ReturnType<typeof useNavbar>);
  });

  const renderReplay = () => {
    render(
      <MemoryRouter initialEntries={['/replay/hash-1']}>
        <Routes>
          <Route path="/replay/:replayHash" element={<ReplayView />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('shows quick view messaging when replay is not yet loaded', () => {
    useApiMock.mockReturnValue({
      currentReplay: null,
      currentTrackMap: null,
      loadingState: { loading: false, percentage: 0 },
      isReplayActive: false,
      quickViewEnabled: true,
      replays: { status: 'success', data: [replayRecord] },
      subscribeToApiChannel: jest.fn(() => () => {}),
    } as unknown as ReturnType<typeof useApi>);

    renderReplay();

    expect(
      screen.getByText(/Quick View is enabled\. Replay playback-dependent data is limited/i),
    ).toBeTruthy();
    expect(screen.getByTestId('replay-summary').textContent).toContain(
      'quick-view:true',
    );
  });

  it('keeps full replay mode active when replay is already active for this route', () => {
    useApiMock.mockReturnValue({
      currentReplay: replayRecord,
      currentTrackMap: null,
      loadingState: { loading: false, percentage: -1 },
      isReplayActive: true,
      quickViewEnabled: true,
      replays: { status: 'success', data: [replayRecord] },
      subscribeToApiChannel: jest.fn(() => () => {}),
    } as unknown as ReturnType<typeof useApi>);

    renderReplay();

    expect(
      screen.queryByText(/Quick View is enabled\. Replay playback-dependent data is limited/i),
    ).toBeNull();
    expect(screen.getByTestId('replay-summary').textContent).toContain(
      'quick-view:false',
    );
  });
});
