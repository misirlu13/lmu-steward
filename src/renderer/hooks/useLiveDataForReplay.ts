import { useCallback, useEffect, useState } from 'react';
import { CONSTANTS } from '@constants';
import { LiveDataForReplay } from '@types';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';

/**
 * The captured live session linked to this replay, if there is one.
 *
 * Fetched once per replay rather than polled: a captured session is finished
 * data, and the link only changes when a steward changes it.
 *
 * Null is the ordinary answer. Most replays have no captured session behind
 * them — LMU only writes a replay when replay saving is on, and live capture is
 * off by default — so nothing here treats its absence as a problem.
 */
export const useLiveDataForReplay = (replayHash: string | undefined) => {
  /*
    Gated on the experimental flag, not on the capture setting. Capture being
    off means nothing new is being recorded — it does not mean the evidence
    already on disk should disappear from the replay it belongs to. A steward
    who finishes a season and turns capture off must keep what they captured.
  */
  const { subscribeToApiChannel, experimentalFeaturesEnabled } = useApi();
  const [liveData, setLiveData] = useState<LiveDataForReplay | null>(null);

  const applyLiveData = useCallback((payload: unknown) => {
    const response = payload as {
      status?: string;
      data?: LiveDataForReplay | null;
    };

    setLiveData(
      response?.status === 'success' ? (response.data ?? null) : null,
    );
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToApiChannel(
      CONSTANTS.API.GET_LIVE_DATA_FOR_REPLAY,
      applyLiveData,
    );

    /*
      Cleared before asking, so a replay with live data followed by one without
      cannot briefly show the previous replay's evidence against this one's
      incidents.
    */
    setLiveData(null);

    if (replayHash && experimentalFeaturesEnabled) {
      sendMessage(CONSTANTS.API.GET_LIVE_DATA_FOR_REPLAY, { replayHash });
    }

    return unsubscribe;
  }, [
    applyLiveData,
    experimentalFeaturesEnabled,
    replayHash,
    subscribeToApiChannel,
  ]);

  return liveData;
};
