import React, { useEffect, useState } from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { ApiProvider, useApi } from './ApiContext';
import { initializeMessageBus, sendMessage } from '../utils/postMessage';

jest.mock('../utils/postMessage', () => ({
  initializeMessageBus: jest.fn(),
  sendMessage: jest.fn(),
}));

describe('ApiContext integration', () => {
  const initializeMessageBusMock = initializeMessageBus as jest.MockedFunction<
    typeof initializeMessageBus
  >;
  const sendMessageMock = sendMessage as jest.MockedFunction<
    typeof sendMessage
  >;

  let handlers: Record<string, (data: unknown) => void> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = {};

    initializeMessageBusMock.mockImplementation((messageBusHandlers) => {
      handlers = messageBusHandlers as Record<string, (data: unknown) => void>;
    });
  });

  const TestConsumer = () => {
    const {
      isConnected,
      quickViewEnabled,
      isReplaySyncInProgress,
      replaySyncStatus,
      hasApiStatusResponse,
      markReplayCacheResetRequired,
      requestReplays,
      subscribeToApiChannel,
    } = useApi();
    const [sessionInfoStatus, setSessionInfoStatus] = useState('none');
    const [liveDriverCount, setLiveDriverCount] = useState('none');

    useEffect(() => {
      return subscribeToApiChannel(
        CONSTANTS.API.GET_SESSION_INFO,
        (data: unknown) => {
          const payload = data as { status?: string } | null;
          setSessionInfoStatus(String(payload?.status ?? 'unknown'));
        },
      );
    }, [subscribeToApiChannel]);

    useEffect(() => {
      return subscribeToApiChannel(
        CONSTANTS.API.GET_LIVE_SESSION_DATA,
        (data: unknown) => {
          const payload = data as { data?: { drivers?: unknown[] } } | null;
          setLiveDriverCount(
            String(payload?.data?.drivers?.length ?? 'unknown'),
          );
        },
      );
    }, [subscribeToApiChannel]);

    return (
      <>
        <div data-testid="connected">{String(isConnected)}</div>
        <div data-testid="quick-view">{String(quickViewEnabled)}</div>
        <div data-testid="syncing">{String(isReplaySyncInProgress)}</div>
        <div data-testid="sync-progress">
          {String(replaySyncStatus.percentage)}
        </div>
        <div data-testid="sync-counts">
          {`${replaySyncStatus.processed}/${replaySyncStatus.total}`}
        </div>
        <div data-testid="api-status-response">
          {String(hasApiStatusResponse)}
        </div>
        <div data-testid="session-info-status">{sessionInfoStatus}</div>
        <div data-testid="live-driver-count">{liveDriverCount}</div>
        <button type="button" onClick={markReplayCacheResetRequired}>
          mark replay cache reset
        </button>
        <button type="button" onClick={() => requestReplays()}>
          request replays
        </button>
        <button
          type="button"
          onClick={() => requestReplays({ gameType: 'multiplayer' })}
        >
          request multiplayer replays
        </button>
      </>
    );
  };

  it('initializes message bus and polls initial channels', async () => {
    render(
      <ApiProvider>
        <TestConsumer />
      </ApiProvider>,
    );

    expect(initializeMessageBusMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        CONSTANTS.API.GET_API_STATUS,
      );
      expect(sendMessageMock).toHaveBeenCalledWith(
        CONSTANTS.API.GET_USER_SETTINGS,
      );
    });
  });

  // The message bus only dispatches channels that appear in the handler map, so
  // a channel the provider itself holds no state for still needs an entry. The
  // Live view went blank against a real session because this one was missing:
  // main replied, and the reply was received and dropped.
  it('delivers live session data to a subscriber', async () => {
    render(
      <ApiProvider>
        <TestConsumer />
      </ApiProvider>,
    );

    expect(handlers[CONSTANTS.API.GET_LIVE_SESSION_DATA]).toBeDefined();

    act(() => {
      handlers[CONSTANTS.API.GET_LIVE_SESSION_DATA]?.({
        status: 'success',
        data: {
          status: { state: 'live' },
          drivers: [{}, {}, {}],
          incidents: [],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('live-driver-count').textContent).toBe('3');
    });
  });

  it('handles API status and user settings updates through IPC handlers', async () => {
    render(
      <ApiProvider>
        <TestConsumer />
      </ApiProvider>,
    );

    act(() => {
      handlers[CONSTANTS.API.GET_API_STATUS]?.({
        status: 'success',
        data: {
          loadingStatus: {
            loading: false,
            percentage: 1,
          },
        },
      });

      handlers[CONSTANTS.API.GET_USER_SETTINGS]?.({
        status: 'success',
        data: {
          quickViewEnabled: true,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('true');
      expect(screen.getByTestId('quick-view').textContent).toBe('true');
      expect(screen.getByTestId('api-status-response').textContent).toBe(
        'true',
      );
    });
  });

  it('tracks replay sync lifecycle and dispatches subscribed channel callbacks', async () => {
    render(
      <ApiProvider>
        <TestConsumer />
      </ApiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /request replays/i }));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        CONSTANTS.API.GET_REPLAYS,
        undefined,
      );
      expect(screen.getByTestId('syncing').textContent).toBe('true');
    });

    act(() => {
      handlers[CONSTANTS.API.PUSH_REPLAY_SYNC_STATUS]?.({
        status: 'in-progress',
        percentage: 0.5,
        processed: 5,
        total: 10,
      });

      handlers[CONSTANTS.API.GET_REPLAYS]?.({
        status: 'success',
        data: [],
      });

      handlers[CONSTANTS.API.GET_SESSION_INFO]?.({
        status: 'success',
        data: {
          maximumLaps: 20,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('syncing').textContent).toBe('false');
      expect(screen.getByTestId('sync-progress').textContent).toBe('1');
      expect(screen.getByTestId('sync-counts').textContent).toBe('5/10');
      expect(screen.getByTestId('session-info-status').textContent).toBe(
        'success',
      );
    });
  });

  it('applies forceReplayCacheReset once when marked in provider state', async () => {
    render(
      <ApiProvider>
        <TestConsumer />
      </ApiProvider>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /mark replay cache reset/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /request replays/i }));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.GET_REPLAYS, {
        forceReplayCacheReset: true,
      });
    });

    act(() => {
      handlers[CONSTANTS.API.GET_REPLAYS]?.({
        status: 'success',
        data: [],
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /request replays/i }));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        CONSTANTS.API.GET_REPLAYS,
        undefined,
      );
    });
  });

  it('forwards game type replay filters in the replay request payload', async () => {
    render(
      <ApiProvider>
        <TestConsumer />
      </ApiProvider>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /request multiplayer replays/i }),
    );

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.GET_REPLAYS, {
        gameType: 'multiplayer',
      });
    });
  });
});
