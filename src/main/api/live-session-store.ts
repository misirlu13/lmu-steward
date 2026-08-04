import { createHash } from 'crypto';
import log from 'electron-log';
import {
  LiveCaptureDriver,
  LiveCaptureIncident,
  LiveIncidentContext,
  LiveIncidentContextRecord,
  LiveIncidentRecord,
  LiveSessionRecord,
  SessionType,
} from '@types';
import { getMainPersistentStore } from '../storage/local-data-store';

const LIVE_SESSIONS_KEY = 'liveSessions';
const LIVE_INCIDENTS_KEY = 'liveIncidents';
const LIVE_INCIDENT_CONTEXTS_KEY = 'liveIncidentContexts';

/**
 * Session start is reconstructed as `now - currentEt`, so it carries the jitter
 * of both clocks plus the ~0.2s scoring tick. Quantising absorbs that: two
 * ticks a second apart, or a sidecar that respawned and re-derived the start
 * from scratch, must land on the same key rather than opening a second session.
 *
 * 30s is wide enough to swallow the jitter and far narrower than the gap
 * between a session and its restart.
 */
export const LIVE_SESSION_START_QUANTUM_MS = 30_000;

/**
 * Identity for a live session, stable across a sidecar restart mid-session.
 *
 * Track and session type alone are not enough — a weekend runs practice,
 * qualifying and a race at one track, and a restarted race repeats a type. The
 * derived start instant separates them.
 */
export const deriveLiveSessionKey = (
  trackName: string,
  session: number,
  currentEtSeconds: number,
  now: number = Date.now(),
): string => {
  const elapsedMs = Number.isFinite(currentEtSeconds)
    ? Math.max(0, currentEtSeconds) * 1000
    : 0;
  const startedAt =
    Math.round((now - elapsedMs) / LIVE_SESSION_START_QUANTUM_MS) *
    LIVE_SESSION_START_QUANTUM_MS;

  return `live|${trackName || 'unknown'}|${session}|${startedAt}`;
};

/** The quantised start instant a key was built from. */
export const startedAtFromLiveSessionKey = (sessionKey: string): number => {
  const parsed = Number(sessionKey.split('|')[3]);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Unquantised reconstruction of when the session began. */
export const deriveLiveSessionStart = (
  currentEtSeconds: number,
  now: number,
): number => {
  const elapsedMs = Number.isFinite(currentEtSeconds)
    ? Math.max(0, currentEtSeconds) * 1000
    : 0;
  return now - elapsedMs;
};

export interface LiveSessionCandidate {
  sessionKey: string;
  trackName: string;
  session: number;
  startedAt: number;
}

/**
 * The key for a session being rejoined, preferring one already on disk.
 *
 * Quantising alone is not enough, and the reason is worth stating plainly:
 * **rounding does not absorb jitter, it relocates the discontinuity.** A
 * session whose reconstructed start happens to sit near a bucket boundary
 * flips between two adjacent buckets on sub-millisecond noise and splits into
 * two records. Seen live â€” two Laguna Seca rows exactly one quantum apart, one
 * holding 316 incidents and the other none.
 *
 * So identity is by proximity to a session that already exists, and a new key
 * is minted only when nothing nearby matches. The tolerance is a full quantum,
 * which is exactly wide enough that any start that would round into a
 * neighbouring bucket is recognised instead.
 */
export const resolveLiveSessionKey = (
  trackName: string,
  session: number,
  currentEtSeconds: number,
  candidates: LiveSessionCandidate[],
  now: number = Date.now(),
): string => {
  const startedAt = deriveLiveSessionStart(currentEtSeconds, now);

  const match = candidates
    .filter(
      (candidate) =>
        candidate.trackName === trackName &&
        candidate.session === session &&
        Math.abs(candidate.startedAt - startedAt) <=
          LIVE_SESSION_START_QUANTUM_MS,
    )
    .sort(
      (a, b) =>
        Math.abs(a.startedAt - startedAt) - Math.abs(b.startedAt - startedAt),
    )[0];

  return (
    match?.sessionKey ??
    deriveLiveSessionKey(trackName, session, currentEtSeconds, now)
  );
};

/*
  Every write below is a single-entry map. The store upserts exactly the rows it
  is handed and never deletes, so writing one incident mid-session leaves the
  rest of the session standing. Writing the whole collection instead would make
  each incident cost the entire session's JSON.

  Failures are logged and swallowed: a disk error must not take down capture,
  because a running session still has value on screen even if it is not being
  recorded.
*/

export const persistLiveSession = (record: LiveSessionRecord): void => {
  try {
    getMainPersistentStore().set(LIVE_SESSIONS_KEY, {
      [record.sessionKey]: record,
    });
  } catch (error) {
    log.error('live-session-store: failed to persist session', error);
  }
};

export const persistLiveIncident = (record: LiveIncidentRecord): void => {
  try {
    getMainPersistentStore().set(LIVE_INCIDENTS_KEY, { [record.id]: record });
  } catch (error) {
    log.error('live-session-store: failed to persist incident', error);
  }
};

export const persistLiveIncidentContext = (
  record: LiveIncidentContextRecord,
): void => {
  try {
    getMainPersistentStore().set(LIVE_INCIDENT_CONTEXTS_KEY, {
      [record.incidentId]: record,
    });
  } catch (error) {
    log.error('live-session-store: failed to persist incident context', error);
  }
};

export const readLiveSessions = (): Record<string, LiveSessionRecord> => {
  try {
    return (getMainPersistentStore().get(LIVE_SESSIONS_KEY) ?? {}) as Record<
      string,
      LiveSessionRecord
    >;
  } catch (error) {
    log.error('live-session-store: failed to read sessions', error);
    return {};
  }
};

export const readLiveIncidents = (): Record<string, LiveIncidentRecord> => {
  try {
    return (getMainPersistentStore().get(LIVE_INCIDENTS_KEY) ?? {}) as Record<
      string,
      LiveIncidentRecord
    >;
  } catch (error) {
    log.error('live-session-store: failed to read incidents', error);
    return {};
  }
};

export const readLiveIncidentContexts = (): Record<
  string,
  LiveIncidentContextRecord
> => {
  try {
    return (getMainPersistentStore().get(LIVE_INCIDENT_CONTEXTS_KEY) ??
      {}) as Record<string, LiveIncidentContextRecord>;
  } catch (error) {
    log.error('live-session-store: failed to read incident contexts', error);
    return {};
  }
};

interface BuildLiveSessionArgs {
  sessionKey: string;
  trackName: string;
  session: number;
  sessionType?: SessionType;
  driverCount?: number;
  trackLimitStepsPerPenalty?: number;
  drivers: LiveCaptureDriver[];
  now?: number;
}

export const buildLiveSessionRecord = ({
  sessionKey,
  trackName,
  session,
  sessionType,
  driverCount,
  trackLimitStepsPerPenalty,
  drivers,
  now = Date.now(),
}: BuildLiveSessionArgs): LiveSessionRecord => ({
  sessionKey,
  trackName,
  session,
  sessionType,
  startedAt: startedAtFromLiveSessionKey(sessionKey),
  lastSeenAt: now,
  driverCount,
  trackLimitStepsPerPenalty,
  drivers,
});

/**
 * A persisted id that is stable for the life of the session.
 *
 * `incident.id` cannot be used: it is `live-{generation}-{seq}`, and the
 * generation counter is per app process, so it restarts at 1 on every app
 * launch. Two different incidents in one session then collide on the same
 * primary key and the later one silently overwrites the earlier — observed
 * live, losing two incidents from a Laguna Seca practice session.
 *
 * Derived from content instead, so re-capturing the same incident upserts the
 * same row. Session, elapsed time and the raw event string together identify an
 * incident within a session; the same reasoning as the career session key.
 */
export const deriveLiveIncidentId = (
  sessionKey: string,
  incident: LiveCaptureIncident,
): string => {
  const digest = createHash('sha1')
    .update(`${incident.etSeconds}|${incident.raw}`)
    .digest('hex')
    .slice(0, 12);

  return `${sessionKey}#${digest}`;
};

export const buildLiveIncidentRecord = (
  sessionKey: string,
  incident: LiveCaptureIncident,
): LiveIncidentRecord => {
  // Evidence stays — it is small, derived, and unrecoverable. The context
  // window is stripped: it is the bulky half, it has its own table, and
  // carrying it here too would put 60-80 KB back into every incident row and
  // undo the reason the tables were split.
  const { context, ...withoutContext } = incident;

  return {
    id: deriveLiveIncidentId(sessionKey, incident),
    sessionKey,
    // The volatile in-memory id is kept inside the payload: steward decisions
    // are keyed on it, so it still has to be recoverable for the current run.
    incident: withoutContext,
    // The incident's own clock is session-relative; anchoring it to the derived
    // session start is what makes it comparable with anything outside the session.
    occurredAt:
      startedAtFromLiveSessionKey(sessionKey) +
      Math.round((incident.etSeconds || 0) * 1000),
    hasContext: Boolean(context),
  };
};

export const buildLiveIncidentContextRecord = (
  sessionKey: string,
  incidentId: string,
  context: LiveIncidentContext,
): LiveIncidentContextRecord => ({
  incidentId,
  sessionKey,
  context,
});
