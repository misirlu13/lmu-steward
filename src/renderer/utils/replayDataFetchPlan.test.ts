import { CONSTANTS } from '@constants';
import { buildReplayDataFetchPlan } from './replayDataFetchPlan';

describe('replayDataFetchPlan', () => {
  it('returns no-op plan when replay is missing', () => {
    const plan = buildReplayDataFetchPlan({
      hasCurrentReplay: false,
      hasRequestedReplayData: false,
      isReplayActiveForRoute: true,
    });

    expect(plan).toEqual({ shouldRequest: false, channels: [] });
  });

  it('returns no-op plan when replay data was already requested', () => {
    const plan = buildReplayDataFetchPlan({
      hasCurrentReplay: true,
      hasRequestedReplayData: true,
      isReplayActiveForRoute: true,
    });

    expect(plan).toEqual({ shouldRequest: false, channels: [] });
  });

  it('returns no-op plan when replay route is not active', () => {
    const plan = buildReplayDataFetchPlan({
      hasCurrentReplay: true,
      hasRequestedReplayData: false,
      isReplayActiveForRoute: null,
    });

    expect(plan).toEqual({ shouldRequest: false, channels: [] });
  });

  it('returns request plan with required channels when ready', () => {
    const plan = buildReplayDataFetchPlan({
      hasCurrentReplay: true,
      hasRequestedReplayData: false,
      isReplayActiveForRoute: true,
    });

    expect(plan.shouldRequest).toBe(true);
    expect(plan.channels).toEqual([
      CONSTANTS.API.GET_TRACK_MAP,
      CONSTANTS.API.GET_STANDINGS,
      CONSTANTS.API.GET_STANDINGS_HISTORY,
      CONSTANTS.API.GET_SESSION_INFO,
    ]);
  });
});
