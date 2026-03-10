import { toArray } from './collections';

interface ReplayScoreEntryLike {
  _?: string;
  et?: number | string;
}

interface ReplayStreamLike {
  Score?: ReplayScoreEntryLike | ReplayScoreEntryLike[];
  Incident?: Array<{ et?: number | string }> | { et?: number | string };
  Penalty?: Array<{ et?: number | string }> | { et?: number | string };
  TrackLimits?: Array<{ et?: number | string }> | { et?: number | string };
}

interface ReplayStandingLike {
  lapsCompleted?: number | string;
  pitState?: string;
  pitting?: boolean;
  timeIntoLap?: number | string;
}

const extractScoreEtFromScoreText = (
  scoreEntry: ReplayScoreEntryLike,
): number | undefined => {
  const sourceText = String(scoreEntry?._ ?? '');
  const match = sourceText.match(/\bet=([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const isQuickViewModeActive = (
  quickViewEnabled: boolean,
  hasRequestedReplayActivation: boolean,
  hasLoadedReplayDataForRoute = false,
): boolean =>
  quickViewEnabled &&
  !hasRequestedReplayActivation &&
  !hasLoadedReplayDataForRoute;

export const isAwaitingReplayActivationFromQuickView = (
  quickViewEnabled: boolean,
  hasRequestedReplayActivation: boolean,
  isReplayActive: boolean | null,
): boolean =>
  quickViewEnabled && hasRequestedReplayActivation && isReplayActive !== true;

export const hasReplayDataLoadedForRoute = ({
  replayHash,
  currentReplayHash,
  isReplayActive,
  isReplayActiveForRoute,
  hasRequestedReplayData,
  sessionInfoData,
  standingsData,
  standingsHistoryData,
  cachedSessionInfoData,
  cachedStandingsData,
  cachedStandingsHistoryData,
}: {
  replayHash: string | undefined;
  currentReplayHash: string | undefined;
  isReplayActive: boolean | null;
  isReplayActiveForRoute: boolean | null;
  hasRequestedReplayData: boolean;
  sessionInfoData: unknown;
  standingsData: unknown;
  standingsHistoryData: unknown;
  cachedSessionInfoData: unknown;
  cachedStandingsData: unknown;
  cachedStandingsHistoryData: unknown;
}): boolean => {
  if (!replayHash) {
    return false;
  }

  const hasActiveReplayForRoute =
    currentReplayHash === replayHash &&
    (isReplayActive === true || isReplayActiveForRoute === true);

  return Boolean(
    hasActiveReplayForRoute ||
      hasRequestedReplayData ||
      sessionInfoData ||
      standingsData ||
      standingsHistoryData ||
      cachedSessionInfoData ||
      cachedStandingsData ||
      cachedStandingsHistoryData,
  );
};

export const computeNormalizedLoadingProgress = (
  rawLoadingPercentage: unknown,
): number => {
  const raw = Number(rawLoadingPercentage);
  if (!Number.isFinite(raw)) {
    return 0;
  }

  if (raw <= 1) {
    return Math.min(1, Math.max(0, raw));
  }

  return Math.min(1, Math.max(0, raw / 100));
};

export const shouldShowReplayLoadingUi = ({
  isAwaitingReplayActivationFromQuickView,
  isForcingLoadingScreen,
  isQuickViewModeActive,
  isReplayStartupGateActive,
  isLoading,
  hasReplayForView,
  hasRequestedReplayData,
  isHoldingAtComplete,
}: {
  isAwaitingReplayActivationFromQuickView: boolean;
  isForcingLoadingScreen: boolean;
  isQuickViewModeActive: boolean;
  isReplayStartupGateActive: boolean;
  isLoading: boolean;
  hasReplayForView: boolean;
  hasRequestedReplayData: boolean;
  isHoldingAtComplete: boolean;
}): boolean => {
  return (
    isAwaitingReplayActivationFromQuickView ||
    isForcingLoadingScreen ||
    (!isQuickViewModeActive &&
      (isReplayStartupGateActive ||
        isLoading ||
        !hasReplayForView ||
        !hasRequestedReplayData ||
        isHoldingAtComplete))
  );
};

export const computeDisplayedLoadingScreenProgress = ({
  isAwaitingReplayActivationFromQuickView,
  isForcingLoadingScreen,
  loadingScreenProgress,
}: {
  isAwaitingReplayActivationFromQuickView: boolean;
  isForcingLoadingScreen: boolean;
  loadingScreenProgress: number;
}): number => {
  return isAwaitingReplayActivationFromQuickView || isForcingLoadingScreen
    ? Math.max(loadingScreenProgress, 0.05)
    : loadingScreenProgress;
};

export const computeReplayTimeBaselineSeconds = (
  stream: unknown,
): number | null => {
  const replayStream = stream as ReplayStreamLike | null | undefined;
  const scoreEntries = toArray(replayStream?.Score);
  if (!scoreEntries.length) {
    return null;
  }

  const scoreEtValues = scoreEntries
    .flatMap((entry) => [Number(entry?.et), extractScoreEtFromScoreText(entry)])
    .filter((value): value is number => Number.isFinite(value));

  if (!scoreEtValues.length) {
    return null;
  }

  return Math.min(...scoreEtValues);
};

export const computeFirstReplayEventEtSeconds = (
  stream: unknown,
): number | null => {
  const replayStream = stream as ReplayStreamLike | null | undefined;
  if (!replayStream) {
    return null;
  }

  const eventEtValues = [
    ...toArray(replayStream.Incident).map((entry) => Number(entry?.et)),
    ...toArray(replayStream.Penalty).map((entry) => Number(entry?.et)),
    ...toArray(replayStream.TrackLimits).map((entry) => Number(entry?.et)),
  ].filter((value): value is number => Number.isFinite(value));

  if (!eventEtValues.length) {
    return null;
  }

  return Math.min(...eventEtValues);
};

export const detectPartialReplayData = ({
  replayTimeBaselineSeconds,
  firstReplayEventEtSeconds,
  standingsEntries,
}: {
  replayTimeBaselineSeconds: number | null;
  firstReplayEventEtSeconds: number | null;
  standingsEntries: unknown[];
}): boolean => {
  if (
    replayTimeBaselineSeconds === null ||
    !Number.isFinite(replayTimeBaselineSeconds) ||
    replayTimeBaselineSeconds <= 90 ||
    standingsEntries.length === 0
  ) {
    return false;
  }

  const allEntriesHaveZeroCompletedLaps = standingsEntries.every(
    (entry) => Number((entry as ReplayStandingLike)?.lapsCompleted ?? -1) === 0,
  );
  const exitingRatio =
    standingsEntries.filter(
      (entry) => String((entry as ReplayStandingLike)?.pitState ?? '') === 'EXITING',
    ).length / standingsEntries.length;
  const pittingRatio =
    standingsEntries.filter((entry) => Boolean((entry as ReplayStandingLike)?.pitting)).length /
    standingsEntries.length;
  const nearZeroNegativeTimeIntoLapRatio =
    standingsEntries.filter((entry) => {
      const timeIntoLap = Number((entry as ReplayStandingLike)?.timeIntoLap);
      return (
        Number.isFinite(timeIntoLap) &&
        timeIntoLap < 0 &&
        timeIntoLap > -5
      );
    }).length / standingsEntries.length;

  const hasJoinOffsetSignal =
    Number.isFinite(firstReplayEventEtSeconds) &&
    firstReplayEventEtSeconds !== null &&
    firstReplayEventEtSeconds >= replayTimeBaselineSeconds &&
    firstReplayEventEtSeconds - replayTimeBaselineSeconds <= 120;

  const hasStandingsSnapshotSignal =
    allEntriesHaveZeroCompletedLaps &&
    ((exitingRatio > 0.8 && pittingRatio > 0.8) ||
      nearZeroNegativeTimeIntoLapRatio > 0.8);

  return hasStandingsSnapshotSignal || hasJoinOffsetSignal;
};

export const shouldNormalizeReplayTime = (
  isPartialReplayDataDetected: boolean,
  replayTimeBaselineSeconds: number | null,
): boolean =>
  isPartialReplayDataDetected && replayTimeBaselineSeconds !== null;
