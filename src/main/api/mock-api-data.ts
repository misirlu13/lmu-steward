import { CONSTANTS } from '@constants';
import { LMUReplay } from '@types';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { extractLiveCarPositions } from './live-positions';

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

const readMockJsonFile = (
  fileName: string,
  fallbackValue: unknown,
): unknown => {
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
): value is {
  status: 'success' | 'error';
  data?: unknown;
  message?: string;
} => {
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
  multiplayer: false,
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
const standingsHistoryMockData = readMockJsonFile(
  'standingsHistoryMock.json',
  {},
);
const sessionInfoMockData = readMockJsonFile('sessionInfoMock.json', null);
const trackMapMockData = readMockJsonFile('trackMapMock.json', null);

const mockReplays = normalizeReplayMocks(replayMockData);

if (mockReplays.length === 0) {
  mockReplays.push(fallbackReplay);
}

const standingsResponse = toStandingsSuccessResponse(standingsMockData);
const standingsHistoryResponse = toSuccessResponse(
  standingsHistoryMockData,
  {},
);
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

/**
 * The same reduction the live handler performs, over the standings mock.
 *
 * Present so the channel answers in dev mode rather than erroring, not so the
 * map moves: the renderer runs off its own fixtures there and does not enable
 * the fast feed. See the `enabled` argument in `LiveTiming`.
 */
const liveCarPositionsResponse = {
  status: 'success',
  data: extractLiveCarPositions(standingsMockData),
};

/*
  A whole mock weekend, so the segment picker has something to pick.

  Dev mode takes the running session from the renderer's own fixtures, and
  those describe exactly one session — which is precisely the arrangement a
  segment picker cannot be looked at in. These are the two segments that ran
  *before* it, with their own persisted incidents, so selecting one exercises
  the read-only path rather than only the live one.

  Self-contained rather than reusing `liveFixtures.ts`: that file is renderer
  code, and main importing it to serve a mock would put a renderer module in the
  main bundle for the sake of dev mode.
*/
const MOCK_SEGMENT_TRACK = 'Bahrain International Circuit';

/** The key the renderer derives for the mock live session. See `LiveSessionContext`. */
const MOCK_ACTIVE_SEGMENT_KEY = `${MOCK_SEGMENT_TRACK}|RACE`;

const MOCK_WEEKEND_START = Date.parse('2026-08-07T12:00:00Z');
const MOCK_HOUR_MS = 60 * 60 * 1000;

const mockSegmentDrivers = [
  {
    slotId: 0,
    driverName: 'Bradley Drake',
    vehicleName: '#7 Hyper',
    class: 'Hyper',
  },
  {
    slotId: 1,
    driverName: 'Luc Moreau',
    vehicleName: '#51 Hyper',
    class: 'Hyper',
  },
  {
    slotId: 2,
    driverName: 'Elena Vasquez',
    vehicleName: '#22 LMP2',
    class: 'LMP2',
  },
  {
    slotId: 3,
    driverName: 'Sam Okonkwo',
    vehicleName: '#34 LMP2',
    class: 'LMP2',
  },
  {
    slotId: 4,
    driverName: 'Nils Lindqvist',
    vehicleName: '#92 LMGT3',
    class: 'LMGT3',
  },
  {
    slotId: 5,
    driverName: 'Gia Ferrara',
    vehicleName: '#77 LMGT3',
    class: 'LMGT3',
  },
].map((driver, index) => ({
  steamId: `7656119800000000${index + 1}`,
  driverName: driver.driverName,
  vehicleName: driver.vehicleName,
  vehicleClass: driver.class,
  place: index + 1,
  lapsCompleted: 18,
  lastLapTime: 96.4 + index * 0.3,
  bestLapTime: 95.8 + index * 0.25,
  timeBehindLeader: index * 1.4,
  lapsBehindLeader: 0,
  penalties: 0,
  inPits: false,
  control: 0,
  flag: 0,
  pitStops: 0,
  finishStatus: 0,
  slotId: driver.slotId,
}));

interface MockSegmentSpec {
  sessionKey: string;
  session: number;
  sessionType: 'PRACTICE' | 'QUALIFY' | 'RACE';
  startedAt: number;
  lastSeenAt: number;
  incidentCount: number;
  linkState: 'linked' | 'proposed' | 'unlinked';
}

const MOCK_SEGMENT_SPECS: MockSegmentSpec[] = [
  {
    sessionKey: `live|${MOCK_SEGMENT_TRACK}|1|${MOCK_WEEKEND_START}`,
    session: 1,
    sessionType: 'PRACTICE',
    startedAt: MOCK_WEEKEND_START,
    lastSeenAt: MOCK_WEEKEND_START + MOCK_HOUR_MS,
    incidentCount: 6,
    linkState: 'linked',
  },
  {
    sessionKey: `live|${MOCK_SEGMENT_TRACK}|5|${MOCK_WEEKEND_START + MOCK_HOUR_MS * 1.5}`,
    session: 5,
    sessionType: 'QUALIFY',
    startedAt: MOCK_WEEKEND_START + MOCK_HOUR_MS * 1.5,
    lastSeenAt: MOCK_WEEKEND_START + MOCK_HOUR_MS * 1.75,
    incidentCount: 3,
    linkState: 'proposed',
  },
  {
    sessionKey: MOCK_ACTIVE_SEGMENT_KEY,
    session: 10,
    sessionType: 'RACE',
    startedAt: MOCK_WEEKEND_START + MOCK_HOUR_MS * 2.5,
    lastSeenAt: MOCK_WEEKEND_START + MOCK_HOUR_MS * 4,
    incidentCount: 12,
    linkState: 'unlinked',
  },
];

const mockSegmentSummaries = MOCK_SEGMENT_SPECS.map((spec) => ({
  sessionKey: spec.sessionKey,
  trackName: MOCK_SEGMENT_TRACK,
  sessionType: spec.sessionType,
  session: spec.session,
  startedAt: spec.startedAt,
  lastSeenAt: spec.lastSeenAt,
  driverCount: mockSegmentDrivers.length,
  incidentCount: spec.incidentCount,
  evidenceCount: Math.floor(spec.incidentCount / 2),
  linkState: spec.linkState,
}));

/** Persisted-incident records for one mock segment, in the store's own shape. */
const mockSegmentIncidents = (spec: MockSegmentSpec) =>
  Array.from({ length: spec.incidentCount }, (_, index) => {
    const etSeconds = 180 + index * 137.5;
    const first = mockSegmentDrivers[index % mockSegmentDrivers.length];
    const second =
      mockSegmentDrivers[(index * 3 + 1) % mockSegmentDrivers.length];
    const isContact = index % 3 !== 0 && first !== second;

    return {
      id: `${spec.sessionKey}#${String(index + 1).padStart(4, '0')}`,
      sessionKey: spec.sessionKey,
      occurredAt: spec.startedAt + etSeconds * 1000,
      hasContext: isContact,
      incident: {
        id: `live-1-${index + 1}`,
        seq: index + 1,
        etSeconds,
        lap: 1 + Math.floor(index / 2),
        kind: isContact ? 'incident' : 'track-limits',
        objectStruck: isContact ? 'another vehicle' : undefined,
        magnitude: isContact ? 250 + index * 130 : undefined,
        warningPoints: isContact ? undefined : 23.75,
        currentPoints: isContact ? undefined : 23.75 * (1 + index),
        raw: isContact
          ? `${second.driverName}(${second.slotId}) reported contact with ${first.driverName}(${first.slotId})`
          : `${first.driverName} exceeded track limits`,
        parties: isContact
          ? [
              { slotId: first.slotId, displayName: first.driverName },
              { slotId: second.slotId, displayName: second.driverName },
            ]
          : [{ slotId: first.slotId, displayName: first.driverName }],
        anchorErrorSeconds: isContact ? 0.02 * (index % 5) : undefined,
        evidence: isContact
          ? {
              closingSpeedKph: 14 + index * 3,
              aheadSlotId: first.slotId,
              offTrackSlotIds: [],
              isTrafficIncident: first.vehicleClass !== second.vehicleClass,
              trackPositionLabel: `Sector ${1 + (index % 3)} · ${900 + index * 40} m`,
              cars: [
                {
                  slotId: first.slotId,
                  speedKph: 180 + index,
                  offTrack: false,
                },
                {
                  slotId: second.slotId,
                  speedKph: 188 + index,
                  offTrack: false,
                },
              ],
            }
          : undefined,
      },
    };
  });

const mockLiveSessionSegments = (requestData: unknown) => {
  const request = (requestData ?? {}) as {
    sessionKey?: unknown;
    recordFor?: unknown;
  };
  const recordFor = String(request.recordFor ?? '');
  const spec = MOCK_SEGMENT_SPECS.find(
    (candidate) => candidate.sessionKey === recordFor,
  );

  return {
    status: 'success',
    data: {
      anchorSessionKey:
        typeof request.sessionKey === 'string' && request.sessionKey
          ? request.sessionKey
          : MOCK_ACTIVE_SEGMENT_KEY,
      segments: mockSegmentSummaries,
      recordFor: spec ? spec.sessionKey : undefined,
      incidents: spec ? mockSegmentIncidents(spec) : [],
      drivers: spec ? mockSegmentDrivers : [],
    },
  };
};

const MOCK_REPLAY_LOADING_DURATION_MS = 6500;
let mockReplayLoadingStartedAtMs: number | null = null;

/**
 * Whether the mocked game is showing a replay, held so the three replay
 * channels agree with each other.
 *
 * A flat `data: true` would have made `isActive` say one thing while the
 * rewatch and return-to-live channels reported another — and this is a feature
 * whose whole point is that the app stops guessing at game state, so a mock
 * that guesses would be testing the wrong thing.
 *
 * Starts `true` because the replay view's own poll expects it: it navigates
 * back to the dashboard when `isActive` goes true→false, so a mock that opened
 * at `false` would eject a developer from the replay screen on load. The live
 * footer therefore boots dev mode showing its replay strip; pressing **View
 * live** clears it, which is the state pair worth iterating on anyway.
 *
 * Dev mode is not evidence about the game. `POST_CAMERA_ANGLE` returns success
 * unconditionally here, so the camera error path is unreachable under
 * `LMU_DEVMODE=true` — check real behaviour with plain `npm start`.
 */
let mockReplayActive = true;

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

/**
 * Dev mode holds archive state in memory. Without these resolvers the archive
 * channels fall through to the real handlers, which would write archive records
 * for mock replays into the developer's actual store.
 */
const mockArchivedReplays = new Map<
  string,
  { archivedAt: number; note?: string }
>();

const decorateMockReplays = () =>
  mockReplays.map((replay) => {
    const record = mockArchivedReplays.get(replay.hash);

    return {
      ...replay,
      archived: Boolean(record),
      archivedAt: record?.archivedAt,
      archiveNote: record?.note,
    };
  });

const toMockArchiveRequest = (requestData: unknown) => {
  const request = (requestData ?? {}) as { hashes?: unknown; note?: unknown };

  return {
    hashes: Array.isArray(request.hashes) ? request.hashes.map(String) : [],
    note: String(request.note ?? '').trim(),
  };
};

export const mockApiData: Partial<Record<ApiChannel, MockApiResolver>> = {
  [CONSTANTS.API.GET_API_STATUS]: () => ({
    status: 'success',
    data: {
      loadingStatus: getMockLoadingStatus(),
    },
  }),
  [CONSTANTS.API.GET_LIVE_SESSION_STATUS]: () => ({
    status: 'success',
    data: {
      state: 'live',
      trackName: 'Bahrain International Circuit',
      sessionType: 'RACE',
      driverCount: 7,
    },
  }),
  // Devmode keeps the renderer on its own fixtures, so this only needs to
  // report a live session — the view supplies the field and incidents.
  [CONSTANTS.API.GET_LIVE_SESSION_DATA]: () => ({
    status: 'success',
    data: {
      status: {
        state: 'live',
        trackName: 'Bahrain International Circuit',
        sessionType: 'RACE',
        driverCount: 7,
      },
      drivers: [],
      incidents: [],
      useRendererFixtures: true,
    },
  }),
  [CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS]: mockLiveSessionSegments,
  [CONSTANTS.API.GET_REPLAYS]: () => ({
    status: 'success',
    data: decorateMockReplays(),
  }),
  [CONSTANTS.API.POST_ARCHIVE_REPLAYS]: (requestData: unknown) => {
    const { hashes, note } = toMockArchiveRequest(requestData);

    hashes.forEach((hash) => {
      mockArchivedReplays.set(hash, {
        archivedAt: Date.now(),
        ...(note ? { note } : {}),
      });
    });

    return {
      status: 'success',
      data: decorateMockReplays(),
    };
  },
  [CONSTANTS.API.POST_RESTORE_REPLAYS]: (requestData: unknown) => {
    const { hashes } = toMockArchiveRequest(requestData);

    hashes.forEach((hash) => {
      mockArchivedReplays.delete(hash);
    });

    return {
      status: 'success',
      data: decorateMockReplays(),
    };
  },
  [CONSTANTS.API.POST_ARCHIVE_NOTE]: (requestData: unknown) => {
    const { hashes, note } = toMockArchiveRequest(requestData);

    hashes.forEach((hash) => {
      const record = mockArchivedReplays.get(hash);

      if (!record) {
        return;
      }

      if (note) {
        mockArchivedReplays.set(hash, { ...record, note });
        return;
      }

      const { note: _removedNote, ...withoutNote } = record;
      mockArchivedReplays.set(hash, withoutNote);
    });

    return {
      status: 'success',
      data: decorateMockReplays(),
    };
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
  // Same geometry, separate channel — the live map and the replay view hold
  // their own copies so neither can overwrite the other's.
  [CONSTANTS.API.GET_LIVE_TRACK_MAP]: trackMapResponse,
  [CONSTANTS.API.GET_TRACK_THUMBNAIL]: {
    image: null,
  },
  [CONSTANTS.API.GET_STANDINGS]: standingsResponse,
  [CONSTANTS.API.GET_LIVE_CAR_POSITIONS]: liveCarPositionsResponse,
  [CONSTANTS.API.GET_STANDINGS_HISTORY]: standingsHistoryResponse,
  [CONSTANTS.API.GET_SESSION_INFO]: sessionInfoResponse,
  [CONSTANTS.API.GET_IS_REPLAY_ACTIVE]: () => ({
    status: 'success',
    data: mockReplayActive,
  }),
  [CONSTANTS.API.POST_REPLAY_REWATCH]: (requestData: unknown) => {
    mockReplayActive = true;
    const etSeconds = Number(
      (requestData as { etSeconds?: number })?.etSeconds,
    );

    return {
      status: 'success',
      data: {
        isReplayActive: true,
        seekToSeconds: Number.isFinite(etSeconds)
          ? Math.max(etSeconds - 5, 0)
          : 0,
      },
    };
  },
  [CONSTANTS.API.POST_REPLAY_RETURN_TO_LIVE]: () => {
    mockReplayActive = false;

    return { status: 'success', data: { isReplayActive: false } };
  },
  /*
    A bare number, which is what the endpoint actually answers — verified live
    on 2026-08-08 against a running session, where `/rest/watch/focus` returned
    `30` and not an object. This mock previously carried `{slotID: 0}` and no
    renderer code had ever read it, so nothing noticed. The reader accepts both
    shapes rather than trusting either, because the response body is not in
    LMU's Swagger spec.
  */
  [CONSTANTS.API.GET_FOCUSED_CAR]: {
    status: 'success',
    data: 0,
  },
  /*
    The auto-director entry, not a numbered group — `TracksideCycle` is where
    LMU's trackside group actually starts, and the case a naive lowercase
    compare against `CameraMode` gets wrong. Dev mode serves it deliberately so
    the mapping is exercised rather than papered over.
  */
  [CONSTANTS.API.GET_CAMERA_INFO]: {
    status: 'success',
    data: {
      cameraName: 'TRACKING021',
      currentCameraGroup: 'TracksideCycle',
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
  [CONSTANTS.API.POST_REPLAY_COMMAND_UI]: {
    status: 'success',
  },
  [CONSTANTS.API.POST_CAMERA_ANGLE]: {
    status: 'success',
  },
  [CONSTANTS.API.POST_CLOSE_LMU]: {
    status: 'success',
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

/**
 * Channels backed by the local settings store rather than the LMU API. Dev mode
 * stands in for the game, not for the user's own configuration, so these are
 * served by the real handlers and persist across restarts as usual.
 */
const PASSTHROUGH_CHANNELS: ReadonlySet<ApiChannel> = new Set([
  CONSTANTS.API.GET_USER_SETTINGS,
  CONSTANTS.API.POST_USER_SETTINGS,
  CONSTANTS.API.POST_DASHBOARD_VIEW,
  CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE,
]);

export const isMockPassthroughChannel = (channel: ApiChannel): boolean =>
  PASSTHROUGH_CHANNELS.has(channel);

export const replyWithMockData = async (
  event: Electron.IpcMainEvent,
  channel: ApiChannel,
  requestData: unknown,
): Promise<boolean> => {
  if (isMockPassthroughChannel(channel)) {
    return false;
  }

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
