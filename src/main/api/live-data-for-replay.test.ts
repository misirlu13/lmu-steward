import { CONSTANTS } from '@constants';
import { LiveSessionLink, LiveSessionRecord } from '@types';

/*
  The store and the replay cache are the two things this handler reasons over,
  so both are stubs it can be steered with. Everything else it imports is only
  along for the ride.
*/
const findLiveSessionForReplay = jest.fn();
const linkLiveSessionToReplay = jest.fn();
const listReplayMatchTargets = jest.fn();
const readLiveIncidentsForSession = jest.fn();

jest.mock('./live-session-store', () => ({
  findLiveSessionForReplay: (...args: unknown[]) =>
    findLiveSessionForReplay(...args),
  linkLiveSessionToReplay: (...args: unknown[]) =>
    linkLiveSessionToReplay(...args),
  readLiveIncidentsForSession: (...args: unknown[]) =>
    readLiveIncidentsForSession(...args),
  deleteLiveSession: jest.fn(),
  dismissLiveSessionMatch: jest.fn(),
  listLiveIncidentTimesBySession: jest.fn(() => new Map()),
  listLiveSessionSegments: jest.fn(() => ({ segments: [] })),
  listLiveSessionSummaries: jest.fn(() => []),
  readLiveIncidentContext: jest.fn(),
  readLiveIncidents: jest.fn(() => []),
  readLiveSession: jest.fn(),
  readLiveSessions: jest.fn(() => ({})),
  unlinkLiveSession: jest.fn(),
}));

jest.mock('./replay', () => ({
  listReplayMatchTargets: (...args: unknown[]) =>
    listReplayMatchTargets(...args),
}));

jest.mock('./live-retention', () => ({
  previewExpiredLiveSessions: jest.fn(),
}));
jest.mock('./steward-decisions', () => ({ readStewardDecisions: jest.fn() }));
jest.mock('./live-replay-match', () => ({
  matchLiveSession: jest.fn(),
  runLiveSessionMatchPass: jest.fn(),
}));
jest.mock('./live-capture', () => ({
  getLiveIncidentContextInMemory: jest.fn(),
}));
jest.mock('electron-log', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const { getLiveDataForReplay } = require('./live-session-handlers');

const IDENTITY = 'laguna seca|practice|p1 7|1785798030|c:/replays';

const link = (replayHash: string): LiveSessionLink => ({
  replayHash,
  replayIdentityKey: IDENTITY,
  replayName: 'P1 7',
  method: 'roster',
  confidence: 0.9,
  linkedAt: 1785798030000,
});

const session = (replayHash: string): LiveSessionRecord =>
  ({
    sessionKey: 'live|laguna|10|1785798030000',
    trackName: 'Laguna Seca',
    sessionType: 'PRACTICE',
    startedAt: 1785798030000,
    drivers: [],
    link: link(replayHash),
  }) as unknown as LiveSessionRecord;

const reply = jest.fn();
const event = { reply } as unknown as Electron.IpcMainEvent;

const lastReply = () => reply.mock.calls[reply.mock.calls.length - 1][1];

beforeEach(() => {
  jest.clearAllMocks();
  readLiveIncidentsForSession.mockReturnValue([]);
  listReplayMatchTargets.mockReturnValue([
    { hash: 'hash-new', identityKey: IDENTITY },
  ]);
});

describe('the captured session behind a replay', () => {
  it('answers with the capture for a link that still matches', async () => {
    findLiveSessionForReplay.mockReturnValue(session('hash-new'));

    await getLiveDataForReplay(event, { replayHash: 'hash-new' });

    expect(lastReply().data.sessionKey).toBe('live|laguna|10|1785798030000');
    expect(linkLiveSessionToReplay).not.toHaveBeenCalled();
  });

  /*
    The replay cache re-hashes, and the link's identity key is what carries a
    confirmed pairing across it. The fallback found the session but left the
    link pointing at a hash nothing has any more, so every later lookup went the
    long way round — through a cache read that can come back empty while a sync
    is rebuilding it. That is the shape of "the live data was there, then it
    wasn't, and relinking by hand fixed it for good".
  */
  it('repairs a link whose replay has been re-hashed', async () => {
    findLiveSessionForReplay.mockReturnValue(session('hash-old'));

    await getLiveDataForReplay(event, { replayHash: 'hash-new' });

    expect(linkLiveSessionToReplay).toHaveBeenCalledWith(
      'live|laguna|10|1785798030000',
      expect.objectContaining({
        replayHash: 'hash-new',
        replayIdentityKey: IDENTITY,
      }),
    );
  });

  it('still answers with the capture while repairing it', async () => {
    findLiveSessionForReplay.mockReturnValue(session('hash-old'));

    await getLiveDataForReplay(event, { replayHash: 'hash-new' });

    expect(lastReply().data.sessionKey).toBe('live|laguna|10|1785798030000');
  });

  /*
    Only on the identity key's word. A hash that differs with no identity match
    behind it is not the same replay, and rewriting the link on that would point
    a capture at somebody else's session.
  */
  it('leaves a link alone when the identity key does not agree', async () => {
    listReplayMatchTargets.mockReturnValue([
      { hash: 'hash-new', identityKey: 'a different session entirely' },
    ]);
    findLiveSessionForReplay.mockReturnValue(session('hash-old'));

    await getLiveDataForReplay(event, { replayHash: 'hash-new' });

    expect(linkLiveSessionToReplay).not.toHaveBeenCalled();
  });

  // So the renderer can tell the answer it is waiting for from one still in
  // flight for the replay it has just navigated away from.
  it('names the replay it is answering about', async () => {
    findLiveSessionForReplay.mockReturnValue(session('hash-new'));

    await getLiveDataForReplay(event, { replayHash: 'hash-new' });

    expect(lastReply().replayHash).toBe('hash-new');
    expect(reply).toHaveBeenCalledWith(
      CONSTANTS.API.GET_LIVE_DATA_FOR_REPLAY,
      expect.anything(),
    );
  });

  it('answers with nothing for a replay no capture is linked to', async () => {
    findLiveSessionForReplay.mockReturnValue(null);

    await getLiveDataForReplay(event, { replayHash: 'hash-new' });

    expect(lastReply().data).toBeNull();
    expect(lastReply().status).toBe('success');
  });
});
