import { useEffect, useRef, useState } from 'react';
import { CONSTANTS } from '@constants';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';
import { CameraMode, cameraModeFromGroup } from './useCameraControls';

/**
 * 1 Hz — the rate at which a human notices being lied to, not a data rate.
 *
 * Nothing here is sampled data; all three answers are booleans and small
 * integers that change only when somebody changes them. The poll exists so the
 * app stops guessing, and a second is fast enough that a steward who moves the
 * game's camera or presses its LIVE button never gets far into believing the
 * app before it catches up. All three endpoints answer in 0–8 ms on a pooled
 * client, so the cost of asking is not the consideration.
 */
const POLL_INTERVAL_MS = 1000;

/**
 * What the game says it is doing, as opposed to what the app last told it to.
 *
 * Rebuilt on **every** reply rather than only when a value moves, and consumers
 * are expected to reconcile against the object identity. That is load-bearing:
 * the failure being fixed here is a command that did not take effect, and "the
 * value did not change" is precisely the signal a value-keyed effect throws
 * away. A reading that repeats the same slot id for five seconds is how the app
 * learns its own pointer is wrong.
 */
export interface LiveGameCameraReading {
  /** Which car is on screen, per `GET /rest/watch/focus`. */
  focusedSlotId?: number;
  /** Which group is on screen, per `getCameraInfo`'s `currentCameraGroup`. */
  mode?: CameraMode;
}

/**
 * The slot id out of a focus reply.
 *
 * Two shapes accepted because the endpoint's response body is **not** in LMU's
 * Swagger spec — the spec documents paths, methods and parameters only — so the
 * shape is known from a live call and a mock written from one, which is thinner
 * evidence than it looks. A bare `30` and a `{slotID: 30}` are both valid JSON
 * from `response.json()`, and guessing wrong here would silently disable the
 * reconciliation this whole hook exists for.
 */
const readFocusedSlotId = (data: unknown): number | undefined => {
  if (typeof data === 'number') {
    return Number.isFinite(data) ? data : undefined;
  }

  const record = data as { slotID?: unknown; slotId?: unknown } | null;
  const slot = Number(record?.slotID ?? record?.slotId);

  return Number.isFinite(slot) ? slot : undefined;
};

/**
 * Ask Le Mans Ultimate what it is actually showing.
 *
 * Three channels, one timer, because they answer one question between them:
 * *is the app's picture of the game still true?* `isActive` says whether the
 * picture is live or rewound, `/rest/watch/focus` says which car is on screen,
 * and `getCameraInfo` says which camera group. The first two of those have no
 * setter that reports back — `toggleactive` is a toggle, and focus is fire and
 * forget — so reading is the only way to know.
 *
 * **`isReplayActive` is not returned from state held here.** It lives in
 * `ApiContext`, where the replay view already reads it, and is forwarded rather
 * than duplicated: two copies of "is a replay playing" derived from two polls is
 * the defect shape this whole change is about.
 *
 * The polling decision is deliberate and goes against `live-steward-outstanding.md`
 * §1, which proposed reading focus once on mount and again on window focus.
 * Mount-and-focus cannot see the case that actually bites — LMU's own
 * auto-director moving the camera while the steward watches, with the app's
 * window never losing focus — and `isActive` has to be polled regardless,
 * because the steward can press the game's LIVE button at any moment. Given a
 * timer exists either way, a second one gated on window events would be two
 * mechanisms for one job. The section's real objection, that reconciling
 * mid-step fights the steward's own stepping, is answered where the value is
 * consumed rather than by refusing to read it: a command the app has issued and
 * the game has not yet confirmed outranks the reading until it is confirmed.
 */
export const useLiveGameState = (
  /** False when nothing can be driving the camera, so nothing is requested. */
  enabled: boolean,
) => {
  const { isReplayActive, subscribeToApiChannel } = useApi();
  const [camera, setCamera] = useState<LiveGameCameraReading | undefined>();

  /*
    Held in a ref for the same reason `useLiveCarPositions` does it: the effect
    restarts when the feed is switched on or off, not when a context callback
    gets a new identity on a poll tick.
  */
  const subscribe = useRef(subscribeToApiChannel);
  subscribe.current = subscribeToApiChannel;

  useEffect(() => {
    if (!enabled) {
      setCamera((previous) => (previous === undefined ? previous : undefined));
      return undefined;
    }

    const unsubscribeFocus = subscribe.current(
      CONSTANTS.API.GET_FOCUSED_CAR,
      (payload: unknown) => {
        const response = payload as { status?: string; data?: unknown };
        const focusedSlotId =
          response?.status === 'success'
            ? readFocusedSlotId(response.data)
            : undefined;

        setCamera((previous) => ({ ...previous, focusedSlotId }));
      },
    );

    const unsubscribeCamera = subscribe.current(
      CONSTANTS.API.GET_CAMERA_INFO,
      (payload: unknown) => {
        const response = payload as {
          status?: string;
          data?: { currentCameraGroup?: string };
        };
        const mode =
          response?.status === 'success'
            ? cameraModeFromGroup(response.data?.currentCameraGroup)
            : undefined;

        setCamera((previous) => ({ ...previous, mode }));
      },
    );

    const poll = () => {
      sendMessage(CONSTANTS.API.GET_IS_REPLAY_ACTIVE);
      sendMessage(CONSTANTS.API.GET_FOCUSED_CAR);
      sendMessage(CONSTANTS.API.GET_CAMERA_INFO);
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
      unsubscribeFocus?.();
      unsubscribeCamera?.();
    };
  }, [enabled]);

  return {
    /** True/false from the game, or null when it could not be asked. */
    isReplayActive: enabled ? (isReplayActive ?? null) : null,
    camera,
  };
};
