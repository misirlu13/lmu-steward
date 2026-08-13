import { useCallback, useEffect, useMemo, useState } from 'react';
import { CONSTANTS } from '@constants';
import { LiveSessionSummary } from '@types';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';

/**
 * Which replays have a captured live session behind them.
 *
 * Asked for once, at the top of a list, rather than per row: the answer is one
 * small array covering the whole library, and a lookup per replay would be a
 * round trip per row on a dashboard that draws hundreds.
 *
 * Only confirmed links count. A proposal is a suggestion nobody has answered
 * yet, and marking a replay as having evidence on the strength of one would put
 * a badge on a session whose capture may belong to the practice run before it.
 *
 * Keyed on the hash alone, unlike the link itself, which also carries an
 * identity key so a re-hashed replay keeps its capture. The renderer has no
 * identity key to look up with — it is built in main from the cache entry — so
 * a replay between a re-hash and the next sync loses the badge while keeping
 * the link. It comes back on its own, and the replay view resolves the link
 * properly either way.
 */
export const useLiveCaptureIndex = () => {
  const { subscribeToApiChannel, experimentalFeaturesEnabled } = useApi();
  const [sessions, setSessions] = useState<LiveSessionSummary[]>([]);

  const applySessions = useCallback((payload: unknown) => {
    const response = payload as {
      status?: string;
      data?: LiveSessionSummary[];
    };

    setSessions(
      response?.status === 'success' && Array.isArray(response.data)
        ? response.data
        : [],
    );
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToApiChannel(
      CONSTANTS.API.GET_LIVE_SESSIONS,
      applySessions,
    );

    /*
      Gated on the experimental flag rather than on live capture being on.
      Capture being off means nothing new is being recorded; it does not mean
      the sessions already on disk stop belonging to their replays.
    */
    if (experimentalFeaturesEnabled) {
      sendMessage(CONSTANTS.API.GET_LIVE_SESSIONS);
    } else {
      setSessions([]);
    }

    return unsubscribe;
  }, [applySessions, experimentalFeaturesEnabled, subscribeToApiChannel]);

  return useMemo(() => {
    const byReplay = new Map<string, LiveSessionSummary>();

    sessions.forEach((session) => {
      if (session.linkState !== 'linked' || !session.link) {
        return;
      }

      if (session.link.replayHash) {
        byReplay.set(session.link.replayHash, session);
      }
    });

    return byReplay;
  }, [sessions]);
};
