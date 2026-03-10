export interface ReplayLoadingGatePlan {
  shouldSetHasSeenReplayLoadStart: boolean;
  shouldCloseStartupGate: boolean;
  shouldClearActivationRequest: boolean;
}

export const buildReplayLoadingGatePlan = ({
  isReplayStartupGateActive,
  hasSeenReplayLoadStart,
  hasRequestedReplayData,
  isLoading,
  normalizedLoadingProgress,
  rawLoadingPercentage,
  isCurrentReplayActivationRequest,
}: {
  isReplayStartupGateActive: boolean;
  hasSeenReplayLoadStart: boolean;
  hasRequestedReplayData: boolean;
  isLoading: boolean;
  normalizedLoadingProgress: number;
  rawLoadingPercentage: number;
  isCurrentReplayActivationRequest: boolean;
}): ReplayLoadingGatePlan => {
  if (!isReplayStartupGateActive) {
    return {
      shouldSetHasSeenReplayLoadStart: false,
      shouldCloseStartupGate: false,
      shouldClearActivationRequest: false,
    };
  }

  const hasLoadingStartedSignal = isLoading || normalizedLoadingProgress > 0;
  if (hasLoadingStartedSignal && !hasSeenReplayLoadStart) {
    return {
      shouldSetHasSeenReplayLoadStart: true,
      shouldCloseStartupGate: false,
      shouldClearActivationRequest: false,
    };
  }

  const hasReachedTerminalProgress =
    normalizedLoadingProgress >= 1 || rawLoadingPercentage < 0;
  const isLoadingCycleComplete =
    hasRequestedReplayData &&
    hasSeenReplayLoadStart &&
    !isLoading &&
    hasReachedTerminalProgress;

  if (!isLoadingCycleComplete) {
    return {
      shouldSetHasSeenReplayLoadStart: false,
      shouldCloseStartupGate: false,
      shouldClearActivationRequest: false,
    };
  }

  return {
    shouldSetHasSeenReplayLoadStart: false,
    shouldCloseStartupGate: true,
    shouldClearActivationRequest: isCurrentReplayActivationRequest,
  };
};
