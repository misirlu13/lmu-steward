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

  /*
    The three channels the live camera bar polls, plus the two it acts through.
    A missing mock here does not fall through to the real handler — it replies
    with an error — so under `LMU_DEVMODE=true` the bar would report the game
    unreachable once a second and the replay strip would never appear.
  */
  it.each([
    CONSTANTS.API.GET_IS_REPLAY_ACTIVE,
    CONSTANTS.API.GET_FOCUSED_CAR,
    CONSTANTS.API.GET_CAMERA_INFO,
    CONSTANTS.API.POST_REPLAY_REWATCH,
    CONSTANTS.API.POST_REPLAY_RETURN_TO_LIVE,
  ])('serves %s in dev mode', async (channel) => {
    const event = createEvent();

    await replyWithMockData(event, channel, { etSeconds: 100 });

    expect(event.reply).toHaveBeenCalledWith(
      channel,
      expect.objectContaining({ status: 'success' }),
    );
  });

  /*
    And they agree with each other. A flat `isActive: true` beside a
    return-to-live that reported success would have dev mode contradicting
    itself about the one fact this feature is built on.
  */
  it('keeps its replay state consistent across the three replay channels', async () => {
    const live = createEvent();
    await replyWithMockData(live, CONSTANTS.API.POST_REPLAY_RETURN_TO_LIVE, {});

    const afterLive = createEvent();
    await replyWithMockData(afterLive, CONSTANTS.API.GET_IS_REPLAY_ACTIVE, {});
    expect(afterLive.reply).toHaveBeenCalledWith(
      CONSTANTS.API.GET_IS_REPLAY_ACTIVE,
      expect.objectContaining({ data: false }),
    );

    const rewatch = createEvent();
    await replyWithMockData(rewatch, CONSTANTS.API.POST_REPLAY_REWATCH, {
      etSeconds: 100,
    });

    const afterRewatch = createEvent();
    await replyWithMockData(
      afterRewatch,
      CONSTANTS.API.GET_IS_REPLAY_ACTIVE,
      {},
    );
    expect(afterRewatch.reply).toHaveBeenCalledWith(
      CONSTANTS.API.GET_IS_REPLAY_ACTIVE,
      expect.objectContaining({ data: true }),
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
