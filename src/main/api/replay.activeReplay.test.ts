/*
 * These declarations must stay above the imports, for the reason
 * `replay.test.ts` spells out: `jest.mock` is hoisted, and importing `./replay`
 * evaluates that module, which reads the store at import time.
 *
 * The mock is not optional here. Without it the module opens the *real*
 * application database — `getMainPersistentStore` falls back to the APPDATA
 * path when Electron's `app` is absent — and a schema-version mismatch would
 * wipe the user's replay cache from a unit test.
 */
/* eslint-disable import/first */
const replayStoreData: Record<string, unknown> = { replays: {} };

import { CONSTANTS } from '@constants';
import { activeReplayMatchesSession, getActiveReplay } from './replay';
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

/*
  The record the app writes when it tells LMU to play a replay, and the answer
  `/rest/watch/sessionInfo` gives while that replay is running.

  Both sides are real, captured from a live session on 2026-08-10 with
  "Daytona International Speedway Road Course P1 18" loaded. They are the point
  of the test: the game names the circuit in full where the replay's metadata
  says `DAYTONARC`, and numbers the session `PRACTICE1` where the metadata says
  `PRACTICE`. A check comparing either pair as strings would reject the very
  replay it was written to confirm.
*/
const RECORD = {
  sceneDesc: 'DAYTONARC',
  replayName: 'Daytona International Speedway Road Course P1 18',
  sessionType: 'PRACTICE',
};

const GAME = {
  trackName: 'Daytona International Speedway Road Course',
  session: 'PRACTICE1',
};

describe('recognising the replay the game is showing', () => {
  it('accepts the session the app actually loaded', () => {
    expect(activeReplayMatchesSession(RECORD, GAME)).toBe(true);
  });

  /*
    The case the check exists for. The remembered hash survives restarting this
    app but not restarting the *game*, so a steward can quit LMU, reopen it and
    load something else — and the record would still name the old file.
  */
  it('rejects a different session at the same circuit', () => {
    expect(
      activeReplayMatchesSession(RECORD, { ...GAME, session: 'RACE1' }),
    ).toBe(false);
  });

  it('rejects a different circuit', () => {
    expect(
      activeReplayMatchesSession(RECORD, {
        ...GAME,
        trackName: 'Autodromo Nazionale Monza',
      }),
    ).toBe(false);
  });

  it('rejects an answer with nothing in it', () => {
    expect(activeReplayMatchesSession(RECORD, {})).toBe(false);
  });

  // A qualifying replay against a qualifying session, to prove the stem rule is
  // not special-cased to practice.
  it('accepts a numbered qualifying session', () => {
    expect(
      activeReplayMatchesSession(
        { ...RECORD, sessionType: 'QUALIFY' },
        { ...GAME, session: 'QUALIFY1' },
      ),
    ).toBe(true);
  });

  /*
    New content reaches the replay list before it reaches the track alias table,
    and the replay name is the fallback that keeps this working until it does —
    with the session suffix stripped, which `getTrackAliases` does itself.
  */
  it('falls back to the replay name for an unknown scene', () => {
    expect(
      activeReplayMatchesSession(
        {
          sceneDesc: 'SOMENEWTRACK',
          replayName: 'Some New Circuit P1 3',
          sessionType: 'PRACTICE',
        },
        { trackName: 'Some New Circuit', session: 'PRACTICE1' },
      ),
    ).toBe(true);
  });
});

/*
  The defect this exists for: asking whether a replay is playing used to *clear*
  the memory of which one whenever the answer was no. No is the ordinary answer
  — the game not started, the game mid-load, this app running before LMU is
  reachable, which on `npm start` it always is — so a single early question wiped
  the only record of the loaded replay and no later call could recover it. The
  banner never came back, whatever the game went on to do.
*/
describe('asking the game which replay is playing', () => {
  const LOADED = {
    hash: 'hash-p1-18',
    identityKey: 'daytonarc|practice|p1 18|1786415677|c:/replays/',
    sceneDesc: 'DAYTONARC',
    replayName: 'Daytona International Speedway Road Course P1 18',
    sessionType: 'PRACTICE',
    loadedAt: 1786415677000,
  };

  const reply = jest.fn();
  const event = { reply } as unknown as Electron.IpcMainEvent;

  /** `isActive` first, then `sessionInfo`, in the order the handler asks. */
  const answerGame = (isActive: boolean, info?: unknown) => {
    global.fetch = jest.fn(async (url: unknown) =>
      String(url).includes('isActive')
        ? { ok: true, json: async () => isActive }
        : { ok: true, json: async () => info ?? {} },
    ) as unknown as typeof fetch;
  };

  const lastReply = () => reply.mock.calls[reply.mock.calls.length - 1][1];

  beforeEach(() => {
    jest.clearAllMocks();
    replayStoreData.activeReplay = { ...LOADED };
    /*
      A realistic cache entry, `replayDirectory` included. The entry is what the
      log lookup reads to find the results folder, and a thinner fixture would
      only ever prove the failure path.
    */
    replayStoreData.replays = {
      'hash-p1-18': {
        hash: 'hash-p1-18',
        replayName: LOADED.replayName,
        replayDirectory: 'C:/lmu/UserData/Replays',
        timestamp: 1786415677,
        metadata: { sceneDesc: 'DAYTONARC', session: 'PRACTICE' },
      },
    };
    replayStoreData.importedReplays = {};
  });

  it('resolves the replay the game is showing', async () => {
    answerGame(true, {
      trackName: 'Daytona International Speedway Road Course',
      session: 'PRACTICE1',
    });

    await getActiveReplay(event);

    expect(lastReply()).toMatchObject({
      status: 'success',
      data: { hash: 'hash-p1-18' },
    });
  });

  /*
    The cache entry says where the log is, not what is in it — `logDataLoaded`
    is false on it by design. Everything the replay view draws from the log
    rather than from the game (the master incident timeline, the heatmaps, the
    driver list) comes out of `logData`, so handing back the bare entry produced
    a view that loaded, connected, and showed nothing.
  */
  it('parses the result log before handing the replay over', async () => {
    answerGame(true, {
      trackName: 'Daytona International Speedway Road Course',
      session: 'PRACTICE1',
    });

    await getActiveReplay(event);

    // The hydration ran: the reply carries the resolved log fields rather than
    // the cache entry's untouched ones.
    expect(lastReply().data).toHaveProperty('logDataLoaded');
    expect(lastReply().data).toHaveProperty('logData');
  });

  it('answers with nothing while no replay is playing', async () => {
    answerGame(false);

    await getActiveReplay(event);

    expect(lastReply()).toMatchObject({ status: 'success', data: null });
  });

  // The heart of it. The record has to outlive every "no" the game gives.
  it('keeps the record when the game says no replay is playing', async () => {
    answerGame(false);

    await getActiveReplay(event);

    expect(replayStoreData.activeReplay).toMatchObject({
      hash: 'hash-p1-18',
    });
  });

  /*
    And so the banner appears once the game finally comes up, which is the
    sequence that failed: app restarted, LMU not answering yet, replay still
    running.
  */
  it('still resolves after an earlier answer of no', async () => {
    answerGame(false);
    await getActiveReplay(event);

    answerGame(true, {
      trackName: 'Daytona International Speedway Road Course',
      session: 'PRACTICE1',
    });
    await getActiveReplay(event);

    expect(lastReply()).toMatchObject({
      status: 'success',
      data: { hash: 'hash-p1-18' },
    });
  });

  it('answers with nothing when the game has moved to another session', async () => {
    answerGame(true, {
      trackName: 'Daytona International Speedway Road Course',
      session: 'RACE1',
    });

    await getActiveReplay(event);

    expect(lastReply()).toMatchObject({ status: 'success', data: null });
  });

  it('answers with nothing when nothing was ever recorded', async () => {
    replayStoreData.activeReplay = null;
    answerGame(true, {
      trackName: 'Daytona International Speedway Road Course',
      session: 'PRACTICE1',
    });

    await getActiveReplay(event);

    expect(lastReply()).toMatchObject({ status: 'success', data: null });
  });

  it('replies on the channel the renderer listens to', async () => {
    answerGame(false);

    await getActiveReplay(event);

    expect(reply).toHaveBeenCalledWith(
      CONSTANTS.API.GET_ACTIVE_REPLAY,
      expect.anything(),
    );
  });
});
