import { useCallback, useEffect, useRef, useState } from 'react';
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

  /*
    Which replay this hook currently wants an answer about, read at reply time
    rather than closed over. A ref rather than a dependency so the subscription
    is not torn down and rebuilt every time the route changes — the same
    arrangement `useLiveIncidentContext` uses.
  */
  const wanted = useRef(replayHash);
  wanted.current = replayHash;

  const applyLiveData = useCallback((payload: unknown) => {
    const response = payload as {
      status?: string;
      replayHash?: string;
      data?: LiveDataForReplay | null;
    };

    /*
      Answers about a different replay are dropped rather than applied.

      Navigating away and back re-asks, and the reply for the previous replay
      can still be in flight — landing a `null` on a replay that does have
      evidence, which reads on screen as the capture having gone missing.
      Replies from before main started echoing the hash carry none, and are
      still accepted: an answer that cannot identify itself is no worse than
      the unconditional behaviour it replaces.
    */
    if (response?.replayHash && response.replayHash !== wanted.current) {
      return;
    }

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
