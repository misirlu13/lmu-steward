import { CONSTANTS } from '@constants';

type ApiChannel = (typeof CONSTANTS.API)[keyof typeof CONSTANTS.API];

export interface ReplayDataFetchPlan {
  shouldRequest: boolean;
  channels: ApiChannel[];
}

export const buildReplayDataFetchPlan = ({
  hasCurrentReplay,
  hasRequestedReplayData,
  isReplayActiveForRoute,
}: {
  hasCurrentReplay: boolean;
  hasRequestedReplayData: boolean;
  isReplayActiveForRoute: boolean | null;
}): ReplayDataFetchPlan => {
  if (!hasCurrentReplay || hasRequestedReplayData || isReplayActiveForRoute !== true) {
    return {
      shouldRequest: false,
      channels: [],
    };
  }

  return {
    shouldRequest: true,
    channels: [
      CONSTANTS.API.GET_TRACK_MAP,
      CONSTANTS.API.GET_STANDINGS,
      CONSTANTS.API.GET_STANDINGS_HISTORY,
      CONSTANTS.API.GET_SESSION_INFO,
    ],
  };
};
