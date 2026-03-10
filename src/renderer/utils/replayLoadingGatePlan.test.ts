import { buildReplayLoadingGatePlan } from './replayLoadingGatePlan';

describe('replayLoadingGatePlan', () => {
  it('returns no-op when startup gate is inactive', () => {
    const plan = buildReplayLoadingGatePlan({
      isReplayStartupGateActive: false,
      hasSeenReplayLoadStart: false,
      hasRequestedReplayData: false,
      isLoading: false,
      normalizedLoadingProgress: 0,
      rawLoadingPercentage: 0,
      isCurrentReplayActivationRequest: false,
    });

    expect(plan).toEqual({
      shouldSetHasSeenReplayLoadStart: false,
      shouldCloseStartupGate: false,
      shouldClearActivationRequest: false,
    });
  });

  it('marks load start when loading begins and not yet seen', () => {
    const plan = buildReplayLoadingGatePlan({
      isReplayStartupGateActive: true,
      hasSeenReplayLoadStart: false,
      hasRequestedReplayData: false,
      isLoading: true,
      normalizedLoadingProgress: 0,
      rawLoadingPercentage: 0,
      isCurrentReplayActivationRequest: false,
    });

    expect(plan).toEqual({
      shouldSetHasSeenReplayLoadStart: true,
      shouldCloseStartupGate: false,
      shouldClearActivationRequest: false,
    });
  });

  it('keeps gate open when loading cycle has not completed', () => {
    const plan = buildReplayLoadingGatePlan({
      isReplayStartupGateActive: true,
      hasSeenReplayLoadStart: true,
      hasRequestedReplayData: true,
      isLoading: true,
      normalizedLoadingProgress: 0.5,
      rawLoadingPercentage: 50,
      isCurrentReplayActivationRequest: false,
    });

    expect(plan).toEqual({
      shouldSetHasSeenReplayLoadStart: false,
      shouldCloseStartupGate: false,
      shouldClearActivationRequest: false,
    });
  });

  it('closes gate and clears activation request when cycle completes', () => {
    const plan = buildReplayLoadingGatePlan({
      isReplayStartupGateActive: true,
      hasSeenReplayLoadStart: true,
      hasRequestedReplayData: true,
      isLoading: false,
      normalizedLoadingProgress: 1,
      rawLoadingPercentage: 100,
      isCurrentReplayActivationRequest: true,
    });

    expect(plan).toEqual({
      shouldSetHasSeenReplayLoadStart: false,
      shouldCloseStartupGate: true,
      shouldClearActivationRequest: true,
    });
  });
});
