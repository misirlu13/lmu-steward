import { buildReplayActivationPlan } from './replayActivationPlan';

describe('replayActivationPlan', () => {
  it('skips when hash is missing or quick view is active', () => {
    expect(
      buildReplayActivationPlan({
        replayHash: undefined,
        isQuickViewModeActive: false,
        isReplayActive: null,
        hasReplayBeenActive: false,
        currentReplayHash: undefined,
        activationRequestHash: null,
        cachedData: undefined,
      }).type,
    ).toBe('skip');

    expect(
      buildReplayActivationPlan({
        replayHash: 'abc',
        isQuickViewModeActive: true,
        isReplayActive: null,
        hasReplayBeenActive: false,
        currentReplayHash: undefined,
        activationRequestHash: null,
        cachedData: undefined,
      }).type,
    ).toBe('skip');
  });

  it('refreshes status when active replay matches while activation is in progress', () => {
    const plan = buildReplayActivationPlan({
      replayHash: 'abc',
      isQuickViewModeActive: false,
      isReplayActive: true,
      hasReplayBeenActive: true,
      currentReplayHash: 'abc',
      activationRequestHash: 'abc',
      cachedData: {
        sessionInfoData: {},
        standingsData: {},
        standingsHistoryData: {},
      },
    });

    expect(plan.type).toBe('refresh-status');
  });

  it('reuses active replay and exposes cache/track-map flags', () => {
    const plan = buildReplayActivationPlan({
      replayHash: 'abc',
      isQuickViewModeActive: false,
      isReplayActive: true,
      hasReplayBeenActive: true,
      currentReplayHash: 'abc',
      activationRequestHash: null,
      cachedData: {
        sessionInfoData: {},
        standingsData: {},
        standingsHistoryData: {},
      },
    });

    expect(plan).toEqual({
      type: 'reuse-active-replay',
      hasCachedReplayData: true,
      shouldRequestTrackMap: true,
    });
  });

  it('activates replay when not active and no request is in progress', () => {
    const plan = buildReplayActivationPlan({
      replayHash: 'abc',
      isQuickViewModeActive: false,
      isReplayActive: null,
      hasReplayBeenActive: false,
      currentReplayHash: 'def',
      activationRequestHash: null,
      cachedData: undefined,
    });

    expect(plan.type).toBe('activate-replay');
  });

  it('skips duplicate activation requests for the same hash', () => {
    const plan = buildReplayActivationPlan({
      replayHash: 'abc',
      isQuickViewModeActive: false,
      isReplayActive: null,
      hasReplayBeenActive: false,
      currentReplayHash: 'def',
      activationRequestHash: 'abc',
      cachedData: undefined,
    });

    expect(plan.type).toBe('skip');
  });
});
