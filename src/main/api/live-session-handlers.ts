import { CONSTANTS } from '@constants';
import {
  deleteLiveSession,
  listLiveSessionSummaries,
} from './live-session-store';

export const getLiveSessions = async (event: Electron.IpcMainEvent) => {
  try {
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
