/*
 * The declaration must stay above the imports, for the reason spelled out at
 * the top of `replay.test.ts`: importing `./replay` reads the store at module
 * evaluation time, and `jest.mock` is hoisted above the imports.
 */
/* eslint-disable import/first */
const replayStoreData: Record<string, unknown> = { replays: {} };

import { CONSTANTS } from '@constants';
import { postReplayRewatch, postReplayReturnToLive } from './replay';
/* eslint-enable import/first */

jest.mock('../storage/local-data-store', () => ({
  readProfileCache: () => ({ profileInfo: { name: 'Bradley Drake' } }),
  getMainPersistentStore: () => ({
    get: (key: string) => replayStoreData[key],
    set: (key: string, value: unknown) => {
      replayStoreData[key] = value;
    },
    clear: () => {},
  }),
}));

const reply = jest.fn();
const event = { reply } as unknown as Electron.IpcMainEvent;

/**
 * A game that answers `isActive` with `active` and everything else with 200.
 *
 * Returns the URLs it was asked for, in order, because **order is the contract
 * being tested**. `replaytime` is inert while a replay is not active — measured
 * at the live edge, it answers 200 and does nothing — so a seek that arrives
 * before the toggle fails silently, which is precisely the class of bug a
 * status-code assertion cannot see.
 */
const mockGame = (active: boolean) => {
  const calls: string[] = [];

  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    calls.push(url.replace(CONSTANTS.LMU_API_BASE_URL, ''));

    if (url.endsWith('/rest/replay/isActive')) {
      return { ok: true, status: 200, text: async () => String(active) };
    }

    return { ok: true, status: 200 };
  }) as typeof global.fetch;

  return calls;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('rewatching an incident from a live session', () => {
  it('should read the game before toggling, then seek, then aim the camera', async () => {
    const calls = mockGame(false);

    await postReplayRewatch(event, { etSeconds: 3474.98, slotId: 12 });

    expect(calls).toEqual([
      '/rest/replay/isActive',
      '/rest/replay/toggleactive',
      '/rest/watch/replaytime/3469.98',
      '/rest/watch/focus/12',
    ]);
    expect(reply).toHaveBeenCalledWith(CONSTANTS.API.POST_REPLAY_REWATCH, {
      status: 'success',
      data: { isReplayActive: true, seekToSeconds: 3469.98, focusedSlotId: 12 },
    });
  });

  /*
    The half that shipped missing. Seeking alone rewinds the clock and leaves the
    camera wherever it happened to be, so the steward arrives at the right moment
    pointed at the wrong car — and the only way to see the incident was to focus
    a driver manually and press Rewatch a second time. Reported from real use.

    Focus goes last on purpose: the toggle lands at lap 1 and the seek moves the
    clock, and neither may be allowed to drag the camera off the car afterwards.
  */
  it('should aim the camera after the seek, never before it', async () => {
    const calls = mockGame(true);

    await postReplayRewatch(event, { etSeconds: 100, slotId: 7 });

    expect(calls.indexOf('/rest/watch/focus/7')).toBeGreaterThan(
      calls.indexOf('/rest/watch/replaytime/95'),
    );
  });

  /*
    A slot is the only key LMU's focus endpoint takes, and not every incident
    carries one. Refusing to seek because the camera cannot be aimed would be
    worse than seeking without aiming it.
  */
  it('should still seek for an incident with no addressable car', async () => {
    const calls = mockGame(true);

    await postReplayRewatch(event, { etSeconds: 100 });

    expect(calls).toEqual([
      '/rest/replay/isActive',
      '/rest/watch/replaytime/95',
    ]);
    expect(reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_REPLAY_REWATCH,
      expect.objectContaining({ status: 'success' }),
    );
  });

  /*
    Focus is the one call in this sequence LMU can actually refuse — it answers
    400 outside a session, where `setCamera` answers 200 to anything. Reported
    rather than swallowed, even though the picture has already moved by then.
  */
  it('should report a camera the game would not move', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/rest/replay/isActive')) {
        return { ok: true, status: 200, text: async () => 'true' };
      }
      if (url.includes('/rest/watch/focus/')) {
        return { ok: false, status: 400 };
      }
      return { ok: true, status: 200 };
    }) as typeof global.fetch;

    await postReplayRewatch(event, { etSeconds: 100, slotId: 9999 });

    expect(reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_REPLAY_REWATCH,
      expect.objectContaining({ status: 'error' }),
    );
  });

  /*
    `toggleactive` is a toggle with no setter — there is no `setActive` among
    LMU's 179 endpoints — so a second rewatch that toggled unconditionally would
    throw the steward back to the live edge instead of moving the picture.
  */
  it('should not toggle when the game is already showing a replay', async () => {
    const calls = mockGame(true);

    await postReplayRewatch(event, { etSeconds: 100 });

    expect(calls).not.toContain('/rest/replay/toggleactive');
    expect(calls).toEqual([
      '/rest/replay/isActive',
      '/rest/watch/replaytime/95',
    ]);
  });

  // The lead-in cannot walk off the start of the session.
  it('should clamp the seek at the session start', async () => {
    const calls = mockGame(true);

    await postReplayRewatch(event, { etSeconds: 2 });

    expect(calls).toContain('/rest/watch/replaytime/0');
  });

  /*
    The one answer neither caller may guess at. Toggling on an unknown state is
    a coin flip between doing nothing and yanking the picture off a live
    session, so an unreadable `isActive` refuses rather than assumes.
  */
  it('should refuse to act when the game will not say whether a replay is playing', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 400 }) as typeof global.fetch;

    await postReplayRewatch(event, { etSeconds: 100 });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_REPLAY_REWATCH,
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('should refuse an incident with no time to seek to', async () => {
    mockGame(false);

    await postReplayRewatch(event, {});

    expect(global.fetch).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_REPLAY_REWATCH,
      expect.objectContaining({ status: 'error' }),
    );
  });
});

describe('returning to the live edge', () => {
  it('should toggle only when a replay is actually playing', async () => {
    const calls = mockGame(true);

    await postReplayReturnToLive(event);

    expect(calls).toEqual([
      '/rest/replay/isActive',
      '/rest/replay/toggleactive',
    ]);
    expect(reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_REPLAY_RETURN_TO_LIVE,
      { status: 'success', data: { isReplayActive: false } },
    );
  });

  /*
    Pressing it twice, or pressing it after the steward has already used LMU's
    own LIVE button, must not rewind the picture into a replay.
  */
  it('should do nothing when the picture is already live', async () => {
    const calls = mockGame(false);

    await postReplayReturnToLive(event);

    expect(calls).toEqual(['/rest/replay/isActive']);
    expect(reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_REPLAY_RETURN_TO_LIVE,
      { status: 'success', data: { isReplayActive: false } },
    );
  });
});
