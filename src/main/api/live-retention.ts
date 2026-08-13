import log from 'electron-log';
import { LiveSessionRecord } from '@types';
import { deleteLiveSession, readLiveSessions } from './live-session-store';

/**
 * Expiry for captured live sessions.
 *
 * Retention exists because traces accumulate: a contact window is ~100 KB and a
 * 24-hour race produces hundreds, so an install left alone grows without bound.
 * Expiry removes the whole session record — incidents, derived evidence and
 * trace windows together.
 *
 * 🛑 **Steward decisions are never touched, at any setting.** A decision is the
 * output of the entire product, it is a few hundred bytes, it may be the
 * subject of an appeal months later, and it cannot be reconstructed from
 * anything. A decision outliving its evidence is an already-supported state:
 * session, driver, lap, elapsed time and classification are all denormalised
 * onto the record so it stands alone.
 *
 * See plans/live-replay-reconciliation-design.md, "Retention and Deletion".
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * When a session's retention clock starts.
 *
 * The later of capture and link. A session that gained a replay to be reviewed
 * against has become more useful, not less, so expiring it on its original
 * schedule would delete evidence at the moment it became worth keeping.
 * Linking is a one-time event, so this cannot extend a session's life
 * indefinitely.
 */
export const retentionAnchor = (session: LiveSessionRecord): number =>
  Math.max(session.startedAt ?? 0, session.link?.linkedAt ?? 0);

export interface RetentionPreview {
  sessionKeys: string[];
  sessionCount: number;
  incidentCount: number;
  /** Oldest and newest anchor among the sessions that would go. */
  oldestAt: number | null;
  newestAt: number | null;
  /** Distinct tracks, so the user recognises what they are about to lose. */
  trackNames: string[];
}

const EMPTY_PREVIEW: RetentionPreview = {
  sessionKeys: [],
  sessionCount: 0,
  incidentCount: 0,
  oldestAt: null,
  newestAt: null,
  trackNames: [],
};

export const isRetentionEnabled = (
  retentionDays: number | null | undefined,
): retentionDays is number =>
  typeof retentionDays === 'number' &&
  Number.isFinite(retentionDays) &&
  retentionDays > 0;

/**
 * The sessions a given window would remove, without removing them.
 *
 * Shortening the window destroys data, and a settings dropdown is not where a
 * user expects that — so the confirmation names what will go rather than
 * relying on a generic "cannot be undone".
 */
export const previewExpiredLiveSessions = (
  retentionDays: number | null | undefined,
  incidentCountsBySession: Map<string, number> = new Map(),
  now: number = Date.now(),
): RetentionPreview => {
  if (!isRetentionEnabled(retentionDays)) {
    return EMPTY_PREVIEW;
  }

  const cutoff = now - retentionDays * MS_PER_DAY;
  const expired = Object.values(readLiveSessions()).filter(
    (session) => retentionAnchor(session) < cutoff,
  );

  if (expired.length === 0) {
    return EMPTY_PREVIEW;
  }

  const anchors = expired.map(retentionAnchor);

  return {
    sessionKeys: expired.map((session) => session.sessionKey),
    sessionCount: expired.length,
    incidentCount: expired.reduce(
      (total, session) =>
        total + (incidentCountsBySession.get(session.sessionKey) ?? 0),
      0,
    ),
    oldestAt: Math.min(...anchors),
    newestAt: Math.max(...anchors),
    trackNames: [
      ...new Set(
        expired
          .map((session) => session.trackName)
          .filter((name): name is string => Boolean(name)),
      ),
    ],
  };
};

/**
 * Removes every captured session past the window.
 *
 * Silent by design — no dialog, no toast, no count in the UI. This is
 * housekeeping nobody is waiting on; a log line is worth writing for support
 * and nothing more.
 */
export const sweepExpiredLiveSessions = (
  retentionDays: number | null | undefined,
  now: number = Date.now(),
): number => {
  if (!isRetentionEnabled(retentionDays)) {
    return 0;
  }

  const { sessionKeys } = previewExpiredLiveSessions(
    retentionDays,
    new Map(),
    now,
  );

  if (sessionKeys.length === 0) {
    return 0;
  }

  let removed = 0;

  sessionKeys.forEach((sessionKey) => {
    if (deleteLiveSession(sessionKey)) {
      removed += 1;
    }
  });

  log.info(
    `live-retention: removed ${removed} captured session${
      removed === 1 ? '' : 's'
    } older than ${retentionDays} days`,
  );

  return removed;
};
