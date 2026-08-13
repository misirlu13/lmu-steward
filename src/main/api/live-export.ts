import log from 'electron-log';
import {
  LiveIncidentContextRecord,
  LiveIncidentRecord,
  LiveSessionRecord,
} from '@types';
import {
  findLiveSessionForReplay,
  persistLiveIncident,
  persistLiveIncidentContext,
  persistLiveSession,
  readLiveIncidentContexts,
  readLiveIncidentsForSession,
  readLiveSessions,
} from './live-session-store';

/**
 * Carrying a captured session inside a replay archive.
 *
 * Exporting a replay to another steward hands over the footage and the log but,
 * without this, silently drops the closing speeds, the traces and the
 * on/off-track findings — which is most of what makes an incident adjudicable.
 * The receiving install would show a strictly worse view of the same race.
 *
 * Size is a non-issue: tens of MB of capture alongside a .Vcr measured in
 * gigabytes.
 *
 * See plans/live-replay-reconciliation-design.md, "Carrying Live Data in a
 * Replay Export".
 */

export const LIVE_EXPORT_VERSION = 1;

export interface LiveExportPayload {
  version: number;
  /**
   * The session as captured. Its link is deliberately dropped: it names a
   * replay hash from the exporting machine, which means nothing here.
   */
  session: Omit<LiveSessionRecord, 'link' | 'proposal' | 'matchDismissedAt'>;
  incidents: LiveIncidentRecord[];
  /** Present only when the exporting steward opted in. */
  contexts?: LiveIncidentContextRecord[];
  includesTelemetry: boolean;
}

/**
 * The captured session for a replay, in the shape the archive carries.
 *
 * Null when the replay has no linked capture, which is the ordinary case — most
 * replays have none, and an archive without live data is exactly what exports
 * produced before this existed.
 */
export const buildLiveExportPayload = (
  replayHash: string,
  includeTelemetry: boolean,
  replayIdentityKey?: string,
): LiveExportPayload | null => {
  const session = findLiveSessionForReplay(replayHash, replayIdentityKey);

  if (!session) {
    return null;
  }

  const incidents = readLiveIncidentsForSession(session.sessionKey);

  /*
    Link state is stripped rather than carried. `replayHash` is the exporting
    machine's identity for the replay and the importing machine will mint its
    own; a stale hash here would be a link pointing at nothing, which is worse
    than no link at all because it looks like one.
  */
  const portable = { ...session };
  delete portable.link;
  delete portable.proposal;
  delete portable.matchDismissedAt;

  const contexts = includeTelemetry
    ? Object.values(readLiveIncidentContexts()).filter(
        (record) => record.sessionKey === session.sessionKey,
      )
    : undefined;

  return {
    version: LIVE_EXPORT_VERSION,
    session: portable,
    incidents,
    ...(contexts ? { contexts } : {}),
    includesTelemetry: Boolean(includeTelemetry && contexts?.length),
  };
};

/** Refuses anything that is not plausibly one of our payloads. */
export const isLiveExportPayload = (
  value: unknown,
): value is LiveExportPayload => {
  const candidate = value as LiveExportPayload | null;

  return Boolean(
    candidate &&
      typeof candidate === 'object' &&
      Number.isFinite(candidate.version) &&
      candidate.session &&
      typeof candidate.session.sessionKey === 'string' &&
      Array.isArray(candidate.incidents),
  );
};

export interface AppliedLiveImport {
  sessionKey: string;
  incidentCount: number;
  traceCount: number;
}

/**
 * Writes an imported capture into this install, linked to the replay it arrived
 * with.
 *
 * The link is made here rather than left to matching. The archive is a direct
 * statement that this capture belongs to this replay — stronger evidence than
 * any roster score — and it is the same reasoning that lets a manifest skip
 * pairing entirely.
 *
 * A session already on disk is left alone. Re-importing the same hand-off must
 * not resurrect evidence the user has since deleted, nor overwrite a link they
 * corrected by hand.
 */
export const applyLiveExportPayload = (
  payload: LiveExportPayload,
  replay: { hash: string; identityKey: string; replayName: string },
  now: number = Date.now(),
): AppliedLiveImport | null => {
  if (!isLiveExportPayload(payload)) {
    return null;
  }

  const { sessionKey } = payload.session;

  if (readLiveSessions()[sessionKey]) {
    log.info(
      `live-export: session ${sessionKey} already present, leaving it alone`,
    );
    return null;
  }

  try {
    persistLiveSession({
      ...(payload.session as LiveSessionRecord),
      link: {
        replayHash: replay.hash,
        replayIdentityKey: replay.identityKey,
        replayName: replay.replayName,
        /*
          Recorded as a manual link. It was not scored against a roster here —
          the exporting steward asserted the pairing, and a confidence invented
          on this side would misrepresent where that assertion came from.
        */
        method: 'manual',
        confidence: null,
        linkedAt: now,
      },
    });

    payload.incidents.forEach((record) => {
      persistLiveIncident({ ...record, sessionKey });
    });

    const contexts = payload.contexts ?? [];
    contexts.forEach((record) => {
      persistLiveIncidentContext({ ...record, sessionKey });
    });

    log.info(
      `live-export: imported ${payload.incidents.length} incidents and ${contexts.length} traces for ${sessionKey}`,
    );

    return {
      sessionKey,
      incidentCount: payload.incidents.length,
      traceCount: contexts.length,
    };
  } catch (error) {
    log.error('live-export: failed to import captured session', error);
    return null;
  }
};
