import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  computeDisplayedLoadingScreenProgress,
  computeFirstReplayEventEtSeconds,
  computeNormalizedLoadingProgress,
  computeReplayTimeBaselineSeconds,
  detectPartialReplayData,
  hasReplayDataLoadedForRoute,
  isAwaitingReplayActivationFromQuickView,
  isQuickViewModeActive,
  shouldShowReplayLoadingUi,
  shouldNormalizeReplayTime,
} from './replayViewState';

const readJson = (relativePath: string) => {
  const absolutePath = path.resolve(__dirname, relativePath);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
};

const getStandingsEntries = (payload: unknown): unknown[] => {
  const source = payload as { entries?: unknown[]; data?: unknown[] } | unknown[];
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray((source as { entries?: unknown[] })?.entries)) {
    return (source as { entries?: unknown[] }).entries ?? [];
  }

  if (Array.isArray((source as { data?: unknown[] })?.data)) {
    return (source as { data?: unknown[] }).data ?? [];
  }

  return [];
};

const SESSION_TYPE_MAPPINGS: Record<string, string> = {
  RACE: 'Race',
  QUALIFY: 'Qualify',
  PRACTICE: 'Practice1',
};

describe('replayViewState', () => {
  it('keeps quick view active until activation is explicitly requested', () => {
    expect(isQuickViewModeActive(true, false, false)).toBe(true);
    expect(isQuickViewModeActive(true, true, false)).toBe(false);
    expect(isQuickViewModeActive(false, false, false)).toBe(false);
    expect(isQuickViewModeActive(true, false, true)).toBe(false);
  });

  it('detects awaiting replay activation state correctly', () => {
    expect(isAwaitingReplayActivationFromQuickView(true, true, false)).toBe(true);
    expect(isAwaitingReplayActivationFromQuickView(true, true, null)).toBe(true);
    expect(isAwaitingReplayActivationFromQuickView(true, true, true)).toBe(false);
    expect(isAwaitingReplayActivationFromQuickView(true, false, false)).toBe(false);
  });

  it('does not classify synced fixture data as partial replay data', () => {
    const replayPayload = readJson('../../__tests__/fixtures/replay/synced/replay.json');
    const standingsPayload = readJson('../../__tests__/fixtures/replay/synced/standings.json');
    const replay = Array.isArray(replayPayload) ? replayPayload[0] : replayPayload;
    const sessionKey = SESSION_TYPE_MAPPINGS[String(replay?.metadata?.session ?? '')];

    const stream = replay?.logData?.[sessionKey]?.Stream;
    const replayTimeBaselineSeconds = computeReplayTimeBaselineSeconds(stream);
    const firstReplayEventEtSeconds = computeFirstReplayEventEtSeconds(stream);
    const standingsEntries = getStandingsEntries(standingsPayload);

    const isPartialReplayDataDetected = detectPartialReplayData({
      replayTimeBaselineSeconds,
      firstReplayEventEtSeconds,
      standingsEntries,
    });

    expect(Number.isFinite(replayTimeBaselineSeconds)).toBe(true);
    expect(Number.isFinite(firstReplayEventEtSeconds)).toBe(true);
    expect(standingsEntries.length).toBeGreaterThan(0);
    expect(isPartialReplayDataDetected).toBe(false);
    expect(
      shouldNormalizeReplayTime(
        isPartialReplayDataDetected,
        replayTimeBaselineSeconds,
      ),
    ).toBe(false);
  });

  const unsyncedReplayPath = path.resolve(
    __dirname,
    '../../__tests__/fixtures/replay/unsynced/replay.json',
  );
  const unsyncedStandingsPath = path.resolve(
    __dirname,
    '../../__tests__/fixtures/replay/unsynced/standings.json',
  );

  const unsyncedTest =
    existsSync(unsyncedReplayPath) && existsSync(unsyncedStandingsPath)
      ? it
      : it.skip;

  unsyncedTest(
    'classifies unsynced fixture data as partial replay data and enables normalization',
    () => {
      const replayPayload = readJson('../../__tests__/fixtures/replay/unsynced/replay.json');
      const standingsPayload = readJson('../../__tests__/fixtures/replay/unsynced/standings.json');
      const replay = Array.isArray(replayPayload) ? replayPayload[0] : replayPayload;
      const sessionKey = SESSION_TYPE_MAPPINGS[String(replay?.metadata?.session ?? '')];

      const stream = replay?.logData?.[sessionKey]?.Stream;
      const replayTimeBaselineSeconds = computeReplayTimeBaselineSeconds(stream);
      const firstReplayEventEtSeconds = computeFirstReplayEventEtSeconds(stream);
      const standingsEntries = getStandingsEntries(standingsPayload);

      const isPartialReplayDataDetected = detectPartialReplayData({
        replayTimeBaselineSeconds,
        firstReplayEventEtSeconds,
        standingsEntries,
      });

      expect(isPartialReplayDataDetected).toBe(true);
      expect(
        shouldNormalizeReplayTime(
          isPartialReplayDataDetected,
          replayTimeBaselineSeconds,
        ),
      ).toBe(true);
    },
  );

  it('computes replay data loaded state for current route conditions', () => {
    expect(
      hasReplayDataLoadedForRoute({
        replayHash: 'hash-a',
        currentReplayHash: 'hash-a',
        isReplayActive: true,
        isReplayActiveForRoute: null,
        hasRequestedReplayData: false,
        sessionInfoData: null,
        standingsData: null,
        standingsHistoryData: null,
        cachedSessionInfoData: null,
        cachedStandingsData: null,
        cachedStandingsHistoryData: null,
      }),
    ).toBe(true);

    expect(
      hasReplayDataLoadedForRoute({
        replayHash: 'hash-a',
        currentReplayHash: 'hash-b',
        isReplayActive: false,
        isReplayActiveForRoute: false,
        hasRequestedReplayData: false,
        sessionInfoData: null,
        standingsData: null,
        standingsHistoryData: null,
        cachedSessionInfoData: null,
        cachedStandingsData: null,
        cachedStandingsHistoryData: { data: [] },
      }),
    ).toBe(true);

    expect(
      hasReplayDataLoadedForRoute({
        replayHash: undefined,
        currentReplayHash: undefined,
        isReplayActive: null,
        isReplayActiveForRoute: null,
        hasRequestedReplayData: false,
        sessionInfoData: null,
        standingsData: null,
        standingsHistoryData: null,
        cachedSessionInfoData: null,
        cachedStandingsData: null,
        cachedStandingsHistoryData: null,
      }),
    ).toBe(false);
  });

  it('normalizes loading progress from fractional and percentage values', () => {
    expect(computeNormalizedLoadingProgress(undefined)).toBe(0);
    expect(computeNormalizedLoadingProgress(-10)).toBe(0);
    expect(computeNormalizedLoadingProgress(0.35)).toBe(0.35);
    expect(computeNormalizedLoadingProgress(35)).toBe(0.35);
    expect(computeNormalizedLoadingProgress(140)).toBe(1);
  });

  it('determines replay loading UI visibility from quick view and startup states', () => {
    expect(
      shouldShowReplayLoadingUi({
        isAwaitingReplayActivationFromQuickView: true,
        isForcingLoadingScreen: false,
        isQuickViewModeActive: true,
        isReplayStartupGateActive: false,
        isLoading: false,
        hasReplayForView: true,
        hasRequestedReplayData: true,
        isHoldingAtComplete: false,
      }),
    ).toBe(true);

    expect(
      shouldShowReplayLoadingUi({
        isAwaitingReplayActivationFromQuickView: false,
        isForcingLoadingScreen: false,
        isQuickViewModeActive: false,
        isReplayStartupGateActive: false,
        isLoading: false,
        hasReplayForView: true,
        hasRequestedReplayData: true,
        isHoldingAtComplete: false,
      }),
    ).toBe(false);

    expect(
      shouldShowReplayLoadingUi({
        isAwaitingReplayActivationFromQuickView: false,
        isForcingLoadingScreen: false,
        isQuickViewModeActive: false,
        isReplayStartupGateActive: true,
        isLoading: false,
        hasReplayForView: true,
        hasRequestedReplayData: true,
        isHoldingAtComplete: false,
      }),
    ).toBe(true);
  });

  it('applies quick view loading floor to displayed loading progress', () => {
    expect(
      computeDisplayedLoadingScreenProgress({
        isAwaitingReplayActivationFromQuickView: false,
        isForcingLoadingScreen: false,
        loadingScreenProgress: 0.01,
      }),
    ).toBe(0.01);

    expect(
      computeDisplayedLoadingScreenProgress({
        isAwaitingReplayActivationFromQuickView: true,
        isForcingLoadingScreen: false,
        loadingScreenProgress: 0.01,
      }),
    ).toBe(0.05);
  });
});
