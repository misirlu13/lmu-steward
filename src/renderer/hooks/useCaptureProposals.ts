import { useCallback, useEffect, useRef, useState } from 'react';
import { CONSTANTS } from '@constants';
import { LiveSessionSummary } from '@types';
import { useApi } from '../providers/ApiContext';
import { sendMessage } from '../utils/postMessage';

type ApiChannel = (typeof CONSTANTS.API)[keyof typeof CONSTANTS.API];

/**
 * Captured sessions with a replay waiting to be confirmed.
 *
 * `proposed` only, deliberately — not every session without a link. An unlinked
 * session is a normal resting state: LMU only writes a replay when replay
 * saving is on, practice replays are often not kept, and the reconciliation
 * design is explicit that an unlinked session "must never nag"
 * (`live-replay-reconciliation-design.md`). Counting those would leave a
 * permanent badge for sessions the user cannot do anything about, which teaches
 * them to ignore it — and then it is worth nothing on the day it matters.
 *
 * A proposal is the one state with a question in it: something matched, and
 * only a human can say whether it is right.
 */
export const countPendingCaptureProposals = (
  sessions: LiveSessionSummary[],
): number =>
  sessions.filter((session) => session.linkState === 'proposed').length;

/**
 * Every channel that replies with the full session list, so the count follows a
 * link, an unlink, a dismissal or a delete without asking again.
 */
const LIST_BEARING_CHANNELS: ApiChannel[] = [
  CONSTANTS.API.GET_LIVE_SESSIONS,
  CONSTANTS.API.POST_LINK_LIVE_SESSION,
  CONSTANTS.API.POST_DISMISS_LIVE_SESSION_MATCH,
  CONSTANTS.API.POST_DELETE_LIVE_SESSION,
];

/**
 * How long a count is trusted before another read is worth its cost.
 *
 * `GET_LIVE_SESSIONS` runs a full match pass on the way out — a result log read
 * per session still waiting for a replay — which is why it is deliberately tied
 * to opening the list rather than to a timer. Putting that behind every route
 * change would undo that; linking is not time-critical enough to pay for it.
 */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * How many captured sessions have a replay proposed and unconfirmed.
 *
 * Asked for on navigation rather than polled. `pathname` is passed in rather
 * than read from the router here so the trigger is explicit at the call site
 * and the hook stays testable without one.
 */
export const usePendingCaptureProposalCount = (pathname: string): number => {
  const { liveCaptureEnabled, subscribeToApiChannel } = useApi();
  const [count, setCount] = useState(0);
  const lastRequestedAtRef = useRef(0);

  const applyList = useCallback((payload: unknown) => {
    const response = payload as { data?: LiveSessionSummary[] };

    if (Array.isArray(response?.data)) {
      setCount(countPendingCaptureProposals(response.data));
    }
  }, []);

  useEffect(() => {
    if (!liveCaptureEnabled) {
      return undefined;
    }

    const unsubscribes = LIST_BEARING_CHANNELS.map((channel) =>
      subscribeToApiChannel(channel, applyList),
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [applyList, liveCaptureEnabled, subscribeToApiChannel]);

  useEffect(() => {
    // With capture off nothing is ever recorded, so there is nothing to count
    // and nothing worth asking main for.
    if (!liveCaptureEnabled) {
      setCount(0);
      return;
    }

    const now = Date.now();
    if (now - lastRequestedAtRef.current < REFRESH_INTERVAL_MS) {
      return;
    }

    lastRequestedAtRef.current = now;
    sendMessage(CONSTANTS.API.GET_LIVE_SESSIONS);
  }, [liveCaptureEnabled, pathname]);

  return count;
};
