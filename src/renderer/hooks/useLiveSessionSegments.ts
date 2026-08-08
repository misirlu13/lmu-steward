import { useCallback, useEffect, useRef, useState } from 'react';
import { CONSTANTS } from '@constants';
import {
  LiveCaptureDriver,
  LiveIncidentRecord,
  LiveSessionSegments,
  LiveSessionSummary,
} from '@types';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';
import { buildIncidents } from './useLiveSessionData';
import { LiveIncident } from '../components/Live/liveFixtures';

/**
 * How often the segment list is refreshed on its own.
 *
 * Slow on purpose. The list changes when a session starts or ends — twice or
 * three times a weekend — and the request reads the whole incident table off
 * disk to count per session. Anything near the live view's 1 Hz would be paying
 * a per-session disk read every second to watch a number that moves three times
 * a day. The real trigger is the anchor changing, which is handled directly.
 */
const REFRESH_INTERVAL_MS = 30_000;

/** A past segment's incidents, rebuilt into the shape the live view renders. */
export interface LiveSegmentRecord {
  sessionKey: string;
  incidents: LiveIncident[];
}

export interface LiveSessionSegmentsResult {
  /** Chronological, oldest first. Empty until the running session has a row. */
  segments: LiveSessionSummary[];
  /** The persisted segment currently held, if one was asked for and arrived. */
  record?: LiveSegmentRecord;
  /** A record has been asked for and has not come back yet. */
  loading: boolean;
  error?: string;
}

const NOTHING: LiveSessionSegmentsResult = { segments: [], loading: false };

/**
 * A persisted incident, back in the shape `buildIncidents` expects.
 *
 * Two fields have to be put back, and both matter. `persistedId` is stripped
 * before writing — it is the row's own primary key, and a second copy inside the
 * payload could only go stale — but it is what `buildIncident` uses as the
 * incident's id, and therefore what every steward decision is keyed on. Without
 * it a reviewed practice incident would come back under its volatile
 * `live-{generation}-{seq}` id and its decisions would not find it.
 *
 * `hasContext` lives on the record rather than the payload for the same reason,
 * and it is what tells the dossier there is a trace worth fetching.
 */
const toCaptureShape = (record: LiveIncidentRecord) => ({
  ...record.incident,
  persistedId: record.id,
  hasContext: record.hasContext,
});

/**
 * The weekend's segments, and the one the steward has opened.
 *
 * Both on one channel and in one hook because they are one question: which
 * sessions are there, and what happened in the one being looked at. The list is
 * refreshed slowly; the record is fetched exactly once per segment and then
 * left alone — a past session's incidents cannot change, and rebuilding them on
 * a timer would hand the queue four hundred new object identities to re-render
 * for no new information.
 */
export const useLiveSessionSegments = (
  /** The running session's key. Anchors the group. */
  activeSessionKey: string,
  /** The segment whose record is wanted, or undefined for "just the list". */
  recordKey: string | undefined,
  /** False when there is no session to group around, so nothing is requested. */
  enabled: boolean,
): LiveSessionSegmentsResult => {
  const { subscribeToApiChannel } = useApi();
  const [result, setResult] = useState<LiveSessionSegmentsResult>(NOTHING);

  /*
    Read by the subscription callback rather than closed over, so a reply that
    lands between renders is judged against what is wanted now. Without it a
    slow answer for a segment the steward has already navigated away from would
    be accepted as the current one.
  */
  const wanted = useRef({ activeSessionKey, recordKey });
  wanted.current = { activeSessionKey, recordKey };

  /*
    Held in a ref so the effect depends on what genuinely restarts the fetch and
    not on the identity of a context callback — a provider handing down a fresh
    `subscribeToApiChannel` each render would otherwise restart an effect that
    writes state, which is a loop rather than churn.
  */
  const subscribe = useRef(subscribeToApiChannel);
  subscribe.current = subscribeToApiChannel;

  const request = useCallback((withRecord: boolean) => {
    sendMessage(CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS, {
      sessionKey: wanted.current.activeSessionKey,
      recordFor: withRecord ? wanted.current.recordKey : undefined,
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      setResult((previous) => (previous === NOTHING ? previous : NOTHING));
      return undefined;
    }

    const unsubscribe = subscribe.current(
      CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS,
      (payload: unknown) => {
        const response = payload as {
          status?: string;
          data?: LiveSessionSegments;
          message?: string;
        };

        if (response?.status !== 'success' || !response.data) {
          setResult((previous) => ({
            ...previous,
            loading: false,
            error:
              response?.message ??
              'Unable to read this weekend’s other sessions.',
          }));
          return;
        }

        const { segments, recordFor, incidents, drivers } = response.data;
        const held = wanted.current.recordKey;

        setResult((previous) => {
          /*
            A reply carries a record only when one was asked for, so a list
            refresh must leave whatever is held alone rather than clearing it.
            A record for a segment that is no longer selected is dropped.
          */
          const record =
            recordFor && recordFor === held
              ? {
                  sessionKey: recordFor,
                  incidents: buildIncidents(
                    (incidents ?? []).map(toCaptureShape),
                    (drivers ?? []) as LiveCaptureDriver[],
                  ),
                }
              : previous.record?.sessionKey === held
                ? previous.record
                : undefined;

          return {
            segments: segments ?? [],
            record,
            loading: held !== undefined && record === undefined,
            error: undefined,
          };
        });
      },
    );

    return unsubscribe;
  }, [enabled]);

  // The list, on the anchor changing and then slowly. A new segment appears
  // when the game moves from practice to qualifying, which changes the anchor.
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    request(false);
    const id = setInterval(() => request(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeSessionKey, enabled, request]);

  // The record, once per selection. Nothing is asked for when the steward is on
  // the live session — that comes from the poll, not from disk.
  useEffect(() => {
    if (!enabled || recordKey === undefined) {
      setResult((previous) =>
        previous.record === undefined && !previous.loading
          ? previous
          : { ...previous, record: undefined, loading: false },
      );
      return;
    }

    setResult((previous) =>
      previous.record?.sessionKey === recordKey
        ? previous
        : { ...previous, record: undefined, loading: true },
    );
    request(true);
  }, [enabled, recordKey, request]);

  return result;
};
