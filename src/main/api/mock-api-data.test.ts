import { CONSTANTS } from '@constants';
import { isMockPassthroughChannel, replyWithMockData } from './mock-api-data';

describe('main/mock-api-data dev mode passthrough', () => {
  const createEvent = () =>
    ({ reply: jest.fn() }) as unknown as Electron.IpcMainEvent & {
      reply: jest.Mock;
    };

  it.each([
    CONSTANTS.API.GET_USER_SETTINGS,
    CONSTANTS.API.POST_USER_SETTINGS,
    CONSTANTS.API.POST_DASHBOARD_VIEW,
    CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE,
  ])('defers %s to the real handler', async (channel) => {
    const event = createEvent();

    await expect(replyWithMockData(event, channel, undefined)).resolves.toBe(
      false,
    );
    expect(event.reply).not.toHaveBeenCalled();
    expect(isMockPassthroughChannel(channel)).toBe(true);
  });

  it('still serves mock payloads for LMU API channels', async () => {
    const event = createEvent();

    await expect(
      replyWithMockData(event, CONSTANTS.API.GET_PROFILE_INFO, undefined),
    ).resolves.toBe(true);
    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.GET_PROFILE_INFO,
      expect.objectContaining({ status: 'success' }),
    );
    expect(isMockPassthroughChannel(CONSTANTS.API.GET_PROFILE_INFO)).toBe(
      false,
    );
  });

  it('reports channels that have no mock configured', async () => {
    const event = createEvent();

    await expect(
      replyWithMockData(event, CONSTANTS.API.POST_RENDERER_ERROR, undefined),
    ).resolves.toBe(true);
    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_RENDERER_ERROR,
      expect.objectContaining({ status: 'error' }),
    );
  });
});
