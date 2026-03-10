import { CONSTANTS } from '@constants';
import { getApiStatus } from './api-status';

describe('main/api-status', () => {
  const fetchMock = jest.fn();
  const createEvent = () => ({ reply: jest.fn() } as unknown as Electron.IpcMainEvent);

  beforeEach(() => {
    jest.clearAllMocks();
    (global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
  });

  it('replies with success payload when API status request succeeds', async () => {
    const event = createEvent();
    const payload = { connected: true };

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    await getApiStatus(event);

    expect(fetchMock).toHaveBeenCalledWith(
      `${CONSTANTS.LMU_API_BASE_URL}/navigation/state`,
    );
    expect((event.reply as jest.Mock)).toHaveBeenCalledWith(
      CONSTANTS.API.GET_API_STATUS,
      { status: 'success', data: payload },
    );
  });

  it('replies with error payload when API responds with non-ok status', async () => {
    const event = createEvent();

    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    await getApiStatus(event);

    expect((event.reply as jest.Mock)).toHaveBeenCalledWith(
      CONSTANTS.API.GET_API_STATUS,
      { status: 'error', message: 'API responded with status 503' },
    );
  });

  it('replies with error payload when fetch throws', async () => {
    const event = createEvent();

    fetchMock.mockRejectedValue(new Error('Network unavailable'));

    await getApiStatus(event);

    expect((event.reply as jest.Mock)).toHaveBeenCalledWith(
      CONSTANTS.API.GET_API_STATUS,
      { status: 'error', message: 'Network unavailable' },
    );
  });
});
