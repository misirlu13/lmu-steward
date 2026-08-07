import React from 'react';
import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { LiveSessionSummary } from '@types';
import { NavBar } from './NavBar';
import { sendMessage } from '../../utils/postMessage';

let mockIsViewHeaderAttached = false;

type ApiSubscriber = (data: unknown) => void;

const subscribers = new Map<string, Set<ApiSubscriber>>();
let mockLiveCaptureEnabled = false;

const emit = (channel: string, data: unknown) => {
  act(() => {
    subscribers.get(channel)?.forEach((subscriber) => subscriber(data));
  });
};

jest.mock('../../providers/ApiContext', () => ({
  useApi: () => ({
    isConnected: false,
    hasApiStatusResponse: false,
    liveSessionStatus: { state: 'detached' },
    liveCaptureEnabled: mockLiveCaptureEnabled,
    subscribeToApiChannel: (channel: string, callback: ApiSubscriber) => {
      if (!subscribers.has(channel)) {
        subscribers.set(channel, new Set());
      }
      subscribers.get(channel)?.add(callback);
      return () => {
        subscribers.get(channel)?.delete(callback);
      };
    },
  }),
}));

const capture = (
  overrides: Partial<LiveSessionSummary> = {},
): LiveSessionSummary => ({
  sessionKey: 'live|Sebring|1|1785798030000',
  trackName: 'Sebring International Raceway',
  sessionType: 'PRACTICE',
  session: 1,
  startedAt: 1785798030000,
  lastSeenAt: 1785798030000,
  driverCount: 22,
  incidentCount: 12,
  evidenceCount: 9,
  linkState: 'unlinked',
  ...overrides,
});

jest.mock('@/renderer/providers/NavbarContext', () => ({
  useNavbar: () => ({
    isViewHeaderAttached: mockIsViewHeaderAttached,
  }),
}));

const navigateMock = jest.fn();
let mockPathname = '/';

jest.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: mockPathname }),
}));

jest.mock('../../utils/postMessage', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../../utils/profileInitials', () => ({
  getProfileInitials: () => 'LS',
}));

jest.mock('@mui/material/AppBar', () => ({
  __esModule: true,
  default: ({
    sx,
    children,
  }: {
    sx?: { borderColor?: string };
    children: React.ReactNode;
  }) => (
    <div data-testid="app-bar" data-border-color={sx?.borderColor}>
      {children}
    </div>
  ),
}));

describe('NavBar', () => {
  const sendMessageMock = sendMessage as jest.MockedFunction<
    typeof sendMessage
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    subscribers.clear();
    mockLiveCaptureEnabled = false;
    (window as unknown as { electron?: unknown }).electron = {
      ipcRenderer: {
        on: jest.fn(() => jest.fn()),
      },
    };
  });

  it('keeps navbar border visible when view header is not attached', () => {
    mockIsViewHeaderAttached = false;
    render(<NavBar />);

    expect(
      screen.getByTestId('app-bar').getAttribute('data-border-color'),
    ).toBe('divider');
  });

  it('hides navbar border when view header is attached', () => {
    mockIsViewHeaderAttached = true;
    render(<NavBar />);

    expect(
      screen.getByTestId('app-bar').getAttribute('data-border-color'),
    ).toBe('transparent');
  });

  it('requests profile info on mount', () => {
    mockIsViewHeaderAttached = false;
    render(<NavBar />);

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.GET_PROFILE_INFO,
    );
  });

  /*
   * The driver dashboard is the landing page and the replay list moved to
   * /replays, so both have to stay reachable from the bar itself.
   */
  it('offers both the driver dashboard and the replay list', () => {
    mockIsViewHeaderAttached = false;
    mockPathname = '/';
    render(<NavBar />);

    screen.getByRole('button', { name: 'Driver' }).click();
    expect(navigateMock).toHaveBeenCalledWith('/');

    screen.getByRole('button', { name: 'Replays' }).click();
    expect(navigateMock).toHaveBeenCalledWith('/replays');
  });

  describe('captured sessions badge', () => {
    beforeEach(() => {
      mockIsViewHeaderAttached = false;
      mockPathname = '/';
      mockLiveCaptureEnabled = true;
    });

    it('asks for the captured session list on navigation', () => {
      render(<NavBar />);

      expect(sendMessageMock).toHaveBeenCalledWith(
        CONSTANTS.API.GET_LIVE_SESSIONS,
      );
    });

    it('badges captured sessions with a replay waiting to be confirmed', () => {
      render(<NavBar />);

      emit(CONSTANTS.API.GET_LIVE_SESSIONS, {
        status: 'success',
        data: [
          capture({ sessionKey: 'a', linkState: 'proposed' }),
          capture({ sessionKey: 'b', linkState: 'proposed' }),
          capture({ sessionKey: 'c', linkState: 'linked' }),
        ],
      });

      expect(
        screen.getByRole('button', {
          name: 'Captured (2 awaiting confirmation)',
        }),
      ).toBeInTheDocument();
    });

    /*
      An unlinked session is a normal resting state — a practice replay is
      often simply not kept — so a badge for it would be permanent and would
      teach the user to ignore the one that matters.
    */
    it('says nothing about sessions that are merely unlinked', () => {
      render(<NavBar />);

      emit(CONSTANTS.API.GET_LIVE_SESSIONS, {
        status: 'success',
        data: [capture({ sessionKey: 'a' }), capture({ sessionKey: 'b' })],
      });

      expect(
        screen.getByRole('button', { name: 'Captured' }),
      ).toBeInTheDocument();
    });

    // Confirming or dismissing replies with the fresh list, so the badge clears
    // without another round trip.
    it('follows a dismissal without asking again', () => {
      render(<NavBar />);

      emit(CONSTANTS.API.GET_LIVE_SESSIONS, {
        status: 'success',
        data: [capture({ sessionKey: 'a', linkState: 'proposed' })],
      });
      expect(
        screen.getByRole('button', {
          name: 'Captured (1 awaiting confirmation)',
        }),
      ).toBeInTheDocument();

      emit(CONSTANTS.API.POST_DISMISS_LIVE_SESSION_MATCH, {
        status: 'success',
        data: [capture({ sessionKey: 'a', linkState: 'unlinked' })],
      });

      expect(
        screen.getByRole('button', { name: 'Captured' }),
      ).toBeInTheDocument();
    });

    it('asks for nothing while live capture is off', () => {
      mockLiveCaptureEnabled = false;
      render(<NavBar />);

      expect(sendMessageMock).not.toHaveBeenCalledWith(
        CONSTANTS.API.GET_LIVE_SESSIONS,
      );
      expect(screen.queryByText('Captured')).not.toBeInTheDocument();
    });
  });
});
