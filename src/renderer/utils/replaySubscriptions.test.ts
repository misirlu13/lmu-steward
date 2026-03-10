import { CONSTANTS } from '@constants';
import { buildReplayApiSubscriptions } from './replaySubscriptions';

describe('replaySubscriptions', () => {
  it('builds channel subscriptions and routes success payloads', () => {
    const setSessionInfoData = jest.fn();
    const setStandingsData = jest.fn();
    const setStandingsHistoryData = jest.fn();
    const setIsReplayActiveForRoute = jest.fn();

    const subscriptions = buildReplayApiSubscriptions({
      setSessionInfoData,
      setStandingsData,
      setStandingsHistoryData,
      setIsReplayActiveForRoute,
    });

    expect(subscriptions.map((entry) => entry.channel)).toEqual([
      CONSTANTS.API.GET_TRACK_MAP,
      CONSTANTS.API.GET_SESSION_INFO,
      CONSTANTS.API.GET_STANDINGS,
      CONSTANTS.API.GET_STANDINGS_HISTORY,
      CONSTANTS.API.GET_IS_REPLAY_ACTIVE,
    ]);

    subscriptions.find((entry) => entry.channel === CONSTANTS.API.GET_SESSION_INFO)?.callback({
      status: 'success',
      data: { maximumLaps: 20 },
    });
    subscriptions.find((entry) => entry.channel === CONSTANTS.API.GET_STANDINGS)?.callback({
      status: 'success',
      data: [{ driverName: 'A' }],
    });
    subscriptions
      .find((entry) => entry.channel === CONSTANTS.API.GET_STANDINGS_HISTORY)
      ?.callback({
        status: 'success',
        data: { heatmapSpots: [] },
      });
    subscriptions
      .find((entry) => entry.channel === CONSTANTS.API.GET_IS_REPLAY_ACTIVE)
      ?.callback({ status: 'success', data: true });

    expect(setSessionInfoData).toHaveBeenCalledWith({ maximumLaps: 20 });
    expect(setStandingsData).toHaveBeenCalledWith([{ driverName: 'A' }]);
    expect(setStandingsHistoryData).toHaveBeenCalledWith({ heatmapSpots: [] });
    expect(setIsReplayActiveForRoute).toHaveBeenCalledWith(true);
  });

  it('reports errors and handles replay-active failures', () => {
    const setSessionInfoData = jest.fn();
    const setStandingsData = jest.fn();
    const setStandingsHistoryData = jest.fn();
    const setIsReplayActiveForRoute = jest.fn();
    const onError = jest.fn();

    const subscriptions = buildReplayApiSubscriptions({
      setSessionInfoData,
      setStandingsData,
      setStandingsHistoryData,
      setIsReplayActiveForRoute,
      onError,
    });

    subscriptions.find((entry) => entry.channel === CONSTANTS.API.GET_TRACK_MAP)?.callback({
      status: 'error',
      message: 'no map',
    });
    subscriptions.find((entry) => entry.channel === CONSTANTS.API.GET_SESSION_INFO)?.callback({
      status: 'error',
      message: 'session failed',
    });
    subscriptions.find((entry) => entry.channel === CONSTANTS.API.GET_STANDINGS)?.callback({
      status: 'error',
      message: 'standings failed',
    });
    subscriptions
      .find((entry) => entry.channel === CONSTANTS.API.GET_STANDINGS_HISTORY)
      ?.callback({
        status: 'error',
        message: 'history failed',
      });
    subscriptions
      .find((entry) => entry.channel === CONSTANTS.API.GET_IS_REPLAY_ACTIVE)
      ?.callback({ status: 'error' });

    expect(onError).toHaveBeenCalledWith('Error fetching track map:', 'no map');
    expect(onError).toHaveBeenCalledWith(
      'Error fetching session info:',
      'session failed',
    );
    expect(onError).toHaveBeenCalledWith(
      'Error fetching standings:',
      'standings failed',
    );
    expect(onError).toHaveBeenCalledWith(
      'Error fetching standings history:',
      'history failed',
    );
    expect(setIsReplayActiveForRoute).toHaveBeenCalledWith(null);
  });
});
