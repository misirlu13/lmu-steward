export type ReplayCompletionHoldAction = 'reset' | 'start-hold' | 'noop';

export const buildReplayCompletionHoldPlan = ({
  hasCurrentReplay,
  hasRequestedReplayData,
  isLoading,
  normalizedLoadingProgress,
  hasCompletedHoldForCycle,
  isHoldingAtComplete,
  hasPendingHoldTimeout,
}: {
  hasCurrentReplay: boolean;
  hasRequestedReplayData: boolean;
  isLoading: boolean;
  normalizedLoadingProgress: number;
  hasCompletedHoldForCycle: boolean;
  isHoldingAtComplete: boolean;
  hasPendingHoldTimeout: boolean;
}): ReplayCompletionHoldAction => {
  const isReplayReady = hasCurrentReplay && hasRequestedReplayData;
  const isLoadingComplete =
    isReplayReady && !isLoading && normalizedLoadingProgress >= 1;

  if (!isLoadingComplete) {
    return 'reset';
  }

  if (hasCompletedHoldForCycle || isHoldingAtComplete || hasPendingHoldTimeout) {
    return 'noop';
  }

  return 'start-hold';
};
