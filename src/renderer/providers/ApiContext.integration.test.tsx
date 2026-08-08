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
      stewardAuthor,
      stewardActions,
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
        <div data-testid="steward-author">{stewardAuthor}</div>
        <div data-testid="steward-actions">
          {stewardActions
            .map(
              (entry) =>
                `${entry.label}${entry.driverScoped ? '/driver' : '/incident'}`,
            )
            .join(', ')}
        </div>
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

  /*
    The same failure as the test above, generalised — because it has now
    happened twice, and the second time cost a live session to find.

    `subscribeToApiChannel` attaches no IPC listener of its own. It adds a
    callback to a set that `runAdditionalCallbacks` drains, and that only runs
    from inside a `messageBusHandlers` entry. So a channel with a main-process
    handler, a `sendMessage` caller and a subscriber can still be completely
    dead: the request goes out, main answers, `initializeMessageBus` receives
    the reply, finds no entry, and drops it. Nothing logs, nothing throws, and
    the feature simply never updates.

    Keep this list in step with what consumers actually subscribe to:
      grep -rn "subscribeToApiChannel(" src/renderer --include=*.tsx --include=*.ts
  */
  it.each([
    CONSTANTS.API.GET_SESSION_INFO,
    CONSTANTS.API.GET_LIVE_SESSION_DATA,
    CONSTANTS.API.GET_LIVE_SESSIONS,
    CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS,
    CONSTANTS.API.GET_LIVE_SESSION_MATCHES,
    CONSTANTS.API.GET_LIVE_DATA_FOR_REPLAY,
    CONSTANTS.API.GET_LIVE_INCIDENT_CONTEXT,
    CONSTANTS.API.GET_LIVE_TRACK_MAP,
    CONSTANTS.API.GET_LIVE_CAR_POSITIONS,
    CONSTANTS.API.POST_CAMERA_ANGLE,
    CONSTANTS.API.POST_LINK_LIVE_SESSION,
    CONSTANTS.API.POST_DISMISS_LIVE_SESSION_MATCH,
    CONSTANTS.API.POST_DELETE_LIVE_SESSION,
  ])('routes %s to its subscribers', (channel) => {
    render(
      <ApiProvider>
        <TestConsumer />
      </ApiProvider>,
    );

    expect(typeof handlers[channel]).toBe('function');
  });

  // The live track map holds its own geometry rather than writing the shared
  // `currentTrackMap`, so its handler carries no `onData` at all — which is
  // exactly the shape that looks droppable and is not.
  it('delivers the live track map to a subscriber that owns its own state', () => {
    const received: unknown[] = [];

    const Subscriber = () => {
      const { subscribeToApiChannel } = useApi();
      useEffect(
        () =>
          subscribeToApiChannel(CONSTANTS.API.GET_LIVE_TRACK_MAP, (data) =>
            received.push(data),
          ),
        [subscribeToApiChannel],
      );
      return null;
    };

    render(
      <ApiProvider>
        <Subscriber />
      </ApiProvider>,
    );

    act(() => {
      handlers[CONSTANTS.API.GET_LIVE_TRACK_MAP]?.({
        status: 'success',
        data: [{ type: 0, x: 1, y: 0, z: 2 }],
      });
    });

    expect(received).toHaveLength(1);
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

  /*
    The steward's name reaches decision records from two call sites — the live
    shell and the replay dossier — and it is resolved here so it can only be one
    value. These cover the resolution point rather than either call site.
  */
  describe('the steward author new decisions are written under', () => {
    it('should carry the name from settings', async () => {
      render(
        <ApiProvider>
          <TestConsumer />
        </ApiProvider>,
      );

      act(() => {
        handlers[CONSTANTS.API.GET_USER_SETTINGS]?.({
          status: 'success',
          data: { stewardAuthorName: '  Bradley  ' },
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('steward-author').textContent).toBe(
          'Bradley',
        );
      });
    });

    // Before settings arrive, and after they arrive blank, which is the shipped
    // default. Never an empty string on either path.
    it('should fall back to a generic author rather than a blank one', async () => {
      render(
        <ApiProvider>
          <TestConsumer />
        </ApiProvider>,
      );

      expect(screen.getByTestId('steward-author').textContent).toBe('Steward');

      act(() => {
        handlers[CONSTANTS.API.GET_USER_SETTINGS]?.({
          status: 'success',
          data: { stewardAuthorName: '' },
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('steward-author').textContent).toBe(
          'Steward',
        );
      });
    });

    // Settings are read once at startup; every later change comes back on the
    // write reply. Without this the name only takes effect after a restart.
    it('should update from the settings write reply, without a reload', async () => {
      render(
        <ApiProvider>
          <TestConsumer />
        </ApiProvider>,
      );

      act(() => {
        handlers[CONSTANTS.API.POST_USER_SETTINGS]?.({
          status: 'success',
          data: { stewardAuthorName: 'Race Control' },
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('steward-author').textContent).toBe(
          'Race Control',
        );
      });
    });
  });

  /*
    The tariff is resolved here for the same reason and with more at stake: it
    reaches four places — both dossiers' buttons and the driver-target guard on
    each decide path — so a second resolution is a button that offers a penalty
    the guard then refuses. These cover the resolution point; the two surfaces
    agreeing is `stewardActions.integration.test.tsx`.
  */
  describe('the tariff both dossiers are offered', () => {
    const SHIPPED =
      '5s Penalty/driver, 10s Penalty/driver, Drive-Through/driver, No Action/incident, Note Only/incident';

    it('should carry the configured list from settings', async () => {
      render(
        <ApiProvider>
          <TestConsumer />
        </ApiProvider>,
      );

      act(() => {
        handlers[CONSTANTS.API.GET_USER_SETTINGS]?.({
          status: 'success',
          data: {
            stewardActions: [
              { id: 'a', label: 'DT', driverScoped: true },
              { id: 'b', label: 'Racing Incident', driverScoped: false },
            ],
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('steward-actions').textContent).toBe(
          'DT/driver, Racing Incident/incident',
        );
      });
    });

    /*
      Before settings arrive, and after they arrive empty — which is the shipped
      state, since nothing is stored until the user departs from the defaults. An
      empty list here would be a dossier with nothing to press.
    */
    it.each([
      ['never set', undefined],
      ['explicitly cleared', null],
      ['unusable', [{ label: '  ' }]],
    ])(
      'should never be empty when the setting is %s',
      async (_case, stewardActions) => {
        render(
          <ApiProvider>
            <TestConsumer />
          </ApiProvider>,
        );

        expect(screen.getByTestId('steward-actions').textContent).toBe(SHIPPED);

        act(() => {
          handlers[CONSTANTS.API.GET_USER_SETTINGS]?.({
            status: 'success',
            data: { stewardActions },
          });
        });

        await waitFor(() => {
          expect(screen.getByTestId('steward-actions').textContent).toBe(
            SHIPPED,
          );
        });
      },
    );

    // Every later change comes back on the write reply. Without this an edited
    // tariff only takes effect after a restart.
    it('should update from the settings write reply, without a reload', async () => {
      render(
        <ApiProvider>
          <TestConsumer />
        </ApiProvider>,
      );

      act(() => {
        handlers[CONSTANTS.API.POST_USER_SETTINGS]?.({
          status: 'success',
          data: {
            stewardActions: [
              { id: 'a', label: 'Reprimand', driverScoped: false },
            ],
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('steward-actions').textContent).toBe(
          'Reprimand/incident',
        );
      });
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
