import { buildReplayCompletionHoldPlan } from './replayCompletionHoldPlan';

describe('replayCompletionHoldPlan', () => {
  it('returns reset when loading is not complete', () => {
    expect(
      buildReplayCompletionHoldPlan({
        hasCurrentReplay: true,
        hasRequestedReplayData: true,
        isLoading: true,
        normalizedLoadingProgress: 0.5,
        hasCompletedHoldForCycle: false,
        isHoldingAtComplete: false,
        hasPendingHoldTimeout: false,
      }),
    ).toBe('reset');
  });

  it('returns start-hold when load is complete and hold has not started', () => {
    expect(
      buildReplayCompletionHoldPlan({
        hasCurrentReplay: true,
        hasRequestedReplayData: true,
        isLoading: false,
        normalizedLoadingProgress: 1,
        hasCompletedHoldForCycle: false,
        isHoldingAtComplete: false,
        hasPendingHoldTimeout: false,
      }),
    ).toBe('start-hold');
  });

  it('returns noop when hold already started or queued', () => {
    expect(
      buildReplayCompletionHoldPlan({
        hasCurrentReplay: true,
        hasRequestedReplayData: true,
        isLoading: false,
        normalizedLoadingProgress: 1,
        hasCompletedHoldForCycle: true,
        isHoldingAtComplete: false,
        hasPendingHoldTimeout: false,
      }),
    ).toBe('noop');

    expect(
      buildReplayCompletionHoldPlan({
        hasCurrentReplay: true,
        hasRequestedReplayData: true,
        isLoading: false,
        normalizedLoadingProgress: 1,
        hasCompletedHoldForCycle: false,
        isHoldingAtComplete: true,
        hasPendingHoldTimeout: false,
      }),
    ).toBe('noop');

    expect(
      buildReplayCompletionHoldPlan({
        hasCurrentReplay: true,
        hasRequestedReplayData: true,
        isLoading: false,
        normalizedLoadingProgress: 1,
        hasCompletedHoldForCycle: false,
        isHoldingAtComplete: false,
        hasPendingHoldTimeout: true,
      }),
    ).toBe('noop');
  });
});
