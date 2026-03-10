import { CONSTANTS } from '@constants';

type ApiChannel = (typeof CONSTANTS.API)[keyof typeof CONSTANTS.API];

export interface ReplayApiResponse<TData = unknown> {
  status?: 'success' | 'error';
  data?: TData;
  error?: unknown;
  message?: string;
}

type SessionInfoPayload = Record<string, unknown>;
type StandingsPayload = unknown;
type StandingsHistoryPayload = unknown;
type ReplayActivePayload = boolean | number | string | null;

export interface ReplayApiSubscription {
  channel: ApiChannel;
  callback: (data: unknown) => void;
}

export type ReplayApiSubscriptionCallback = ReplayApiSubscription['callback'];

const toReplayApiResponse = (data: unknown): ReplayApiResponse => {
  if (!data || typeof data !== 'object') {
    return {};
  }

  return data as ReplayApiResponse;
};

export const buildReplayApiSubscriptions = ({
  setSessionInfoData,
  setStandingsData,
  setStandingsHistoryData,
  setIsReplayActiveForRoute,
  onError,
}: {
  setSessionInfoData: (value: SessionInfoPayload | null) => void;
  setStandingsData: (value: StandingsPayload | null) => void;
  setStandingsHistoryData: (value: StandingsHistoryPayload | null) => void;
  setIsReplayActiveForRoute: (value: boolean | null) => void;
  onError?: (message: string, error: unknown) => void;
}): ReplayApiSubscription[] => {
  const reportError = onError ?? ((message: string, error: unknown) => console.error(message, error));

  return [
    {
      channel: CONSTANTS.API.GET_TRACK_MAP,
      callback: (data: unknown) => {
        const response = toReplayApiResponse(data);

        if (response.status === 'success') {
          return;
        }

        reportError(
          'Error fetching track map:',
          response.error ?? response.message ?? response,
        );
      },
    },
    {
      channel: CONSTANTS.API.GET_SESSION_INFO,
      callback: (data: unknown) => {
        const response = toReplayApiResponse(data) as ReplayApiResponse<SessionInfoPayload>;

        if (response.status !== 'success') {
          reportError(
            'Error fetching session info:',
            response.error ?? response.message ?? response,
          );
          return;
        }

        setSessionInfoData(response.data ?? null);
      },
    },
    {
      channel: CONSTANTS.API.GET_STANDINGS,
      callback: (data: unknown) => {
        const response = toReplayApiResponse(data) as ReplayApiResponse<StandingsPayload>;

        if (response.status !== 'success') {
          reportError(
            'Error fetching standings:',
            response.error ?? response.message ?? response,
          );
          return;
        }

        setStandingsData(response.data ?? null);
      },
    },
    {
      channel: CONSTANTS.API.GET_STANDINGS_HISTORY,
      callback: (data: unknown) => {
        const response = toReplayApiResponse(data) as ReplayApiResponse<StandingsHistoryPayload>;

        if (response.status !== 'success') {
          reportError(
            'Error fetching standings history:',
            response.error ?? response.message ?? response,
          );
          return;
        }

        setStandingsHistoryData(response.data ?? null);
      },
    },
    {
      channel: CONSTANTS.API.GET_IS_REPLAY_ACTIVE,
      callback: (data: unknown) => {
        const response = toReplayApiResponse(data) as ReplayApiResponse<ReplayActivePayload>;

        if (response.status !== 'success') {
          setIsReplayActiveForRoute(null);
          return;
        }

        setIsReplayActiveForRoute(Boolean(response.data));
      },
    },
  ];
};
