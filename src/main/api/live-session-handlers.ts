import log from 'electron-log';
import { CONSTANTS } from '@constants';
import {
  LiveDataForReplay,
  LiveRetentionPreview,
  LiveSessionLink,
  LiveSessionSegments,
  LocalDataSummary,
} from '@types';
import {
  deleteLiveSession,
  dismissLiveSessionMatch,
  findLiveSessionForReplay,
  linkLiveSessionToReplay,
  listLiveIncidentTimesBySession,
  listLiveSessionSegments,
  listLiveSessionSummaries,
  readLiveIncidentContext,
  readLiveIncidents,
  readLiveIncidentsForSession,
  readLiveSession,
  readLiveSessions,
  unlinkLiveSession,
} from './live-session-store';
import { previewExpiredLiveSessions } from './live-retention';
import { readStewardDecisions } from './steward-decisions';
import { matchLiveSession, runLiveSessionMatchPass } from './live-replay-match';
import { listReplayMatchTargets } from './replay';
import { getLiveIncidentContextInMemory } from './live-capture';

export const getLiveSessions = async (event: Electron.IpcMainEvent) => {
  try {
    /*
      Proposals are refreshed as the list is opened rather than on a timer or at
      app start. It costs nothing for a user who never opens this view, and it
      is also what makes matching retroactive: a replay synced or imported after
      the session was captured is simply a new candidate the next time the list
      is read.

      Isolated, because a proposal is a convenience. A directory that cannot be
      read must not stop a steward seeing what was captured.
    */
    try {
      await runLiveSessionMatchPass({
        incidentTimesBySession: listLiveIncidentTimesBySession(),
      });
    } catch (matchError) {
      log.error('live-sessions: match pass failed', matchError);
    }

    event.reply(CONSTANTS.API.GET_LIVE_SESSIONS, {
      status: 'success',
      data: listLiveSessionSummaries(),
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_LIVE_SESSIONS, {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Unable to read captured sessions',
    });
  }
};

export interface LiveSessionSegmentsRequest {
  /** The running session's key. Anchors the group. */
  sessionKey?: string;
  /** A segment whose persisted incidents the caller wants back with the list. */
  recordFor?: string;
}

/**
 * The weekend around the running session, and one segment's record on request.
 *
 * Deliberately does *not* run the replay-matching pass that `getLiveSessions`
 * does. That pass walks the replay directory, and this channel is refreshed by
 * the live view while a race is being stewarded; the link state already on each
 * summary is enough for a picker to show a dot with.
 *
 * A record is served for any key that exists, not only for one in the group.
 * The renderer decides what it is willing to show — and a request for a segment
 * that has just been deleted should come back empty rather than as an error the
 * live view has to render.
 */
export const getLiveSessionSegments = async (
  event: Electron.IpcMainEvent,
  request?: LiveSessionSegmentsRequest,
) => {
  try {
    const { anchorSessionKey, segments } = listLiveSessionSegments(
      typeof request?.sessionKey === 'string' ? request.sessionKey : undefined,
    );

    const recordFor =
      typeof request?.recordFor === 'string' ? request.recordFor.trim() : '';
    const record = recordFor ? readLiveSession(recordFor) : null;

    event.reply(CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS, {
      status: 'success',
      data: {
        anchorSessionKey,
        segments,
        recordFor: record ? recordFor : undefined,
        incidents: record ? readLiveIncidentsForSession(recordFor) : [],
        /*
          The segment's own field, not the running session's. A practice
          incident names its drivers by slot, and slots are reused — resolving
          them against whoever is on track now would put the wrong car number
          and the wrong class against a driver from two sessions ago.
        */
        drivers: record?.drivers ?? [],
      } satisfies LiveSessionSegments,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS, {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Unable to read this weekend’s sessions.',
    });
  }
};

export const postDeleteLiveSession = async (
  event: Electron.IpcMainEvent,
  sessionKey: unknown,
) => {
  const key = typeof sessionKey === 'string' ? sessionKey.trim() : '';

  if (!key) {
    event.reply(CONSTANTS.API.POST_DELETE_LIVE_SESSION, {
      status: 'error',
      message: 'No session was specified.',
    });
    return;
  }

  const deleted = deleteLiveSession(key);

  event.reply(CONSTANTS.API.POST_DELETE_LIVE_SESSION, {
    status: deleted ? 'success' : 'error',
    message: deleted ? undefined : 'Unable to delete the captured session.',
    // The refreshed list rides back with the reply so the renderer never has to
    // guess what survived a partial failure.
    data: listLiveSessionSummaries(),
  });
};

/**
 * Every replay this session could belong to, ranked.
 *
 * Returns the full candidate list, not just the best one: the user is being
 * asked to confirm, and confirming needs something to compare against. The
 * ranking's own verdict rides along so the dialog can say why nothing was
 * proposed rather than silently offering a list.
 */
export const getLiveSessionMatches = async (
  event: Electron.IpcMainEvent,
  sessionKey: unknown,
) => {
  const key = typeof sessionKey === 'string' ? sessionKey.trim() : '';

  try {
    const session = key ? readLiveSession(key) : null;

    if (!session) {
      throw new Error('That captured session no longer exists.');
    }

    const result = await matchLiveSession({
      session,
      targets: listReplayMatchTargets(),
      liveIncidentTimes:
        listLiveIncidentTimesBySession().get(session.sessionKey) ?? [],
    });

    event.reply(CONSTANTS.API.GET_LIVE_SESSION_MATCHES, {
      status: 'success',
      data: result,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_LIVE_SESSION_MATCHES, {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Unable to look for a matching replay.',
    });
  }
};

export interface LinkLiveSessionRequest {
  sessionKey: string;
  /** Null unlinks. */
  replayHash: string | null;
  /** Whether the user picked from the list or confirmed what was proposed. */
  method?: LiveSessionLink['method'];
}

export const postLinkLiveSession = async (
  event: Electron.IpcMainEvent,
  request?: LinkLiveSessionRequest,
) => {
  const key =
    typeof request?.sessionKey === 'string' ? request.sessionKey.trim() : '';
  const replayHash =
    typeof request?.replayHash === 'string' ? request.replayHash.trim() : '';

  const fail = (message: string) => {
    event.reply(CONSTANTS.API.POST_LINK_LIVE_SESSION, {
      status: 'error',
      message,
      data: listLiveSessionSummaries(),
    });
  };

  if (!key) {
    fail('No session was specified.');
    return;
  }

  if (!replayHash) {
    const unlinked = unlinkLiveSession(key);
    event.reply(CONSTANTS.API.POST_LINK_LIVE_SESSION, {
      status: unlinked ? 'success' : 'error',
      message: unlinked ? undefined : 'Unable to unlink that session.',
      data: listLiveSessionSummaries(),
    });
    return;
  }

  try {
    const session = readLiveSession(key);
    if (!session) {
      fail('That captured session no longer exists.');
      return;
    }

    /*
      The link is built from a fresh match rather than from whatever the
      renderer sent. The confidence and the identity key are recorded on the
      link, and both have to be ours — a renderer that has been open since
      before the last sync would otherwise write a stale identity key and the
      link would not survive a re-hash.
    */
    const result = await matchLiveSession({
      session,
      targets: listReplayMatchTargets(),
      liveIncidentTimes:
        listLiveIncidentTimesBySession().get(session.sessionKey) ?? [],
    });

    const chosen = result.candidates.find(
      (candidate) => candidate.replayHash === replayHash,
    );

    if (!chosen) {
      fail('That replay is no longer a candidate for this session.');
      return;
    }

    const linked = linkLiveSessionToReplay(key, {
      replayHash: chosen.replayHash,
      replayIdentityKey: chosen.replayIdentityKey,
      replayName: chosen.replayName,
      method: request?.method === 'manual' ? 'manual' : 'roster',
      confidence: chosen.liveDriverCount > 0 ? chosen.confidence : null,
      linkedAt: Date.now(),
    });

    event.reply(CONSTANTS.API.POST_LINK_LIVE_SESSION, {
      status: linked ? 'success' : 'error',
      message: linked ? undefined : 'Unable to link that session.',
      data: listLiveSessionSummaries(),
    });
  } catch (error: unknown) {
    fail(
      error instanceof Error
        ? error.message
        : 'Unable to link that session to a replay.',
    );
  }
};

/**
 * The captured session linked to a replay, if there is one.
 *
 * Replies with `data: null` rather than an error when nothing is linked — that
 * is the ordinary case for most replays, and the replay view simply shows what
 * the XML carries, exactly as it did before live capture existed.
 */
export const getLiveDataForReplay = async (
  event: Electron.IpcMainEvent,
  request?: { replayHash?: string; replayIdentityKey?: string },
) => {
  const replayHash =
    typeof request?.replayHash === 'string' ? request.replayHash.trim() : '';

  try {
    /*
      The identity key is resolved here rather than asked of the renderer. It is
      the fallback that keeps a link alive when a replay re-hashes, and the
      cache is the only place that knows the current pairing — a renderer open
      since before the last sync would supply a stale one.
    */
    const identityKey =
      request?.replayIdentityKey ||
      listReplayMatchTargets().find((target) => target.hash === replayHash)
        ?.identityKey;

    const session = replayHash
      ? findLiveSessionForReplay(replayHash, identityKey)
      : null;

    /*
      A link that only resolved through its identity key is repaired here.

      The replay cache re-hashes — a re-import, a moved folder, a metadata
      rewrite — and the link carries `replayIdentityKey` so a confirmed pairing
      survives it. That fallback finds the session but leaves the link pointing
      at a hash nothing has any more, so every later lookup goes the long way
      round, through a cache read that can come back empty while a sync is
      rebuilding it. Writing the current hash back turns a link that resolves by
      luck into one that resolves directly, which is what unlinking and
      relinking by hand was really doing.
    */
    if (
      session?.link &&
      replayHash &&
      session.link.replayHash !== replayHash &&
      session.link.replayIdentityKey &&
      session.link.replayIdentityKey === identityKey
    ) {
      log.info(
        `live-data-for-replay: healing link for ${session.sessionKey} — ${session.link.replayHash.slice(0, 12)} is now ${replayHash.slice(0, 12)}`,
      );
      linkLiveSessionToReplay(session.sessionKey, {
        ...session.link,
        replayHash,
      });
    }

    /*
      Worth a log line: "the replay shows no telemetry" has two very different
      causes — no captured session is linked, or one is linked and held nothing
      — and they are indistinguishable on screen.
    */
    const incidents = session
      ? readLiveIncidentsForSession(session.sessionKey)
      : [];

    log.info(
      `live-data-for-replay: ${replayHash.slice(0, 12)} -> ${
        session
          ? `${session.sessionKey} (${incidents.length} incidents)`
          : 'no linked session'
      }`,
    );

    /*
      The reply says which replay it is about.

      Without it a reply is only "the latest answer", and the renderer has no
      way to tell the answer it is waiting for from one still in flight for the
      replay it has just navigated away from. A late `null` for the previous
      replay then lands on this one and clears evidence that is genuinely there.
    */
    event.reply(CONSTANTS.API.GET_LIVE_DATA_FOR_REPLAY, {
      status: 'success',
      replayHash,
      data:
        session && session.link
          ? ({
              sessionKey: session.sessionKey,
              trackName: session.trackName,
              sessionType: session.sessionType,
              startedAt: session.startedAt,
              link: session.link,
              incidents,
              drivers: session.drivers ?? [],
            } satisfies LiveDataForReplay)
          : null,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_LIVE_DATA_FOR_REPLAY, {
      status: 'error',
      replayHash,
      message:
        error instanceof Error
          ? error.message
          : 'Unable to read the linked captured session.',
    });
  }
};

/**
 * One incident's captured trace.
 *
 * Its own channel rather than part of the per-replay payload: a window is
 * ~100 KB and a race holds hundreds, so shipping them all to open a replay
 * would cost tens of megabytes to render a list nobody has clicked into yet.
 * The live view now reads through here for the same reason.
 *
 * Disk first, because it answers for every session ever captured and the live
 * queue only holds the last few hundred of the current one. Memory is the
 * fallback for the two cases disk cannot serve: an incident whose window has
 * arrived but not yet been written, and a replay-playback session, which is
 * shown live but deliberately persists nothing.
 */
export const getLiveIncidentContext = async (
  event: Electron.IpcMainEvent,
  incidentId: unknown,
) => {
  const id = typeof incidentId === 'string' ? incidentId.trim() : '';

  try {
    const record = id
      ? (readLiveIncidentContext(id) ?? getLiveIncidentContextInMemory(id))
      : null;

    event.reply(CONSTANTS.API.GET_LIVE_INCIDENT_CONTEXT, {
      status: 'success',
      // Null rather than an error when there is none: most incidents never get
      // a window, because only car-to-car contact does.
      data: record,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_LIVE_INCIDENT_CONTEXT, {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Unable to read the captured trace.',
    });
  }
};

/**
 * What a retention window would remove, before anything is removed.
 *
 * Shortening the window can delete months of evidence on the next write, and a
 * settings dropdown is not where a user expects to destroy data — so the
 * confirmation names the sessions, the dates and the tracks rather than
 * relying on a generic "cannot be undone".
 */
export const getLiveRetentionPreview = async (
  event: Electron.IpcMainEvent,
  retentionDays: unknown,
) => {
  try {
    const days =
      typeof retentionDays === 'number' && Number.isFinite(retentionDays)
        ? retentionDays
        : null;

    const counts = new Map<string, number>();
    listLiveIncidentTimesBySession().forEach((times, sessionKey) => {
      counts.set(sessionKey, times.length);
    });

    const preview = previewExpiredLiveSessions(days, counts);

    event.reply(CONSTANTS.API.GET_LIVE_RETENTION_PREVIEW, {
      status: 'success',
      data: {
        sessionCount: preview.sessionCount,
        incidentCount: preview.incidentCount,
        oldestAt: preview.oldestAt,
        newestAt: preview.newestAt,
        trackNames: preview.trackNames,
      } satisfies LiveRetentionPreview,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_LIVE_RETENTION_PREVIEW, {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Unable to work out what would be removed.',
    });
  }
};

/**
 * What clearing local storage would destroy.
 *
 * Decisions especially. They are the one thing clearing removes that exists
 * nowhere else, there is no bulk export to fall back on, and the warning is
 * therefore the only safeguard a user has.
 */
export const getLocalDataSummary = async (event: Electron.IpcMainEvent) => {
  try {
    const sessions = Object.values(readLiveSessions());
    const incidents = Object.values(readLiveIncidents());

    event.reply(CONSTANTS.API.GET_LOCAL_DATA_SUMMARY, {
      status: 'success',
      data: {
        stewardDecisionCount: Object.keys(readStewardDecisions()).length,
        liveSessionCount: sessions.length,
        liveIncidentCount: incidents.length,
        liveTraceCount: incidents.filter((record) => record.hasContext).length,
      } satisfies LocalDataSummary,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_LOCAL_DATA_SUMMARY, {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Unable to summarise stored data.',
    });
  }
};

/**
 * Rejects the proposal and stops offering one.
 *
 * An unlinked session is a normal resting state — a practice replay is often
 * not kept — so once the user has said no, matching goes quiet for it rather
 * than re-proposing the same replay on every list load.
 */
export const postDismissLiveSessionMatch = async (
  event: Electron.IpcMainEvent,
  sessionKey: unknown,
) => {
  const key = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  const dismissed = key ? dismissLiveSessionMatch(key) : null;

  event.reply(CONSTANTS.API.POST_DISMISS_LIVE_SESSION_MATCH, {
    status: dismissed ? 'success' : 'error',
    message: dismissed ? undefined : 'Unable to dismiss that suggestion.',
    data: listLiveSessionSummaries(),
  });
};
