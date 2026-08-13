import { act, renderHook } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { LMUReplay } from '@types';
import { useReplayViewOrchestration } from './useReplayViewOrchestration';
import { sendMessage } from '../utils/postMessage';

/*
  Its own file because `useReplayViewOrchestration.test.ts` stubs out every plan
  module — the activation plan, the fetch plan, the loading gate — to test the
  hook's wiring in isolation. This exercises the real ones together, which is
  the only way to see the interaction that broke.

  The scenario: opening a replay the game is *already* showing, which is what
  the return banner does after this app restarts. The startup gate only closes
  on a loading cycle — a `loading` flag or a progress reading from LMU — and a
  replay that is already up produces neither, so arming it pinned the loading
  screen at 0% for as long as the view stayed open while the standings and
  session info arrived behind the scrim. The renderer's in-memory cache, which
  the old condition leaned on to avoid this, goes with the previous process.
*/
jest.mock('../utils/postMessage', () => ({ sendMessage: jest.fn() }));

const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

const replayFixture = {
  hash: 'replay-hash-1',
  metadata: { sceneDesc: 'SEBRINGWEC', session: 'RACE' },
  logData: {},
  logDataDirectory: 'D:/logs',
  logDataFileName: 'race.xml',
  replayDirectory: 'D:/replays',
  replayName: 'Race Session',
  size: 1,
  timestamp: 1,
} as unknown as LMUReplay;

let subscribers: Record<string, ((payload: unknown) => void)[]>;

const renderOrchestration = (overrides: Record<string, unknown> = {}) => {
  subscribers = {};

  return renderHook(() =>
    useReplayViewOrchestration({
      replayHash: 'replay-hash-1',
      replays: { data: [replayFixture] },
      // The game is showing this replay and this process has no cache for it.
      currentReplay: replayFixture,
      currentTrackMap: null,
      loadingState: { loading: false, percentage: 0 },
      isReplayActive: true,
      quickViewEnabled: false,
      subscribeToApiChannel: ((
        channel: string,
        callback: (payload: unknown) => void,
      ) => {
        subscribers[channel] ??= [];
        subscribers[channel].push(callback);
        return () => {};
      }) as never,
      navigateToDashboard: jest.fn(),
      ...overrides,
    } as unknown as Parameters<typeof useReplayViewOrchestration>[0]),
  );
};

/** The game confirming the replay is up, as the status poll delivers it. */
const confirmActive = () =>
  act(() => {
    subscribers[CONSTANTS.API.GET_IS_REPLAY_ACTIVE]?.forEach((callback) =>
      callback({ status: 'success', data: true }),
    );
  });

const channelsSent = () =>
  sendMessageMock.mock.calls.map(([channel]) => channel);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('opening a replay the game is already showing', () => {
  it('should not wait for a loading cycle that has already happened', () => {
    const { result } = renderOrchestration();

    confirmActive();

    expect(result.current.hasRequestedReplayData).toBe(true);
    expect(result.current.isReplayLoadingUiVisible).toBe(false);
  });

  // Until the fetch is out, the screen still covers it — the fix removes the
  // deadlock, not the loading state.
  it('should still cover the fetch it has no cache for', () => {
    const { result } = renderOrchestration();

    expect(result.current.isReplayLoadingUiVisible).toBe(true);
  });

  it('should fetch the data this process has no cache for', () => {
    renderOrchestration();
    sendMessageMock.mockClear();

    confirmActive();

    expect(channelsSent()).toEqual(
      expect.arrayContaining([
        CONSTANTS.API.GET_STANDINGS,
        CONSTANTS.API.GET_STANDINGS_HISTORY,
        CONSTANTS.API.GET_SESSION_INFO,
        CONSTANTS.API.GET_TRACK_MAP,
      ]),
    );
  });

  /*
    And it must not ask the game to load the replay again — it is already
    showing it, and re-activating would take the picture back to the start.
  */
  it('should not re-activate a replay the game already has', () => {
    renderOrchestration();

    confirmActive();

    expect(channelsSent()).not.toContain(CONSTANTS.API.POST_WATCH_REPLAY);
  });

  // The ordinary path is untouched: a replay the game is not showing still gets
  // the loading screen, and still gets loaded.
  it('should still gate a replay the game is not showing', () => {
    const { result } = renderOrchestration({
      currentReplay: null,
      isReplayActive: false,
    });

    expect(result.current.isReplayLoadingUiVisible).toBe(true);
    expect(result.current.hasRequestedReplayData).toBe(false);
  });
});
