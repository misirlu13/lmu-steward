export interface ReplayCachedActivationData {
  sessionInfoData?: unknown;
  standingsData?: unknown;
  standingsHistoryData?: unknown;
  trackMapData?: unknown;
}

type ReplayActivationPlanType =
  | 'skip'
  | 'refresh-status'
  | 'reuse-active-replay'
  | 'activate-replay';

export interface ReplayActivationPlan {
  type: ReplayActivationPlanType;
  hasCachedReplayData?: boolean;
  shouldRequestTrackMap?: boolean;
}

export const buildReplayActivationPlan = ({
  replayHash,
  isQuickViewModeActive,
  isReplayActive,
  hasReplayBeenActive,
  currentReplayHash,
  activationRequestHash,
  cachedData,
}: {
  replayHash: string | undefined;
  isQuickViewModeActive: boolean;
  isReplayActive: boolean | null;
  hasReplayBeenActive: boolean;
  currentReplayHash: string | undefined;
  activationRequestHash: string | null;
  cachedData: ReplayCachedActivationData | undefined;
}): ReplayActivationPlan => {
  if (!replayHash) {
    return { type: 'skip' };
  }

  if (isQuickViewModeActive) {
    return { type: 'skip' };
  }

  if (isReplayActive === false && hasReplayBeenActive) {
    return { type: 'skip' };
  }

  const isCurrentReplayAlreadyActive =
    currentReplayHash === replayHash && isReplayActive === true;

  const hasCachedReplayData = Boolean(
    cachedData?.sessionInfoData &&
      cachedData?.standingsData &&
      cachedData?.standingsHistoryData,
  );

  if (isCurrentReplayAlreadyActive) {
    if (activationRequestHash === replayHash) {
      return { type: 'refresh-status' };
    }

    return {
      type: 'reuse-active-replay',
      hasCachedReplayData,
      shouldRequestTrackMap: !cachedData?.trackMapData,
    };
  }

  if (activationRequestHash === replayHash) {
    return { type: 'skip' };
  }

  return { type: 'activate-replay' };
};
