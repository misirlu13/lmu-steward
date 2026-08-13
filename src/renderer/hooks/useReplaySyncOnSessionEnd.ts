import { useEffect, useRef } from 'react';
import { CONSTANTS } from '@constants';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';

/**
 * How long to let the game finish writing before going looking for the replay.
 *
 * Le Mans Ultimate writes the .Vcr as the session ends, and a scan that arrives
 * mid-write reads a file that is not finished. Generous rather than tuned: the
 * cost of waiting is that a link appears half a minute later, and the cost of
 * being early is a replay recorded at the wrong length. The manual sync on the
 * captured screen is there for the case this still misses.
 */
const REPLAY_SETTLE_MS = 30_000;

/**
 * Goes looking for the replay of a session that has just ended.
 *
 * Without this the link only ever appeared by accident. The match pass behind
 * the captured-sessions list reads the replay *cache*, and the cache is only
 * refreshed by a sync — so the replay LMU had just written was invisible to
 * matching until the steward happened to open the replay list and sync it. The
 * capture sat there unlinked, and nothing on screen suggested a sync was what
 * it was waiting for.
 *
 * Driven off the game's own session state going from live to not-live, which is
 * the same signal the live view stands itself down on. Mounted once, at the app
 * shell: a session ends while the steward is watching the live view, not while
 * they are on the screen that would benefit.
 */
export const useReplaySyncOnSessionEnd = () => {
  const { liveSessionStatus, liveCaptureEnabled, syncReplaysInBackground } =
    useApi();
  const wasLive = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const isLive = liveSessionStatus.state === 'live';
    const hasEnded = wasLive.current && !isLive;
    wasLive.current = isLive;

    /*
      Only where there is a capture for a replay to be linked to. With capture
      off, a session ending is just a session ending, and walking the replay
      directory for it would be work on behalf of nobody.
    */
    if (!hasEnded || !liveCaptureEnabled) {
      return undefined;
    }

    timeoutRef.current = setTimeout(() => {
      syncReplaysInBackground();
      /*
        And then ask for the list, which is what actually runs the match pass
        against the newly-synced cache. Sending it straight after the sync is
        deliberate: main handles these in order, so the pass sees the refreshed
        cache rather than the one the sync replaced.
      */
      sendMessage(CONSTANTS.API.GET_LIVE_SESSIONS);
    }, REPLAY_SETTLE_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [liveCaptureEnabled, liveSessionStatus.state, syncReplaysInBackground]);
};

export const REPLAY_SYNC_SETTLE_MS = REPLAY_SETTLE_MS;
