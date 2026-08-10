import { CONSTANTS } from '@constants';
import { getLiveCaptureStatus, getLiveSessionData } from './live-capture';

/**
 * Reports whether a live capture source is attached and currently seeing an
 * active session.
 *
 * The supervisor in live-capture.ts owns the sidecar process and the current
 * state; this handler just surfaces it over IPC.
 */
export const getLiveSessionStatus = (event: Electron.IpcMainEvent) => {
  event.reply(CONSTANTS.API.GET_LIVE_SESSION_STATUS, {
    status: 'success',
    data: getLiveCaptureStatus(),
  });
};

/**
 * Full session snapshot: status, current field, and incidents captured so far.
 * Returns empty collections when no session is live, so the renderer never has
 * to guess whether it is looking at stale data.
 */
export const getLiveSessionDataHandler = (event: Electron.IpcMainEvent) => {
  event.reply(CONSTANTS.API.GET_LIVE_SESSION_DATA, {
    status: 'success',
    data: getLiveSessionData(),
  });
};
