import { act, renderHook } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { LMUReplay } from '@types';
import { useReplayViewOrchestration } from './useReplayViewOrchestration';
import { sendMessage } from '../utils/postMessage';

jest.mock('../utils/postMessage', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../utils/replayActivationPlan', () => ({
  buildReplayActivationPlan: jest.fn(() => ({ type: 'skip' })),
}));

jest.mock('../utils/replayDataFetchPlan', () => ({
  buildReplayDataFetchPlan: jest.fn(() => ({ shouldRequest: false, channels: [] })),
}));

jest.mock('../utils/replayLoadingGatePlan', () => ({
  buildReplayLoadingGatePlan: jest.fn(() => ({
    shouldSetHasSeenReplayLoadStart: false,
    shouldCloseStartupGate: false,
    shouldClearActivationRequest: false,
  })),
}));

jest.mock('../utils/replayCompletionHoldPlan', () => ({
  buildReplayCompletionHoldPlan: jest.fn(() => 'noop'),
}));

jest.mock('../utils/replayForcingLoadingPlan', () => ({
  shouldDisableReplayForcingLoadingScreen: jest.fn(() => false),
}));

describe('useReplayViewOrchestration', () => {
  const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

  const replayFixture: LMUReplay = {
    hash: 'replay-hash-1',
    metadata: { sceneDesc: 'SEBRINGWEC', session: 'RACE' },
    logData: {},
    logDataDirectory: 'D:/logs',
    logDataFileName: 'race.xml',
    replayDirectory: 'D:/replays',
    replayName: 'Race Session',
    size: 1,
    timestamp: 1,
  };

  const baseArgs = {
    replayHash: 'replay-hash-1',
    replays: {
      data: [replayFixture],
    },
    currentReplay: null,
    currentTrackMap: null,
    loadingState: { loading: false, percentage: 0 },
    isReplayActive: false as boolean | null,
    quickViewEnabled: true,
    subscribeToApiChannel: jest.fn(() => jest.fn()),
    navigateToDashboard: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('starts in quick view mode and polls replay status', () => {
    const { result } = renderHook(() => useReplayViewOrchestration(baseArgs));

    expect(result.current.isQuickViewModeActiveForReplay).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.GET_IS_REPLAY_ACTIVE);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.GET_IS_REPLAY_ACTIVE);
  });

  it('requests replay activation from quick view and updates loading state', () => {
    const { result } = renderHook(() => useReplayViewOrchestration(baseArgs));

    sendMessageMock.mockClear();

    act(() => {
      result.current.onViewReplayFromQuickView();
    });

    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.GET_IS_REPLAY_ACTIVE);
    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.GET_API_STATUS);
    expect(result.current.isQuickViewModeActiveForReplay).toBe(false);
    expect(result.current.isReplayLoadingUiVisible).toBe(true);
    expect(result.current.displayedLoadingScreenProgress).toBeGreaterThanOrEqual(0.05);
  });
});
