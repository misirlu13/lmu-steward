import { CONSTANTS } from '@constants';
import { LMUReplay } from '@types';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

type ApiChannel = (typeof CONSTANTS.API)[keyof typeof CONSTANTS.API];

export type MockApiResolver =
  | unknown
  | ((requestData: unknown) => unknown | Promise<unknown>);

const DEV_MODE_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export const isDevModeEnabled = (): boolean => {
  const value = `${process.env.LMU_DEVMODE ?? ''}`.toLowerCase().trim();
  return DEV_MODE_TRUE_VALUES.has(value);
};

const resolveMockResponse = async (
  resolver: MockApiResolver,
  requestData: unknown,
): Promise<unknown> => {
  if (typeof resolver === 'function') {
    return (resolver as (requestData: unknown) => unknown | Promise<unknown>)(
      requestData,
    );
  }

  return resolver;
};

const readMockJsonFile = (fileName: string, fallbackValue: unknown): unknown => {
  try {
    const fullPath = resolve(process.cwd(), '.erb', 'mocks', fileName);

    if (!existsSync(fullPath)) {
      return fallbackValue;
    }

    const fileContents = readFileSync(fullPath, 'utf-8');
    return JSON.parse(fileContents);
  } catch {
    return fallbackValue;
  }
};

const isResponseObject = (
  value: unknown,
): value is { status: 'success' | 'error'; data?: unknown; message?: string } => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'status' in value;
};

const toSuccessResponse = (value: unknown, fallbackData: unknown) => {
  if (isResponseObject(value)) {
    return value;
  }

  return {
    status: 'success' as const,
    data: value ?? fallbackData,
  };
};

const toStandingsSuccessResponse = (value: unknown) => {
  const normalizePayload = (payload: unknown) => {
    if (Array.isArray(payload)) {
      return {
        entries: payload,
      };
    }

    if (payload && typeof payload === 'object') {
      return payload;
    }

    return {
      entries: [],
    };
  };

  if (isResponseObject(value)) {
    return {
      ...value,
      data: normalizePayload(value.data),
    };
  }

  return {
    status: 'success' as const,
    data: normalizePayload(value),
  };
};

const isReplayLike = (value: unknown): value is LMUReplay => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const replay = value as Partial<LMUReplay>;
  return !!replay.hash && !!replay.metadata;
};

const normalizeReplayMocks = (value: unknown): LMUReplay[] => {
  const replays: LMUReplay[] = [];

  const collect = (input: unknown) => {
    if (!input) {
      return;
    }

    if (isReplayLike(input)) {
      replays.push(input);
      return;
    }

    if (Array.isArray(input)) {
      input.forEach((item) => collect(item));
      return;
    }

    if (typeof input === 'object') {
      Object.values(input as Record<string, unknown>).forEach((item) =>
        collect(item),
      );
    }
  };

  collect(value);
  return replays;
};

const fallbackReplay: LMUReplay = {
  hash: 'mock-replay-1',
  metadata: {
    sceneDesc: 'SEBRINGWEC',
    session: 'RACE',
  },
  logData: {},
  logDataDirectory: 'mock/logs',
  logDataFileName: 'mock-session.xml',
  replayDirectory: 'mock/replays',
  replayName: 'Mock Replay Session',
  size: 0,
  timestamp: Math.floor(Date.now() / 1000),
};

const replayMockData = readMockJsonFile('replayMock.json', []);
const standingsMockData = readMockJsonFile('standingsMock.json', []);
const standingsHistoryMockData = readMockJsonFile('standingsHistoryMock.json', {});
const sessionInfoMockData = readMockJsonFile('sessionInfoMock.json', null);
const trackMapMockData = readMockJsonFile('trackMapMock.json', null);

const mockReplays = normalizeReplayMocks(replayMockData);

if (mockReplays.length === 0) {
  mockReplays.push(fallbackReplay);
}

const standingsResponse = toStandingsSuccessResponse(standingsMockData);
const standingsHistoryResponse = toSuccessResponse(standingsHistoryMockData, {});
const sessionInfoResponse = toSuccessResponse(sessionInfoMockData, {
  inRealtime: false,
  gamePhase: 9,
  session: 'RACE1',
  numberOfVehicles: 0,
  trackName: 'Mock Track',
});
const trackMapResponse = toSuccessResponse(trackMapMockData, {
  points: [],
});

const MOCK_REPLAY_LOADING_DURATION_MS = 6500;
let mockReplayLoadingStartedAtMs: number | null = null;

const getMockLoadingStatus = () => {
  if (mockReplayLoadingStartedAtMs === null) {
    return {
      loading: false,
      percentage: 1,
    };
  }

  const elapsedMs = Date.now() - mockReplayLoadingStartedAtMs;
  const rawProgress = elapsedMs / MOCK_REPLAY_LOADING_DURATION_MS;
  const percentage = Math.max(0, Math.min(1, rawProgress));

  if (percentage >= 1) {
    mockReplayLoadingStartedAtMs = null;
    return {
      loading: false,
      percentage: 1,
    };
  }

  return {
    loading: true,
    percentage,
  };
};

export const mockApiData: Partial<Record<ApiChannel, MockApiResolver>> = {
  [CONSTANTS.API.GET_API_STATUS]: () => ({
    status: 'success',
    data: {
      loadingStatus: getMockLoadingStatus(),
    },
  }),
  [CONSTANTS.API.GET_REPLAYS]: {
    status: 'success',
    data: mockReplays,
  },
  [CONSTANTS.API.POST_WATCH_REPLAY]: (requestData: unknown) => {
    mockReplayLoadingStartedAtMs = Date.now();
    const requestedHash = typeof requestData === 'string' ? requestData : null;
    const replay =
      mockReplays.find((item) => item.hash === requestedHash) ?? mockReplays[0];

    if (!replay) {
      return {
        status: 'error',
        message: 'No mock replays configured for post.watch-replay',
      };
    }

    return {
      status: 'success',
      data: replay,
    };
  },
  [CONSTANTS.API.GET_TRACK_MAP]: trackMapResponse,
  [CONSTANTS.API.GET_TRACK_THUMBNAIL]: {
    image: null,
  },
  [CONSTANTS.API.GET_STANDINGS]: standingsResponse,
  [CONSTANTS.API.GET_STANDINGS_HISTORY]: standingsHistoryResponse,
  [CONSTANTS.API.GET_SESSION_INFO]: sessionInfoResponse,
  [CONSTANTS.API.GET_IS_REPLAY_ACTIVE]: {
    status: 'success',
    data: true,
  },
  [CONSTANTS.API.GET_FOCUSED_CAR]: {
    status: 'success',
    data: {
      slotID: 0,
    },
  },
  [CONSTANTS.API.GET_USER_SETTINGS]: {
    status: 'success',
    data: {
      lmuExecutablePath: CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH,
      lmuReplayDirectoryPath: CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH,
      firstRun: false,
      profileName: 'Race Steward',
      profileEmail: 'steward@example.com',
      profileRole: 'Chief Steward',
      automaticSyncEnabled: true,
      syncOnAppLaunch: true,
      syncOnIntervalMinutes: 5,
      anonymizeDriverData: false,
      telemetryCacheEnabled: true,
      clearCacheOnExit: false,
      lastReplaySyncAt: Date.now(),
      closeLmuWhenStewardExits: false,
      closeLmuOnExitAlwaysPerformAction: false,
    },
  },
  [CONSTANTS.API.GET_PROFILE_INFO]: {
    status: 'success',
    data: {
      profileInfo: {
        language: 'english',
        name: 'Bradley Drake',
        nationality: 'US',
        nick: 'Bradley Drake',
        steamID: '76561198849082115',
      },
      hasFetchedProfileInfo: true,
      source: 'live',
      lastFetchedAt: Date.now(),
    },
  },
  [CONSTANTS.API.POST_USER_SETTINGS]: {
    status: 'success',
    data: {},
  },
  [CONSTANTS.API.POST_REPLAY_COMMAND_UI]: {
    status: 'success',
  },
  [CONSTANTS.API.POST_CAMERA_ANGLE]: {
    status: 'success',
  },
  [CONSTANTS.API.POST_CLOSE_LMU]: {
    status: 'success',
  },
  [CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE]: {
    status: 'success',
    data: {
      lmuExecutablePath: CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH,
      lmuReplayDirectoryPath: CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH,
      firstRun: true,
      automaticSyncEnabled: true,
      syncOnAppLaunch: true,
      syncOnIntervalMinutes: 5,
      lastReplaySyncAt: null,
      closeLmuWhenStewardExits: false,
      closeLmuOnExitAlwaysPerformAction: false,
    },
  },
  [CONSTANTS.API.POST_CLOSE_REPLAY]: {
    status: 'success',
  },
  [CONSTANTS.API.POST_LAUNCH_LMU]: {
    status: 'success',
    data: {
      executablePath:
        'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\Le Mans Ultimate.exe',
    },
  },
  [CONSTANTS.API.POST_OPEN_SETTINGS]: {
    status: 'success',
    data: {
      openRoute: '/user-settings',
    },
  },
  [CONSTANTS.API.REQUEST_APP_EXIT_CONFIRM]: {
    status: 'success',
    data: {
      defaultCloseLmuWhenStewardExits: false,
    },
  },
  [CONSTANTS.API.REPLY_APP_EXIT_CONFIRM]: {
    status: 'success',
  },
  [CONSTANTS.API.POST_SELECT_LMU_EXECUTABLE]: {
    status: 'success',
    data: {
      canceled: false,
      lmuExecutablePath: CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH,
    },
  },
  [CONSTANTS.API.POST_SELECT_LMU_REPLAY_DIRECTORY]: {
    status: 'success',
    data: {
      canceled: false,
      lmuReplayDirectoryPath: CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH,
    },
  },
  [CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN]: {
    status: 'success',
  },
  [CONSTANTS.API.PUT_REPLAY_COMMAND_TIME]: {
    status: 'success',
  },
  [CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR]: {
    status: 'success',
  },
  [CONSTANTS.API.PUT_FOCUS_CAR]: {
    status: 'success',
  },
};

export const replyWithMockData = async (
  event: Electron.IpcMainEvent,
  channel: ApiChannel,
  requestData: unknown,
): Promise<boolean> => {
  const resolver = mockApiData[channel];

  if (resolver === undefined) {
    event.reply(channel, {
      status: 'error',
      message: `LMU_DEVMODE is enabled but no mock payload is configured for channel: ${channel}`,
    });
    return true;
  }

  const payload = await resolveMockResponse(resolver, requestData);
  event.reply(channel, payload);
  return true;
};
