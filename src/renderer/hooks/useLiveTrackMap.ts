import { useEffect, useRef, useState } from 'react';
import { CONSTANTS } from '@constants';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';
import {
  extractTrackMapPoints,
  extractTrackPitLanePoints,
} from '../utils/replaySelectors';
import { TrackPoints } from '../utils/trackMapToSVG';

/**
 * How long to wait before asking again while the game has no geometry yet.
 *
 * Deliberately slow. The response is ~107 KB and the answer changes at most
 * once per session, so this is a patient wait for a session to finish loading
 * rather than a poll — the 1 Hz cadence the rest of the live view runs at would
 * be a hundredfold more traffic for nothing.
 */
const RETRY_INTERVAL_MS = 5000;

export type LiveTrackMapState =
  /** Nothing has been asked for — no live session, or nothing to draw on. */
  | 'idle'
  /** Asked, and the game has not given us geometry yet. Keep waiting. */
  | 'waiting'
  | 'ready'
  /** The request itself failed, repeatedly. */
  | 'error';

export interface LiveTrackMapResult {
  /** The racing line. Everything is measured and drawn against this. */
  points: TrackPoints[];
  /**
   * The pit lane, drawn faintly under the cars. Empty is normal — readiness is
   * judged on the racing line alone, since a track map without one is nothing.
   */
  pitPoints: TrackPoints[];
  state: LiveTrackMapState;
  /** The last failure, for the panel to show rather than swallow. */
  error?: string;
}

const NOTHING_HELD = { points: [], pitPoints: [] };

/**
 * The running session's track geometry, fetched once and then left alone.
 *
 * `/rest/watch/trackMap` serves whatever session the game has loaded, not only
 * a replay — verified live at Laguna Seca against a 37-car practice session with
 * no replay ever loaded in that app run, and in the same world space as the
 * standings rows' `posX`/`posZ`. So there is nothing to derive and no outline to
 * accumulate from lap distance; there is only a fetch, and the question of when
 * it starts answering.
 *
 * That question is the reason this is a hook rather than one `sendMessage`.
 * **An empty array is "the session is still loading", not "this track has no
 * map"** — the endpoint was only ever confirmed against a session that was
 * already running, so nothing is known about what it returns during load. It is
 * asked again, slowly, until it answers. Once it has, it is never asked again
 * for that track: the geometry does not change under a running session.
 *
 * Held on its own IPC channel rather than the replay view's `GET_TRACK_MAP`,
 * whose reply `ApiContext` writes to the shared `currentTrackMap`. See the
 * channel's comment in constants.ts.
 */
export const useLiveTrackMap = (
  /** Resets the fetch — a new track means the geometry we hold is wrong. */
  trackKey: string,
  /** False when there is no session to draw, so nothing is requested at all. */
  enabled: boolean,
): LiveTrackMapResult => {
  const { subscribeToApiChannel } = useApi();
  /*
    Initialised to what the first render already knows, rather than to `idle`
    and corrected by the effect. A write on mount would re-render the whole live
    shell one extra time for nothing — and "for nothing" is not quite true:
    MUI's `Badge` reads its *previous* props while invisible, so the rail's
    unreviewed count rendered an invisible `0` on that second pass where it had
    rendered empty on the first. Nothing visible changed, which is exactly why
    it is worth not doing.
  */
  const [result, setResult] = useState<LiveTrackMapResult>(() => ({
    ...NOTHING_HELD,
    state: enabled ? 'waiting' : 'idle',
  }));

  /*
    Read by the subscription callback rather than closed over, so a reply
    landing between renders is always judged against the track that is current
    now. Without it a slow response from the previous track could be accepted as
    this one's geometry.
  */
  const wanted = useRef(trackKey);
  wanted.current = trackKey;

  /*
    Held in a ref so the effect below depends on the two things that genuinely
    mean "start the fetch again", and not on the identity of a context callback.
    A provider that hands down a fresh `subscribeToApiChannel` each render would
    otherwise tear down and restart this on every render — and since the restart
    writes state, that is not churn but a loop.
  */
  const subscribe = useRef(subscribeToApiChannel);
  subscribe.current = subscribeToApiChannel;

  useEffect(() => {
    if (!enabled) {
      setResult((previous) =>
        previous.state === 'idle'
          ? previous
          : { ...NOTHING_HELD, state: 'idle' },
      );
      return undefined;
    }

    /*
      A track change invalidates whatever is held; start again from nothing.
      Idempotent, so the first run — where the initial state already says
      `waiting` — hands back the same object and React skips the render.
    */
    setResult((previous) =>
      previous.state === 'waiting' && previous.points.length === 0
        ? previous
        : { ...NOTHING_HELD, state: 'waiting' },
    );

    let settled = false;
    let retry: ReturnType<typeof setInterval> | undefined;
    const forTrack = trackKey;

    const unsubscribe = subscribe.current(
      CONSTANTS.API.GET_LIVE_TRACK_MAP,
      (payload: unknown) => {
        if (settled || wanted.current !== forTrack) {
          return;
        }

        const response = payload as {
          status?: string;
          data?: unknown;
          message?: string;
        };

        if (response?.status !== 'success') {
          setResult({
            ...NOTHING_HELD,
            state: 'error',
            error: response?.message ?? 'The game did not return a track map.',
          });
          return;
        }

        const points = extractTrackMapPoints(response.data);
        /*
          Fewer than two points cannot describe a track, and the SVG builder
          treats them as nothing anyway. Either way it is "not yet", so the
          retry keeps running — an empty answer must never be presented as
          "this track has no map".
        */
        if (points.length < 2) {
          setResult((previous) =>
            previous.state === 'waiting'
              ? previous
              : { ...NOTHING_HELD, state: 'waiting' },
          );
          return;
        }

        // Asked once and answered. The geometry cannot change under a running
        // session, so the retry stops here rather than idling for the session.
        settled = true;
        clearInterval(retry);
        setResult({
          points,
          pitPoints: extractTrackPitLanePoints(response.data),
          state: 'ready',
        });
      },
    );

    const request = () => sendMessage(CONSTANTS.API.GET_LIVE_TRACK_MAP);

    request();
    retry = setInterval(request, RETRY_INTERVAL_MS);

    return () => {
      clearInterval(retry);
      unsubscribe?.();
    };
  }, [enabled, trackKey]);

  return result;
};
