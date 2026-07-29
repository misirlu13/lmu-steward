import { CONSTANTS } from '@constants';
import { LiveSessionStatus } from '@types';

/**
 * Reports whether a live capture source is attached and currently seeing an
 * active session.
 *
 * This is the seam for Phase 1 of the live capture work. Today no capture
 * source exists, so the state is always `detached` and the renderer falls back
 * to showing standby whenever LMU itself is reachable.
 *
 * When the shared memory reader lands (see docs/live-capture-investigation.md)
 * this handler becomes the place that reports its state — returning `live`
 * with the session details drawn from ScoringInfoV01 once SME_START_SESSION
 * has fired and vehicles are present.
 */
export const getLiveSessionStatus = (event: Electron.IpcMainEvent) => {
  const status: LiveSessionStatus = {
    state: 'detached',
    detail: 'Live capture is not attached yet.',
  };

  event.reply(CONSTANTS.API.GET_LIVE_SESSION_STATUS, {
    status: 'success',
    data: status,
  });
};
