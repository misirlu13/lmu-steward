export const shouldDisableReplayForcingLoadingScreen = ({
  isForcingLoadingScreen,
  hasCurrentReplay,
  hasRequestedReplayData,
  isLoading,
  normalizedLoadingProgress,
  rawLoadingPercentage,
}: {
  isForcingLoadingScreen: boolean;
  hasCurrentReplay: boolean;
  hasRequestedReplayData: boolean;
  isLoading: boolean;
  normalizedLoadingProgress: number;
  rawLoadingPercentage: number;
}): boolean => {
  if (!isForcingLoadingScreen) {
    return false;
  }

  const isReplayReady = hasCurrentReplay && hasRequestedReplayData;
  const hasReachedTerminalProgress =
    normalizedLoadingProgress >= 1 || rawLoadingPercentage < 0;
  const isLoadingComplete = isReplayReady && !isLoading && hasReachedTerminalProgress;

  return isLoadingComplete;
};
