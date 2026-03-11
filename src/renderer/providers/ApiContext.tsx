import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { initializeMessageBus, sendMessage } from '../utils/postMessage';
import { CONSTANTS } from '@constants';
import { LMUReplay, LoadingState, ReplaySyncStatus } from '@types';

interface ReplayResponse {
  status: string;
  data: LMUReplay[];
}

interface RequestReplaysOptions {
  forceReplayCacheReset?: boolean;
}

type ApiChannel = (typeof CONSTANTS.API)[keyof typeof CONSTANTS.API];
type ApiChannelCallback = (data: unknown) => void;

interface ApiContextType {
  isConnected: boolean;
  hasApiStatusResponse: boolean;
  quickViewEnabled: boolean;
  lastReplaySyncAt: number | null;
  isReplaySyncInProgress: boolean;
  replaySyncStatus: ReplaySyncStatus;
  isReplayActive: boolean | null;
  currentTrackMap: { data?: unknown } | null;
  replays: ReplayResponse | null;
  currentReplay: LMUReplay | null;
  loadingState: LoadingState;
  markReplayCacheResetRequired: () => void;
  requestReplays: (options?: RequestReplaysOptions) => void;
  subscribeToApiChannel: (
    channel: ApiChannel,
    callback: ApiChannelCallback,
  ) => () => void;
}

const ApiContext = createContext<ApiContextType>({
  isConnected: false,
  hasApiStatusResponse: false,
  quickViewEnabled: false,
  lastReplaySyncAt: null,
  isReplaySyncInProgress: false,
  replaySyncStatus: {
    status: 'idle',
    percentage: 0,
    processed: 0,
    total: 0,
  },
  isReplayActive: null,
  currentTrackMap: null,
  replays: null,
  currentReplay: null,
  loadingState: { loading: false, percentage: -1 },
  markReplayCacheResetRequired: () => {},
  requestReplays: () => {},
  subscribeToApiChannel: () => () => {},
});

export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [hasApiStatusResponse, setHasApiStatusResponse] = useState(false);
  const [quickViewEnabled, setQuickViewEnabled] = useState(false);
  const [lastReplaySyncAt, setLastReplaySyncAt] = useState<number | null>(null);
  const [activeReplaySyncRequestCount, setActiveReplaySyncRequestCount] =
    useState(0);
  const [replaySyncStatus, setReplaySyncStatus] = useState<ReplaySyncStatus>({
    status: 'idle',
    percentage: 0,
    processed: 0,
    total: 0,
  });
  const [isReplayActive, setIsReplayActive] = useState<boolean | null>(null);
  const [isReplayCacheResetRequired, setIsReplayCacheResetRequired] =
    useState(false);
  const [currentTrackMap, setCurrentTrackMap] = useState<
    { data?: unknown } | null
  >(null);
  const [replays, setReplays] = useState<ReplayResponse | null>(null);
  const [currentReplay, setCurrentReplay] = useState<LMUReplay | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    loading: false,
    percentage: -1,
  });
  const [apiStatusInterval, setApiStatusInterval] = useState<number>(5000);
  const additionalCallbacksRef = useRef<
    Partial<Record<ApiChannel, Set<ApiChannelCallback>>>
  >({});

  const subscribeToApiChannel = useCallback(
    (channel: ApiChannel, callback: ApiChannelCallback) => {
      if (!additionalCallbacksRef.current[channel]) {
        additionalCallbacksRef.current[channel] = new Set<ApiChannelCallback>();
      }

      additionalCallbacksRef.current[channel]?.add(callback);

      return () => {
        additionalCallbacksRef.current[channel]?.delete(callback);
      };
    },
    [],
  );

  const runAdditionalCallbacks = useCallback(
    (channel: ApiChannel, data: unknown) => {
      additionalCallbacksRef.current[channel]?.forEach((callback) => {
        callback(data);
      });
    },
    [],
  );

  const markReplayCacheResetRequired = useCallback(() => {
    setIsReplayCacheResetRequired(true);
  }, []);

  const requestReplays = useCallback((options?: RequestReplaysOptions) => {
    setActiveReplaySyncRequestCount((previousCount) => previousCount + 1);
    setReplaySyncStatus({
      status: 'in-progress',
      percentage: 0,
      processed: 0,
      total: 0,
    });

    const shouldForceReplayCacheReset =
      Boolean(options?.forceReplayCacheReset) || isReplayCacheResetRequired;
    const payload = shouldForceReplayCacheReset
      ? { forceReplayCacheReset: true }
      : options;

    if (shouldForceReplayCacheReset && isReplayCacheResetRequired) {
      setIsReplayCacheResetRequired(false);
    }

    sendMessage(CONSTANTS.API.GET_REPLAYS, payload);
  }, [isReplayCacheResetRequired]);

  useEffect(() => {
    const createHandler = (
      channel: ApiChannel,
      onData?: (data: unknown) => void,
    ) => {
      return (data: unknown) => {
        onData?.(data);
        runAdditionalCallbacks(channel, data);
      };
    };

    const messageBusHandlers = {
      [CONSTANTS.API.GET_API_STATUS]: createHandler(
        CONSTANTS.API.GET_API_STATUS,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: {
              loadingStatus?: {
                loading?: boolean;
                percentage?: number;
              };
            };
          };
          const nextLoading = payload?.data?.loadingStatus?.loading ?? false;
          const nextPercentage = payload?.data?.loadingStatus?.percentage ?? -1;

          setLoadingState((previous) => {
            if (
              previous.loading === nextLoading &&
              previous.percentage === nextPercentage
            ) {
              return previous;
            }

            return {
              loading: nextLoading,
              percentage: nextPercentage,
            };
          });
          setHasApiStatusResponse(true);
          setIsConnected(payload.status === 'success');
        },
      ),
      [CONSTANTS.API.GET_TRACK_MAP]: createHandler(
        CONSTANTS.API.GET_TRACK_MAP,
        (data: unknown) => {
          const payload = data as { status?: string; message?: string };
          if (payload?.status === 'success') {
            setCurrentTrackMap(payload as { data?: unknown });
            return;
          }

          console.error('Failed to fetch track map:', payload?.message || data);
        },
      ),
      [CONSTANTS.API.GET_REPLAYS]: createHandler(
        CONSTANTS.API.GET_REPLAYS,
        (data: unknown) => {
          const payload = data as ReplayResponse & { message?: string };
          setActiveReplaySyncRequestCount((previousCount) =>
            Math.max(0, previousCount - 1),
          );
          setReplays(payload);

          if (payload?.status === 'success') {
            setLastReplaySyncAt(Date.now());
            setReplaySyncStatus((previous) => ({
              ...previous,
              status: 'success',
              percentage: 1,
            }));
            return;
          }

          setReplaySyncStatus((previous) => ({
            ...previous,
            status: 'error',
            message: payload?.message,
          }));
        },
      ),
      [CONSTANTS.API.PUSH_REPLAY_SYNC_STATUS]: createHandler(
        CONSTANTS.API.PUSH_REPLAY_SYNC_STATUS,
        (data: unknown) => {
          const payload = data as ReplaySyncStatus;
          const normalizedPercentage = Math.max(
            0,
            Math.min(1, Number(payload?.percentage ?? 0)),
          );
          const normalizedProcessed = Math.max(
            0,
            Number(payload?.processed ?? 0),
          );
          const normalizedTotal = Math.max(0, Number(payload?.total ?? 0));

          setReplaySyncStatus({
            status: payload?.status ?? 'idle',
            percentage: normalizedPercentage,
            processed: normalizedProcessed,
            total: normalizedTotal,
            message: payload?.message,
          });
        },
      ),
      [CONSTANTS.API.GET_IS_REPLAY_ACTIVE]: createHandler(
        CONSTANTS.API.GET_IS_REPLAY_ACTIVE,
        (data: unknown) => {
          const payload = data as { status?: string; data?: boolean };
          if (payload?.status === 'success') {
            setIsReplayActive(Boolean(payload?.data));
            return;
          }

          setIsReplayActive(null);
        },
      ),
      [CONSTANTS.API.POST_WATCH_REPLAY]: createHandler(
        CONSTANTS.API.POST_WATCH_REPLAY,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: LMUReplay;
            message?: string;
          };

          if (payload.status === 'success') {
            setCurrentReplay(payload.data ?? null);
          } else {
            console.error('Failed to set replay as active:', payload.message);
          }
        },
      ),
      [CONSTANTS.API.GET_STANDINGS]: createHandler(CONSTANTS.API.GET_STANDINGS),
      [CONSTANTS.API.GET_STANDINGS_HISTORY]: createHandler(
        CONSTANTS.API.GET_STANDINGS_HISTORY,
      ),
      [CONSTANTS.API.GET_USER_SETTINGS]: createHandler(
        CONSTANTS.API.GET_USER_SETTINGS,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: { quickViewEnabled?: boolean };
          };

          if (payload?.status !== 'success') {
            return;
          }

          if (typeof payload?.data?.quickViewEnabled === 'boolean') {
            setQuickViewEnabled(payload.data.quickViewEnabled);
          }
        },
      ),
      [CONSTANTS.API.PUSH_USER_SETTINGS]: createHandler(
        CONSTANTS.API.PUSH_USER_SETTINGS,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: { quickViewEnabled?: boolean };
          };

          if (payload?.status !== 'success') {
            return;
          }

          if (typeof payload?.data?.quickViewEnabled === 'boolean') {
            setQuickViewEnabled(payload.data.quickViewEnabled);
          }
        },
      ),
      [CONSTANTS.API.POST_USER_SETTINGS]: createHandler(
        CONSTANTS.API.POST_USER_SETTINGS,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: { quickViewEnabled?: boolean };
          };

          if (payload?.status !== 'success') {
            return;
          }

          if (typeof payload?.data?.quickViewEnabled === 'boolean') {
            setQuickViewEnabled(payload.data.quickViewEnabled);
          }
        },
      ),
      [CONSTANTS.API.GET_SESSION_INFO]: createHandler(
        CONSTANTS.API.GET_SESSION_INFO,
      ),
      [CONSTANTS.API.POST_CLOSE_REPLAY]: createHandler(
        CONSTANTS.API.POST_CLOSE_REPLAY,
      ),
    };

    initializeMessageBus(messageBusHandlers);
  }, [runAdditionalCallbacks, setIsConnected, setCurrentTrackMap, setReplays]);

  useEffect(() => {
    return () => {
      additionalCallbacksRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (loadingState.loading) {
      setApiStatusInterval(1000); // Check more frequently when loading
    } else {
      setApiStatusInterval(5000); // Check less frequently when not loading
    }
  }, [loadingState]);

  useEffect(() => {
    // Poll for API status updates
    const checkConnection = async () => {
      sendMessage(CONSTANTS.API.GET_API_STATUS);
    };
    checkConnection();
    sendMessage(CONSTANTS.API.GET_USER_SETTINGS);
    const _id = setInterval(checkConnection, apiStatusInterval);
    return () => {
      clearInterval(_id);
    };
  }, [apiStatusInterval]);

  const contextValue: ApiContextType = {
    isConnected,
    hasApiStatusResponse,
    quickViewEnabled,
    lastReplaySyncAt,
    isReplaySyncInProgress: activeReplaySyncRequestCount > 0,
    replaySyncStatus,
    isReplayActive,
    currentTrackMap,
    replays,
    currentReplay,
    loadingState,
    markReplayCacheResetRequired,
    requestReplays,
    subscribeToApiChannel,
  };

  return (
    <ApiContext.Provider value={contextValue}>{children}</ApiContext.Provider>
  );
};

export const useApi = () => useContext(ApiContext);
