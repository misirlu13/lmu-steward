import { createHash } from 'crypto';
import log from 'electron-log';
import {
  LiveCaptureDriver,
  LiveCaptureIncident,
  LiveIncidentContext,
  LiveIncidentContextRecord,
  LiveIncidentRecord,
  LiveSessionLink,
  LiveSessionLinkState,
  LiveSessionMatchProposal,
  LiveSessionRecord,
  LiveSessionSummary,
  SessionType,
} from '@types';
import {
  deleteLiveSessionRecords,
  getMainPersistentStore,
} from '../storage/local-data-store';

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
 * two records. Seen live — two Laguna Seca rows exactly one quantum apart, one
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

/*
  Nothing is written without a session to belong to. An incident stored against
  an empty key is unreachable from the sessions list and cannot be deleted
  through the UI — it is invisible, permanent clutter. Four of these reached a
  real store, written before the first status line had established a session.

  Dropping the record is the right trade: the alternative is evidence the user
  can neither find nor remove, and an incident this early has no context window
  yet anyway.
*/
const hasSession = (sessionKey: string, what: string): boolean => {
  if (sessionKey) {
    return true;
  }

  log.warn(`live-session-store: dropped ${what} with no session key`);
  return false;
};

export const persistLiveIncident = (record: LiveIncidentRecord): void => {
  if (!hasSession(record.sessionKey, 'an incident')) {
    return;
  }

  try {
    getMainPersistentStore().set(LIVE_INCIDENTS_KEY, { [record.id]: record });
  } catch (error) {
    log.error('live-session-store: failed to persist incident', error);
  }
};

export const persistLiveIncidentContext = (
  record: LiveIncidentContextRecord,
): void => {
  if (!hasSession(record.sessionKey, 'an incident context')) {
    return;
  }

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

export const resolveLinkState = (
  session: Pick<LiveSessionRecord, 'link' | 'proposal'>,
): LiveSessionLinkState => {
  if (session.link?.replayHash) {
    return 'linked';
  }

  return session.proposal?.replayHash ? 'proposed' : 'unlinked';
};

/**
 * Sessions newest first, each with how much was actually captured.
 *
 * Counts come from the incident records rather than a stored total, because a
 * session row is written before its first incident and updated on a slow
 * heartbeat — a cached count would lag the truth for the whole of a session.
 */
export const listLiveSessionSummaries = (): LiveSessionSummary[] => {
  const sessions = Object.values(readLiveSessions());
  if (sessions.length === 0) {
    return [];
  }

  const incidents = Object.values(readLiveIncidents());
  const counts = new Map<string, { incidents: number; evidence: number }>();

  incidents.forEach((record) => {
    const entry = counts.get(record.sessionKey) ?? {
      incidents: 0,
      evidence: 0,
    };
    entry.incidents += 1;
    if (record.hasContext) {
      entry.evidence += 1;
    }
    counts.set(record.sessionKey, entry);
  });

  return sessions
    .map((session) => ({
      sessionKey: session.sessionKey,
      trackName: session.trackName,
      sessionType: session.sessionType,
      session: session.session,
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt,
      driverCount: session.driverCount ?? session.drivers?.length ?? 0,
      incidentCount: counts.get(session.sessionKey)?.incidents ?? 0,
      evidenceCount: counts.get(session.sessionKey)?.evidence ?? 0,
      linkState: resolveLinkState(session),
      link: session.link,
      proposal: session.proposal,
    }))
    .sort((a, b) => b.startedAt - a.startedAt);
};

/**
 * Every captured incident's elapsed time, grouped by session.
 *
 * Read once per matching pass rather than per session: the incident rows are
 * small, but there is one collection on disk and re-reading it per session
 * would be quadratic in a library with a weekend's worth of captures.
 */
export const listLiveIncidentTimesBySession = (): Map<string, number[]> => {
  const times = new Map<string, number[]>();

  Object.values(readLiveIncidents()).forEach((record) => {
    const et = Number(record?.incident?.etSeconds);
    if (!record?.sessionKey || !Number.isFinite(et)) {
      return;
    }

    const existing = times.get(record.sessionKey);
    if (existing) {
      existing.push(et);
    } else {
      times.set(record.sessionKey, [et]);
    }
  });

  return times;
};

export const readLiveSession = (sessionKey: string): LiveSessionRecord | null =>
  readLiveSessions()[sessionKey] ?? null;

/*
  Link state is written by rewriting the whole session row, which is safe here
  and nowhere else in this file: these four run from a user action rather than
  from the capture path, so there is no concurrent writer to race with, and the
  record being rewritten is the one just read.
*/
const updateLiveSession = (
  sessionKey: string,
  apply: (session: LiveSessionRecord) => LiveSessionRecord,
): LiveSessionRecord | null => {
  const existing = readLiveSession(sessionKey);
  if (!existing) {
    log.warn('live-session-store: no session to update', sessionKey);
    return null;
  }

  const next = apply(existing);
  persistLiveSession(next);
  return next;
};

const withoutKeys = (
  session: LiveSessionRecord,
  keys: Array<keyof LiveSessionRecord>,
): LiveSessionRecord => {
  const next = { ...session };
  keys.forEach((key) => delete next[key]);
  return next;
};

/**
 * Confirms a pairing.
 *
 * Only ever called from a human confirming — matching itself writes a proposal
 * and stops. The proposal is cleared because it has been answered, and the
 * dismissal with it, so a link made after a rejection is not immediately
 * treated as still-rejected.
 */
export const linkLiveSessionToReplay = (
  sessionKey: string,
  link: LiveSessionLink,
): LiveSessionRecord | null =>
  updateLiveSession(sessionKey, (session) => ({
    ...withoutKeys(session, ['proposal', 'matchDismissedAt']),
    link,
  }));

export const unlinkLiveSession = (
  sessionKey: string,
): LiveSessionRecord | null =>
  updateLiveSession(sessionKey, (session) => ({
    /*
      Unlinking also dismisses. Without it, the next matching pass would
      immediately re-propose the replay the user has just rejected, which is
      the nagging the design rules out.
    */
    ...withoutKeys(session, ['link', 'proposal']),
    matchDismissedAt: Date.now(),
  }));

export const setLiveSessionProposal = (
  sessionKey: string,
  proposal: LiveSessionMatchProposal | null,
): LiveSessionRecord | null =>
  updateLiveSession(sessionKey, (session) =>
    proposal ? { ...session, proposal } : withoutKeys(session, ['proposal']),
  );

export const dismissLiveSessionMatch = (
  sessionKey: string,
): LiveSessionRecord | null =>
  updateLiveSession(sessionKey, (session) => ({
    ...withoutKeys(session, ['proposal']),
    matchDismissedAt: Date.now(),
  }));

/**
 * Every persisted incident for one session, oldest first.
 *
 * Traces are not included: they live in their own table precisely so that
 * listing a session's incidents does not drag ~100 KB per incident off disk.
 */
export const readLiveIncidentsForSession = (
  sessionKey: string,
): LiveIncidentRecord[] =>
  Object.values(readLiveIncidents())
    .filter((record) => record?.sessionKey === sessionKey)
    .sort(
      (a, b) => (a.incident?.etSeconds ?? 0) - (b.incident?.etSeconds ?? 0),
    );

/**
 * The captured session behind a replay, by hash and then by identity key.
 *
 * Two tiers for the same reason the archive store has them: a replay that
 * re-hashes must not silently lose its live evidence.
 */
export const findLiveSessionForReplay = (
  replayHash: string,
  replayIdentityKey?: string,
): LiveSessionRecord | null => {
  const sessions = Object.values(readLiveSessions());

  return (
    sessions.find((session) => session.link?.replayHash === replayHash) ??
    (replayIdentityKey
      ? (sessions.find(
          (session) => session.link?.replayIdentityKey === replayIdentityKey,
        ) ?? null)
      : null)
  );
};

/**
 * Removes a captured session and everything belonging to it.
 *
 * Steward decisions are deliberately untouched: they are human judgement that
 * exists nowhere else, and the design exempts them from every deletion path.
 * A decision outliving its evidence is the intended trade.
 */
export const deleteLiveSession = (sessionKey: string): boolean => {
  try {
    deleteLiveSessionRecords(sessionKey);
    return true;
  } catch (error) {
    log.error(
      'live-session-store: failed to delete session',
      sessionKey,
      error,
    );
    return false;
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
