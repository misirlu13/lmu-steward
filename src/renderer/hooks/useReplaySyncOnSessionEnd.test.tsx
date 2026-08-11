import React from 'react';
import { act, render } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { LiveSessionStatus } from '@types';
import {
  REPLAY_SYNC_SETTLE_MS,
  useReplaySyncOnSessionEnd,
} from './useReplaySyncOnSessionEnd';
import { useApi } from '../providers/ApiContext';
import { sendMessage } from '../utils/postMessage';

jest.mock('../providers/ApiContext', () => ({ useApi: jest.fn() }));
jest.mock('../utils/postMessage', () => ({ sendMessage: jest.fn() }));

const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

const syncReplaysInBackground = jest.fn();

const setApi = (
  liveSessionStatus: LiveSessionStatus,
  liveCaptureEnabled = true,
) =>
  useApiMock.mockReturnValue({
    liveSessionStatus,
    liveCaptureEnabled,
    syncReplaysInBackground,
  } as unknown as ReturnType<typeof useApi>);

const Probe = () => {
  useReplaySyncOnSessionEnd();
  return null;
};

const settle = () =>
  act(() => {
    jest.advanceTimersByTime(REPLAY_SYNC_SETTLE_MS);
  });

/** Runs a session, then ends it, on one mounted hook. */
const runAndEndSession = (liveCaptureEnabled = true) => {
  setApi({ state: 'live' } as LiveSessionStatus, liveCaptureEnabled);
  const view = render(<Probe />);

  setApi({ state: 'detached' } as LiveSessionStatus, liveCaptureEnabled);
  view.rerender(<Probe />);

  return view;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/*
  The match pass reads the replay *cache*, and the cache only moves when a sync
  runs — so the replay LMU had just written stayed invisible to matching until
  the steward happened to open the replay list. The capture sat unlinked with
  nothing on screen suggesting what it was waiting for.
*/
describe('syncing for the replay of a session that just ended', () => {
  it('should go looking once the session ends', () => {
    runAndEndSession();
    settle();

    expect(syncReplaysInBackground).toHaveBeenCalledTimes(1);
  });

  /*
    The sync refreshes the cache; the list read is what runs the match pass
    against it. One without the other finds the replay and never links it.
  */
  it('should re-read the captures so the match pass runs', () => {
    runAndEndSession();
    settle();

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.GET_LIVE_SESSIONS,
    );
  });

  // The game is still writing the .Vcr as the session ends, and a scan that
  // arrives mid-write reads a file that is not finished.
  it('should let the game finish writing first', () => {
    runAndEndSession();

    expect(syncReplaysInBackground).not.toHaveBeenCalled();

    settle();
    expect(syncReplaysInBackground).toHaveBeenCalled();
  });

  it('should do nothing while a session is still running', () => {
    setApi({ state: 'live' } as LiveSessionStatus);
    render(<Probe />);
    settle();

    expect(syncReplaysInBackground).not.toHaveBeenCalled();
  });

  /*
    A session ending with capture off is just a session ending — there is no
    capture for a replay to be linked to, so walking the replay directory would
    be work on behalf of nobody.
  */
  it('should not scan when nothing was captured', () => {
    runAndEndSession(false);
    settle();

    expect(syncReplaysInBackground).not.toHaveBeenCalled();
  });

  // Starting the app with no session running is not a session ending.
  it('should not fire on the first reading', () => {
    setApi({ state: 'detached' } as LiveSessionStatus);
    render(<Probe />);
    settle();

    expect(syncReplaysInBackground).not.toHaveBeenCalled();
  });
});
