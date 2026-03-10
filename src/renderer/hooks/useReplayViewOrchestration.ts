import { useEffect, useMemo, useRef, useState } from 'react';
import { CONSTANTS } from '@constants';
import { LMUReplay, LoadingState } from '@types';
import { sendMessage } from '../utils/postMessage';
import {
  computeDisplayedLoadingScreenProgress,
  computeNormalizedLoadingProgress,
  hasReplayDataLoadedForRoute,
  isAwaitingReplayActivationFromQuickView,
  isQuickViewModeActive,
  shouldShowReplayLoadingUi,
} from '../utils/replayViewState';
import {
  buildReplayApiSubscriptions,
  ReplayApiSubscriptionCallback,
} from '../utils/replaySubscriptions';
import { buildReplayActivationPlan } from '../utils/replayActivationPlan';
import { buildReplayDataFetchPlan } from '../utils/replayDataFetchPlan';
import { buildReplayLoadingGatePlan } from '../utils/replayLoadingGatePlan';
import { buildReplayCompletionHoldPlan } from '../utils/replayCompletionHoldPlan';
import { shouldDisableReplayForcingLoadingScreen } from '../utils/replayForcingLoadingPlan';

type ApiChannel = (typeof CONSTANTS.API)[keyof typeof CONSTANTS.API];

interface ReplayCatalogLike {
  status?: string;
  data?: LMUReplay[];
}

interface ReplayViewCachedData {
  sessionInfoData: Record<string, unknown> | null;
  standingsData: unknown;
  standingsHistoryData: Record<string, unknown> | null;
  trackMapData: { data?: unknown } | null;
  selectedIncidentId?: string;
}

const replayViewCachedDataByHash = new Map<string, ReplayViewCachedData>();

const requestReplayStatusRefresh = () => {
  sendMessage(CONSTANTS.API.GET_IS_REPLAY_ACTIVE);
  sendMessage(CONSTANTS.API.GET_API_STATUS);
};

const requestReplayActivation = (replayHash: string) => {
  sendMessage(CONSTANTS.API.POST_WATCH_REPLAY, replayHash);
  requestReplayStatusRefresh();
};

interface UseReplayViewOrchestrationArgs {
  replayHash: string | undefined;
  replays: ReplayCatalogLike | null;
  currentReplay: LMUReplay | null;
  currentTrackMap: { data?: unknown } | null;
  loadingState: LoadingState;
  isReplayActive: boolean | null;
  quickViewEnabled: boolean;
  subscribeToApiChannel: (
    channel: ApiChannel,
    callback: ReplayApiSubscriptionCallback,
  ) => () => void;
  navigateToDashboard: () => void;
}

export const useReplayViewOrchestration = ({
  replayHash,
  replays,
  currentReplay,
  currentTrackMap,
  loadingState,
  isReplayActive,
  quickViewEnabled,
  subscribeToApiChannel,
  navigateToDashboard,
}: UseReplayViewOrchestrationArgs) => {
  const replayFromCatalog = useMemo(() => {
    if (!replayHash || !Array.isArray(replays?.data)) {
      return null;
    }

    return replays.data.find((replay) => replay?.hash === replayHash) ?? null;
  }, [replayHash, replays]);

  const replayForView =
    currentReplay?.hash === replayHash ? currentReplay : replayFromCatalog;

  const cachedReplayData = replayHash
    ? replayViewCachedDataByHash.get(replayHash) ?? null
    : null;

  const canReuseReplayOnMount = Boolean(
    replayHash &&
      currentReplay?.hash === replayHash &&
      isReplayActive === true &&
      cachedReplayData,
  );

  const [hasRequestedReplayData, setHasRequestedReplayData] = useState(
    canReuseReplayOnMount,
  );
  const [sessionInfoData, setSessionInfoData] = useState<Record<string, unknown> | null>(
    cachedReplayData?.sessionInfoData ?? null,
  );
  const [standingsData, setStandingsData] = useState<unknown>(
    cachedReplayData?.standingsData ?? null,
  );
  const [standingsHistoryData, setStandingsHistoryData] = useState<Record<string, unknown> | null>(
    cachedReplayData?.standingsHistoryData ?? null,
  );
  const [isReplayStartupGateActive, setIsReplayStartupGateActive] = useState(
    !canReuseReplayOnMount,
  );
  const [isReplayActiveForRoute, setIsReplayActiveForRoute] = useState<
    boolean | null
  >(null);
  const [hasSeenReplayLoadStart, setHasSeenReplayLoadStart] = useState(false);
  const [isHoldingAtComplete, setIsHoldingAtComplete] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<
    string | undefined
  >(cachedReplayData?.selectedIncidentId);
  const [hasRequestedReplayActivation, setHasRequestedReplayActivation] =
    useState(false);
  const [isForcingLoadingScreen, setIsForcingLoadingScreen] = useState(false);
  const [loadingScreenProgress, setLoadingScreenProgress] = useState(0);

  const completionHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const hasCompletedHoldForCycleRef = useRef(false);
  const activationRequestHashRef = useRef<string | null>(null);
  const hasReplayBeenActiveRef = useRef(false);

  const hasLoadedReplayDataForRoute = hasReplayDataLoadedForRoute({
    replayHash,
    currentReplayHash: currentReplay?.hash,
    isReplayActive,
    isReplayActiveForRoute,
    hasRequestedReplayData,
    sessionInfoData,
    standingsData,
    standingsHistoryData,
    cachedSessionInfoData: cachedReplayData?.sessionInfoData,
    cachedStandingsData: cachedReplayData?.standingsData,
    cachedStandingsHistoryData: cachedReplayData?.standingsHistoryData,
  });

  const isQuickViewModeActiveForReplay = isQuickViewModeActive(
    quickViewEnabled,
    hasRequestedReplayActivation,
    hasLoadedReplayDataForRoute,
  );

  const isAwaitingReplayActivationFromQuickViewForReplay =
    isAwaitingReplayActivationFromQuickView(
      quickViewEnabled,
      hasRequestedReplayActivation,
      isReplayActive,
    );

  const normalizedLoadingProgress = useMemo(
    () => computeNormalizedLoadingProgress(loadingState?.percentage),
    [loadingState?.percentage],
  );

  const isReplayLoadingUiVisible = shouldShowReplayLoadingUi({
    isAwaitingReplayActivationFromQuickView:
      isAwaitingReplayActivationFromQuickViewForReplay,
    isForcingLoadingScreen,
    isQuickViewModeActive: isQuickViewModeActiveForReplay,
    isReplayStartupGateActive,
    isLoading: loadingState.loading,
    hasReplayForView: Boolean(replayForView),
    hasRequestedReplayData,
    isHoldingAtComplete,
  });

  const displayedLoadingScreenProgress = computeDisplayedLoadingScreenProgress({
    isAwaitingReplayActivationFromQuickView:
      isAwaitingReplayActivationFromQuickViewForReplay,
    isForcingLoadingScreen,
    loadingScreenProgress,
  });

  useEffect(() => {
    if (isReplayStartupGateActive && !hasSeenReplayLoadStart) {
      setLoadingScreenProgress(0);
    }
  }, [hasSeenReplayLoadStart, isReplayStartupGateActive, replayHash]);

  useEffect(() => {
    if (!isReplayLoadingUiVisible) {
      setLoadingScreenProgress(0);
      return;
    }

    setLoadingScreenProgress((previousProgress) => {
      if (hasSeenReplayLoadStart && normalizedLoadingProgress <= 0) {
        return previousProgress;
      }

      return Math.max(previousProgress, normalizedLoadingProgress);
    });
  }, [
    hasSeenReplayLoadStart,
    isReplayLoadingUiVisible,
    normalizedLoadingProgress,
  ]);

  useEffect(() => {
    setIsReplayActiveForRoute(isReplayActive);
  }, [isReplayActive]);

  useEffect(() => {
    if (!replayHash) {
      return;
    }

    const cachedData = replayViewCachedDataByHash.get(replayHash);
    setSelectedIncidentId(cachedData?.selectedIncidentId);
    setHasRequestedReplayActivation(false);
    setIsForcingLoadingScreen(false);

    setIsReplayActiveForRoute(null);
    hasReplayBeenActiveRef.current = false;
  }, [replayHash]);

  useEffect(() => {
    if (isReplayActiveForRoute === true) {
      hasReplayBeenActiveRef.current = true;
      return;
    }

    if (isReplayActiveForRoute === false && hasReplayBeenActiveRef.current) {
      navigateToDashboard();
    }
  }, [isReplayActiveForRoute, navigateToDashboard]);

  useEffect(() => {
    if (!replayHash) {
      return;
    }

    const pollReplayActive = () => {
      sendMessage(CONSTANTS.API.GET_IS_REPLAY_ACTIVE);
    };

    pollReplayActive();
    const intervalId = setInterval(pollReplayActive, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [replayHash]);

  useEffect(() => {
    const replaySubscriptions = buildReplayApiSubscriptions({
      setSessionInfoData,
      setStandingsData,
      setStandingsHistoryData: (value) =>
        setStandingsHistoryData(
          (value as Record<string, unknown> | null | undefined) ?? null,
        ),
      setIsReplayActiveForRoute,
    });

    const unsubscribers = replaySubscriptions.map(({ channel, callback }) =>
      subscribeToApiChannel(channel, callback),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [subscribeToApiChannel]);

  useEffect(() => {
    const cachedData = replayHash
      ? replayViewCachedDataByHash.get(replayHash)
      : undefined;
    const activationPlan = buildReplayActivationPlan({
      replayHash,
      isQuickViewModeActive: isQuickViewModeActiveForReplay,
      isReplayActive,
      hasReplayBeenActive: hasReplayBeenActiveRef.current,
      currentReplayHash: currentReplay?.hash,
      activationRequestHash: activationRequestHashRef.current,
      cachedData,
    });

    if (activationPlan.type === 'skip') {
      return;
    }

    if (activationPlan.type === 'refresh-status') {
      requestReplayStatusRefresh();
      return;
    }

    if (activationPlan.type === 'reuse-active-replay') {
      if (cachedData) {
        setSessionInfoData(cachedData.sessionInfoData);
        setStandingsData(cachedData.standingsData);
        setStandingsHistoryData(cachedData.standingsHistoryData);
      }

      setHasRequestedReplayData(Boolean(activationPlan.hasCachedReplayData));
      setIsReplayStartupGateActive(!activationPlan.hasCachedReplayData);
      setHasSeenReplayLoadStart(false);

      if (activationPlan.shouldRequestTrackMap) {
        sendMessage(CONSTANTS.API.GET_TRACK_MAP);
      }

      requestReplayStatusRefresh();
      return;
    }

    if (!replayHash) {
      return;
    }

    activationRequestHashRef.current = replayHash;
    setHasRequestedReplayData(false);
    setSessionInfoData(null);
    setStandingsData(null);
    setStandingsHistoryData(null);
    setIsReplayStartupGateActive(true);
    setHasSeenReplayLoadStart(false);
    requestReplayActivation(replayHash);
  }, [currentReplay?.hash, isQuickViewModeActiveForReplay, isReplayActive, replayHash]);

  useEffect(() => {
    if (!replayHash) {
      return;
    }

    const cachedData = replayViewCachedDataByHash.get(replayHash) ?? {
      sessionInfoData: null,
      standingsData: null,
      standingsHistoryData: null,
      trackMapData: null,
      selectedIncidentId: undefined,
    };

    const nextCachedData: ReplayViewCachedData = {
      sessionInfoData: sessionInfoData ?? cachedData.sessionInfoData,
      standingsData: standingsData ?? cachedData.standingsData,
      standingsHistoryData:
        standingsHistoryData ?? cachedData.standingsHistoryData,
      trackMapData: currentTrackMap ?? cachedData.trackMapData,
      selectedIncidentId: selectedIncidentId ?? cachedData.selectedIncidentId,
    };

    if (
      !nextCachedData.sessionInfoData &&
      !nextCachedData.standingsData &&
      !nextCachedData.standingsHistoryData &&
      !nextCachedData.trackMapData &&
      !nextCachedData.selectedIncidentId
    ) {
      return;
    }

    replayViewCachedDataByHash.set(replayHash, nextCachedData);
  }, [
    replayHash,
    sessionInfoData,
    standingsData,
    standingsHistoryData,
    currentTrackMap,
    selectedIncidentId,
  ]);

  useEffect(() => {
    const dataFetchPlan = buildReplayDataFetchPlan({
      hasCurrentReplay: Boolean(currentReplay),
      hasRequestedReplayData,
      isReplayActiveForRoute,
    });

    if (!dataFetchPlan.shouldRequest) {
      return;
    }

    dataFetchPlan.channels.forEach((channel) => {
      sendMessage(channel);
    });

    setHasRequestedReplayData(true);
  }, [
    currentReplay,
    hasRequestedReplayData,
    isReplayActiveForRoute,
  ]);

  useEffect(() => {
    const rawLoadingPercentage = Number(loadingState?.percentage);
    const loadingGatePlan = buildReplayLoadingGatePlan({
      isReplayStartupGateActive,
      hasSeenReplayLoadStart,
      hasRequestedReplayData,
      isLoading: loadingState.loading,
      normalizedLoadingProgress,
      rawLoadingPercentage,
      isCurrentReplayActivationRequest:
        activationRequestHashRef.current === replayHash,
    });

    if (loadingGatePlan.shouldSetHasSeenReplayLoadStart) {
      setHasSeenReplayLoadStart(true);
      return;
    }

    if (loadingGatePlan.shouldCloseStartupGate) {
      setIsReplayStartupGateActive(false);
      if (loadingGatePlan.shouldClearActivationRequest) {
        activationRequestHashRef.current = null;
      }
    }
  }, [
    hasRequestedReplayData,
    hasSeenReplayLoadStart,
    isReplayStartupGateActive,
    loadingState?.percentage,
    loadingState.loading,
    normalizedLoadingProgress,
    replayHash,
  ]);

  useEffect(() => {
    const holdPlan = buildReplayCompletionHoldPlan({
      hasCurrentReplay: Boolean(currentReplay),
      hasRequestedReplayData,
      isLoading: loadingState.loading,
      normalizedLoadingProgress,
      hasCompletedHoldForCycle: hasCompletedHoldForCycleRef.current,
      isHoldingAtComplete,
      hasPendingHoldTimeout: Boolean(completionHoldTimeoutRef.current),
    });

    if (holdPlan === 'reset') {
      if (completionHoldTimeoutRef.current) {
        clearTimeout(completionHoldTimeoutRef.current);
        completionHoldTimeoutRef.current = null;
      }
      hasCompletedHoldForCycleRef.current = false;
      setIsHoldingAtComplete(false);
      return;
    }

    if (holdPlan === 'noop') {
      return;
    }

    hasCompletedHoldForCycleRef.current = true;
    setIsHoldingAtComplete(true);
    completionHoldTimeoutRef.current = setTimeout(() => {
      setIsHoldingAtComplete(false);
      completionHoldTimeoutRef.current = null;
    }, 200);
  }, [
    currentReplay,
    hasRequestedReplayData,
    isHoldingAtComplete,
    loadingState.loading,
    normalizedLoadingProgress,
  ]);

  useEffect(() => {
    return () => {
      if (completionHoldTimeoutRef.current) {
        clearTimeout(completionHoldTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const rawLoadingPercentage = Number(loadingState?.percentage);
    const shouldDisable = shouldDisableReplayForcingLoadingScreen({
      isForcingLoadingScreen,
      hasCurrentReplay: Boolean(currentReplay),
      hasRequestedReplayData,
      isLoading: loadingState.loading,
      normalizedLoadingProgress,
      rawLoadingPercentage,
    });

    if (shouldDisable) {
      setIsForcingLoadingScreen(false);
    }
  }, [
    currentReplay,
    hasRequestedReplayData,
    isForcingLoadingScreen,
    loadingState.loading,
    loadingState?.percentage,
    normalizedLoadingProgress,
  ]);

  const onViewReplayFromQuickView = () => {
    setHasRequestedReplayActivation(true);
    setIsForcingLoadingScreen(true);
    setIsReplayStartupGateActive(true);
    setHasSeenReplayLoadStart(false);
    setHasRequestedReplayData(false);
    setLoadingScreenProgress(0.05);
    requestReplayStatusRefresh();
  };

  return {
    replayForView,
    cachedReplayData,
    sessionInfoData,
    standingsData,
    standingsHistoryData,
    hasRequestedReplayData,
    isQuickViewModeActiveForReplay,
    isReplayLoadingUiVisible,
    displayedLoadingScreenProgress,
    selectedIncidentId,
    setSelectedIncidentId,
    onViewReplayFromQuickView,
  };
};
