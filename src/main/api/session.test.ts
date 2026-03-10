import { CONSTANTS } from '@constants';
import {
  getSessionInfo,
  getStandings,
  getStandingsHistory,
  getTrackMap,
  getTrackThumbnail,
} from './session';

describe('main/session API contracts', () => {
  const fetchMock = jest.fn();
  const createEvent = () => ({ reply: jest.fn() } as unknown as Electron.IpcMainEvent);

  beforeEach(() => {
    jest.clearAllMocks();
    (global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
  });

  const successCases: Array<{
    name: string;
    handler: (event: Electron.IpcMainEvent, arg?: number) => Promise<void>;
    eventChannel: string;
    url: string;
    arg?: number;
    expectsWrappedSuccess: boolean;
  }> = [
    {
      name: 'getSessionInfo',
      handler: (event) => getSessionInfo(event),
      eventChannel: CONSTANTS.API.GET_SESSION_INFO,
      url: `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/sessionInfo`,
      expectsWrappedSuccess: true,
    },
    {
      name: 'getStandings',
      handler: (event) => getStandings(event),
      eventChannel: CONSTANTS.API.GET_STANDINGS,
      url: `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/standings`,
      expectsWrappedSuccess: true,
    },
    {
      name: 'getStandingsHistory',
      handler: (event) => getStandingsHistory(event),
      eventChannel: CONSTANTS.API.GET_STANDINGS_HISTORY,
      url: `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/standings/history`,
      expectsWrappedSuccess: true,
    },
    {
      name: 'getTrackMap',
      handler: (event) => getTrackMap(event),
      eventChannel: CONSTANTS.API.GET_TRACK_MAP,
      url: `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/trackMap`,
      expectsWrappedSuccess: true,
    },
    {
      name: 'getTrackThumbnail',
      handler: (event, trackId) => getTrackThumbnail(event, Number(trackId)),
      eventChannel: CONSTANTS.API.GET_TRACK_THUMBNAIL,
      url: `${CONSTANTS.LMU_API_BASE_URL}/rest/race/track/77/thumbnail`,
      arg: 77,
      expectsWrappedSuccess: false,
    },
  ];

  it.each(successCases)('$name returns success reply on ok response', async ({
    handler,
    eventChannel,
    url,
    arg,
    expectsWrappedSuccess,
  }) => {
    const event = createEvent();
    const payload = { ok: true };

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    await handler(event, arg);

    expect(fetchMock).toHaveBeenCalledWith(url);

    if (expectsWrappedSuccess) {
      expect((event.reply as jest.Mock)).toHaveBeenCalledWith(eventChannel, {
        status: 'success',
        data: payload,
      });
      return;
    }

    expect((event.reply as jest.Mock)).toHaveBeenCalledWith(eventChannel, payload);
  });

  it.each(successCases)('$name returns error reply on non-ok response', async ({
    handler,
    eventChannel,
    arg,
  }) => {
    const event = createEvent();

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await handler(event, arg);

    expect((event.reply as jest.Mock)).toHaveBeenCalledWith(eventChannel, {
      status: 'error',
      message: 'API responded with status 500',
    });
  });

  it.each(successCases)('$name returns error reply when fetch throws', async ({
    handler,
    eventChannel,
    arg,
  }) => {
    const event = createEvent();

    fetchMock.mockRejectedValue(new Error('LMU API unreachable'));

    await handler(event, arg);

    expect((event.reply as jest.Mock)).toHaveBeenCalledWith(eventChannel, {
      status: 'error',
      message: 'LMU API unreachable',
    });
  });
});
