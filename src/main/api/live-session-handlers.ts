import log from 'electron-log';
import { CONSTANTS } from '@constants';
import { LiveDataForReplay, LiveSessionLink } from '@types';
import {
  deleteLiveSession,
  dismissLiveSessionMatch,
  findLiveSessionForReplay,
  linkLiveSessionToReplay,
  listLiveIncidentTimesBySession,
  listLiveSessionSummaries,
  readLiveIncidentsForSession,
  readLiveSession,
  unlinkLiveSession,
} from './live-session-store';
import { matchLiveSession, runLiveSessionMatchPass } from './live-replay-match';
import { listReplayMatchTargets } from './replay';

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

    event.reply(CONSTANTS.API.GET_LIVE_DATA_FOR_REPLAY, {
      status: 'success',
      data:
        session && session.link
          ? ({
              sessionKey: session.sessionKey,
              trackName: session.trackName,
              sessionType: session.sessionType,
              startedAt: session.startedAt,
              link: session.link,
              incidents,
            } satisfies LiveDataForReplay)
          : null,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_LIVE_DATA_FOR_REPLAY, {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Unable to read the linked captured session.',
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
