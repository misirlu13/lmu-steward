import { shouldDisableReplayForcingLoadingScreen } from './replayForcingLoadingPlan';

describe('replayForcingLoadingPlan', () => {
  it('returns false when forcing mode is not active', () => {
    expect(
      shouldDisableReplayForcingLoadingScreen({
        isForcingLoadingScreen: false,
        hasCurrentReplay: true,
        hasRequestedReplayData: true,
        isLoading: false,
        normalizedLoadingProgress: 1,
        rawLoadingPercentage: 100,
      }),
    ).toBe(false);
  });

  it('returns false when replay is not ready or still loading', () => {
    expect(
      shouldDisableReplayForcingLoadingScreen({
        isForcingLoadingScreen: true,
        hasCurrentReplay: false,
        hasRequestedReplayData: true,
        isLoading: false,
        normalizedLoadingProgress: 1,
        rawLoadingPercentage: 100,
      }),
    ).toBe(false);

    expect(
      shouldDisableReplayForcingLoadingScreen({
        isForcingLoadingScreen: true,
        hasCurrentReplay: true,
        hasRequestedReplayData: true,
        isLoading: true,
        normalizedLoadingProgress: 1,
        rawLoadingPercentage: 100,
      }),
    ).toBe(false);
  });

  it('returns true when replay is ready and loading reaches terminal progress', () => {
    expect(
      shouldDisableReplayForcingLoadingScreen({
        isForcingLoadingScreen: true,
        hasCurrentReplay: true,
        hasRequestedReplayData: true,
        isLoading: false,
        normalizedLoadingProgress: 1,
        rawLoadingPercentage: 100,
      }),
    ).toBe(true);

    expect(
      shouldDisableReplayForcingLoadingScreen({
        isForcingLoadingScreen: true,
        hasCurrentReplay: true,
        hasRequestedReplayData: true,
        isLoading: false,
        normalizedLoadingProgress: 0.2,
        rawLoadingPercentage: -1,
      }),
    ).toBe(true);
  });
});
