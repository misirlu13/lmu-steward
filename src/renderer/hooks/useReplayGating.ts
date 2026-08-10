import { useApi } from '../providers/ApiContext';
import { deriveLiveIndicator } from './useLiveIndicator';

/**
 * Why every View Replay control goes dead while a session is running.
 *
 * One exported string rather than a sentence per call site. Loading a replay is
 * the same act wherever it is triggered from, and a steward who reads two
 * different explanations for the same dead button learns to trust neither.
 *
 * The second sentence exists because the live view now has a **Rewatch** button
 * that visibly rewinds the game, and without it these two read as a flat
 * contradiction — one screen refusing to touch the replay while another rewinds
 * it on request. They are different acts. Loading a *stored* replay calls
 * `/rest/watch/play/{id}` and makes the game load a different session, ending
 * the one being captured. Scrubbing the running session's own buffer moves only
 * the rendered camera: scoring keeps advancing, standings keep reporting live
 * values, and the capture never sees it.
 */
export const LIVE_SESSION_REPLAY_BLOCK_REASON =
  'A live session is running. Loading a stored replay takes over Le Mans Ultimate and would end the session, so this is unavailable until it finishes. Rewatching an incident from the live view is a different thing and stays available — it rewinds only the picture.';

/**
 * Whether loading a replay right now would interrupt a running session.
 *
 * Opening a replay is not a read: `POST_WATCH_REPLAY` calls
 * `/rest/watch/play/{id}`, which makes the game load it. Mid-race that ends
 * what is being captured, and nothing puts the session back.
 *
 * Derived through `deriveLiveIndicator` rather than reading
 * `liveSessionStatus.state` directly so that what counts as "live" has one
 * definition, shared with the navbar indicator.
 */
export const useIsReplayBlockedByLiveSession = (): boolean => {
  const { isConnected, hasApiStatusResponse, liveSessionStatus } = useApi();

  return (
    deriveLiveIndicator({
      isConnected,
      hasApiStatusResponse,
      liveSessionStatus,
    }).state === 'live'
  );
};

/** The reason string when blocked, or null — the shape disabled controls take. */
export const useViewReplayDisabledReason = (): string | null =>
  useIsReplayBlockedByLiveSession() ? LIVE_SESSION_REPLAY_BLOCK_REASON : null;
