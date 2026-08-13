import { renderHook } from '@testing-library/react';
import { LiveSessionStatus } from '@types';
import {
  LIVE_SESSION_REPLAY_BLOCK_REASON,
  useViewReplayDisabledReason,
} from './useReplayGating';

let mockApi = {
  isConnected: true,
  hasApiStatusResponse: true,
  liveSessionStatus: { state: 'detached' } as LiveSessionStatus,
};

jest.mock('../providers/ApiContext', () => ({
  useApi: () => mockApi,
}));

const setStatus = (
  liveSessionStatus: LiveSessionStatus,
  connected = true,
  answered = true,
) => {
  mockApi = {
    isConnected: connected,
    hasApiStatusResponse: answered,
    liveSessionStatus,
  };
};

describe('useViewReplayDisabledReason', () => {
  /*
    Opening a replay is not a read: it calls /rest/watch/play, which makes the
    game load it. Mid-race that ends the session being captured, and nothing
    puts it back.
  */
  it('blocks loading a replay while a session is live', () => {
    setStatus({ state: 'live', trackName: 'Sebring', driverCount: 22 });

    const { result } = renderHook(() => useViewReplayDisabledReason());

    expect(result.current).toBe(LIVE_SESSION_REPLAY_BLOCK_REASON);
  });

  it('allows it on standby, when the game is running but idle', () => {
    setStatus({ state: 'detached' });

    const { result } = renderHook(() => useViewReplayDisabledReason());

    expect(result.current).toBeNull();
  });

  // The ordinary case: LMU is not running at all, and replays are the whole app.
  it('allows it when the game is not running', () => {
    setStatus({ state: 'detached' }, false, true);

    const { result } = renderHook(() => useViewReplayDisabledReason());

    expect(result.current).toBeNull();
  });
});
