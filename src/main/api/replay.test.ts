/*
 * These declarations must stay above the imports. `jest.mock` is hoisted to the
 * top of the file, and importing `./replay` evaluates that module, which reads
 * the store at import time via enforceReplayCacheSchemaVersion(). If the
 * imports run first, the mock factory below hits `replayStoreData` while it is
 * still in its temporal dead zone.
 */
/* eslint-disable import/first */
const replayStoreSetMock = jest.fn();
const replayStoreData: Record<string, unknown> = { replays: {} };

import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { readdir, readFile } from 'fs/promises';
import { parseStringPromise } from 'xml2js';
import { LMUReplay } from '@types';
import { CONSTANTS } from '@constants';
import { generateReplayHash } from '../util';
import {
  applyArchiveState,
  filterReplaysByGameType,
  findBestLogFile,
  getLogDataSessionType,
  getReplayLogData,
  parseLogXml,
  postArchiveNote,
  postArchiveReplays,
  postRestoreReplays,
  postWatchReplay,
  syncReplayData,
} from './replay';
/* eslint-enable import/first */

jest.mock('../storage/local-data-store', () => ({
  // The sync seeds the career identity from the cached profile before it builds
  // the shared log index.
  readProfileCache: () => ({ profileInfo: { name: 'Bradley Drake' } }),
  getMainPersistentStore: () => ({
    get(key: string) {
      return replayStoreData[key];
    },
    set(key: string, value: unknown) {
      replayStoreSetMock(key, value);
      replayStoreData[key] = value;
    },
    clear() {
      Object.keys(replayStoreData).forEach((key) => {
        delete replayStoreData[key];
      });
      replayStoreData.replays = {};
    },
  }),
}));

jest.mock('fs', () => ({
  createReadStream: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
  readFile: jest.fn(),
  // Only refines a tiebreak; rejecting here exercises the fallback ordering.
  stat: jest.fn().mockRejectedValue(new Error('stat unavailable')),
}));

jest.mock('xml2js', () => ({
  parseStringPromise: jest.fn(),
}));

describe('main/replay helpers', () => {
  const readdirMock = readdir as jest.MockedFunction<typeof readdir>;
  const readFileMock = readFile as jest.MockedFunction<typeof readFile>;
  const createReadStreamMock = createReadStream as jest.MockedFunction<
    typeof createReadStream
  >;
  const parseStringPromiseMock = parseStringPromise as jest.MockedFunction<
    typeof parseStringPromise
  >;

  it('matches known track aliases for new tracks (Paul Ricard layouts, Barcelona ELMS, Silverstone International)', async () => {
    // Paul Ricard 1A
    readdirMock.mockResolvedValue(['paulricard.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Paul Ricard Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          DateTime: 1000,
          TrackVenue: 'Paul Ricard Circuit',
          Race: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);
    let replay = {
      replayName: 'Paul Ricard - 1A R1 1',
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'PAULRICARD1A',
      },
    } as unknown as LMUReplay;
    let result = await findBestLogFile('C:/logs', replay);
    expect(result?.logDataFileName).toBe('paulricard.xml');

    // Paul Ricard 1A-V2
    readdirMock.mockResolvedValue(['paulricard_v2.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Paul Ricard Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          DateTime: 1000,
          TrackVenue: 'Paul Ricard Circuit',
          Race: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);
    replay = {
      replayName: 'Paul Ricard - 1A-V2 R1 1',
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'PAULRICARD1A-V2',
      },
    } as unknown as LMUReplay;
    result = await findBestLogFile('C:/logs', replay);
    expect(result?.logDataFileName).toBe('paulricard_v2.xml');

    // Paul Ricard 1A-V2-Short
    readdirMock.mockResolvedValue([
      'paulricard_v2_short.xml',
    ] as unknown as Awaited<ReturnType<typeof readdir>>);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Paul Ricard Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          DateTime: 1000,
          TrackVenue: 'Paul Ricard Circuit',
          Race: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);
    replay = {
      replayName: 'Paul Ricard - 1A-V2-Short R1 1',
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'PAULRICARD1A-V2-SHORT',
      },
    } as unknown as LMUReplay;
    result = await findBestLogFile('C:/logs', replay);
    expect(result?.logDataFileName).toBe('paulricard_v2_short.xml');

    // Paul Ricard 3A
    readdirMock.mockResolvedValue(['paulricard_3a.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Paul Ricard Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          DateTime: 1000,
          TrackVenue: 'Paul Ricard Circuit',
          Race: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);
    replay = {
      replayName: 'Paul Ricard - 3A R1 1',
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'PAULRICARD3A',
      },
    } as unknown as LMUReplay;
    result = await findBestLogFile('C:/logs', replay);
    expect(result?.logDataFileName).toBe('paulricard_3a.xml');

    // Barcelona ELMS
    readdirMock.mockResolvedValue(['barcelona.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Circuit de Barcelona</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          DateTime: 1000,
          TrackVenue: 'Circuit de Barcelona',
          Race: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);
    replay = {
      replayName: 'Barcelona ELMS R1 1',
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'BARCELONAELMS',
      },
    } as unknown as LMUReplay;
    result = await findBestLogFile('C:/logs', replay);
    expect(result?.logDataFileName).toBe('barcelona.xml');

    // Silverstone International
    readdirMock.mockResolvedValue(['silverstone_int.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Silverstone Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          DateTime: 1000,
          TrackVenue: 'Silverstone Circuit',
          Race: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);
    replay = {
      replayName: 'Silverstone International R1 1',
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'SILVERSTONE_INTERNATIONAL',
      },
    } as unknown as LMUReplay;
    result = await findBestLogFile('C:/logs', replay);
    expect(result?.logDataFileName).toBe('silverstone_int.xml');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(replayStoreData).forEach((key) => {
      delete replayStoreData[key];
    });
    replayStoreData.replays = {};
    createReadStreamMock.mockImplementation(() => {
      throw new Error('stream unavailable');
    });
  });

  it('parseLogXml reads file and parses XML summary data', async () => {
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><Setting>Multiplayer</Setting><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );

    const result = await parseLogXml('C:/logs/file.xml');

    expect(readFileMock).toHaveBeenCalledWith('C:/logs/file.xml', 'utf-8');
    expect(result).toEqual({
      rFactorXML: {
        RaceResults: {
          Setting: 'Multiplayer',
          DateTime: 1000,
          TrackVenue: 'Sebring',
          Race: {},
        },
      },
    });
  });

  /*
   * The track-limits element is <TrackLimits>, plural — this fixture used to say
   * <TrackLimit>, matching a parser that compared the lowercased tag against
   * 'tracklimit' and therefore never counted a real one. The count reached the
   * dashboard as zero for every replay whose full log was not loaded.
   */
  it('parseLogXml reads streamed XML and parses session summary counts', async () => {
    const xmlChunks = [
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race><Minutes>60</Minutes><CarClass>LMP2</CarClass><CarClass>GTE</CarClass><Driver></Driver><Driver></Driver><Stream><Incident></Incident><Penalty></Penalty><TrackLimits></TrackLimits></Stream></Race></RaceResults></rFactorXML>',
    ];
    const stream = Readable.from(xmlChunks, { objectMode: false });
    createReadStreamMock.mockReturnValueOnce(
      stream as unknown as ReturnType<typeof createReadStream>,
    );
    readFileMock.mockRejectedValue(new Error('readFile should not be called'));

    const result = await parseLogXml('C:/logs/file.xml');

    expect(createReadStreamMock).toHaveBeenCalledWith('C:/logs/file.xml', {
      encoding: 'utf-8',
    });
    expect(readFileMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      rFactorXML: {
        RaceResults: {
          DateTime: 1000,
          TrackVenue: 'Sebring',
          Race: {
            Minutes: 60,
            DriverCount: 2,
            CarClasses: ['LMP2', 'GTE'],
            IncidentCount: 1,
            PenaltyCount: 1,
            TrackLimitCount: 1,
            Stream: {
              IncidentCount: 1,
              PenaltyCount: 1,
              TrackLimitCount: 1,
            },
          },
          IncidentCount: 1,
          PenaltyCount: 1,
          TrackLimitCount: 1,
          DriverCount: 2,
        },
      },
    });
  });

  /**
   * The root <DateTime> is when LMU created the event, and it is what the replay
   * API reports as a replay's timestamp. Each session carries its own <DateTime>
   * at the same nesting depth this parser tracks, so a regression here silently
   * shifts every log forward and mismatches replays recorded on the same evening.
   */
  it('keeps the root DateTime when a session carries its own (string parser)', async () => {
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1784398360</DateTime><TrackVenue>Monza</TrackVenue><Race><DateTime>1784400388</DateTime><Minutes>20</Minutes></Race></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );

    const result = await parseLogXml('C:/logs/file.xml');

    expect(result.rFactorXML?.RaceResults?.DateTime).toBe(1784398360);
    expect(result.rFactorXML?.RaceResults?.Race?.Minutes).toBe(20);
  });

  it('keeps the root DateTime when a session carries its own (stream parser)', async () => {
    const stream = Readable.from(
      [
        '<rFactorXML><RaceResults><DateTime>1784398360</DateTime><TrackVenue>Monza</TrackVenue>',
        '<Race><DateTime>1784400388</DateTime><Minutes>20</Minutes></Race></RaceResults></rFactorXML>',
      ],
      { objectMode: false },
    );
    createReadStreamMock.mockReturnValueOnce(
      stream as unknown as ReturnType<typeof createReadStream>,
    );
    readFileMock.mockRejectedValue(new Error('readFile should not be called'));

    const result = await parseLogXml('C:/logs/file.xml');

    expect(readFileMock).not.toHaveBeenCalled();
    expect(result.rFactorXML?.RaceResults?.DateTime).toBe(1784398360);
    expect(result.rFactorXML?.RaceResults?.Race?.Minutes).toBe(20);
  });

  it('detects log session type from RaceResults keys', () => {
    expect(
      getLogDataSessionType({ rFactorXML: { RaceResults: { Race: {} } } }),
    ).toBe('RACE');
    expect(
      getLogDataSessionType({ rFactorXML: { RaceResults: { Qualify: {} } } }),
    ).toBe('QUALIFY');
    expect(
      getLogDataSessionType({ rFactorXML: { RaceResults: { Practice1: {} } } }),
    ).toBe('PRACTICE');
    expect(
      getLogDataSessionType({ rFactorXML: { RaceResults: {} } }),
    ).toBeNull();
  });

  it('finds best matching log file based on timestamp/session/track', async () => {
    readdirMock.mockResolvedValue([
      'old.xml',
      'match.xml',
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    readFileMock.mockImplementation(async (filePath) => {
      if (String(filePath).includes('old.xml')) {
        return '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Qualify /></RaceResults></rFactorXML>' as unknown as Awaited<
          ReturnType<typeof readFile>
        >;
      }
      return '<rFactorXML><RaceResults><DateTime>995</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >;
    });

    const replay = {
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'SEBRINGWEC',
      },
    } as unknown as LMUReplay;

    const result = await findBestLogFile('C:/logs', replay);

    expect(result).toEqual(
      expect.objectContaining({
        logDataFileName: 'match.xml',
      }),
    );
    expect(result?.logData?.rFactorXML?.RaceResults?.Race).toEqual({});
  });

  it('does not stop at first eligible file and picks the closest diff', async () => {
    readdirMock.mockResolvedValue([
      'first.xml',
      'second.xml',
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    readFileMock.mockImplementation(async (filePath) => {
      if (String(filePath).includes('first.xml')) {
        return '<rFactorXML><RaceResults><DateTime>930</DateTime><TrackVenue>Sebring International Raceway</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
          ReturnType<typeof readFile>
        >;
      }

      return '<rFactorXML><RaceResults><DateTime>995</DateTime><TrackVenue>Sebring International Raceway</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >;
    });

    const replay = {
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'SEBRINGWEC',
      },
    } as unknown as LMUReplay;

    const result = await findBestLogFile('C:/logs', replay);

    expect(result?.logDataFileName).toBe('second.xml');
  });

  it('matches known track aliases from replay name and scene metadata', async () => {
    readdirMock.mockResolvedValue(['candidate.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Bahrain International Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );

    const replay = {
      replayName: 'Bahrain Outer Circuit R1 2',
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'BAHRAINWEC_OUTER',
      },
    } as unknown as LMUReplay;

    const result = await findBestLogFile('C:/logs', replay);

    expect(result?.logDataFileName).toBe('candidate.xml');
  });

  it('returns null file metadata when no logs match', async () => {
    readdirMock.mockResolvedValue(['x.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>5000</DateTime><TrackVenue>Different Track</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );

    const replay = {
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'SEBRINGWEC',
      },
    } as unknown as LMUReplay;

    const result = await findBestLogFile('C:/logs', replay);

    expect(result).toEqual({
      logDataFileName: 'x.xml',
      logData: expect.objectContaining({
        rFactorXML: expect.objectContaining({
          RaceResults: expect.objectContaining({
            DateTime: 5000,
            TrackVenue: 'Different Track',
            Race: {},
          }),
        }),
      }),
    });
  });

  it('matches when timestamp diff is within configured millisecond threshold', async () => {
    readdirMock.mockResolvedValue(['candidate.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1100</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );

    const replay = {
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'SEBRINGWEC',
      },
    } as unknown as LMUReplay;

    const result = await findBestLogFile('C:/logs', replay);

    expect(result?.logDataFileName).toBe('candidate.xml');
  });

  it('does not match when timestamp diff exceeds configured millisecond threshold', async () => {
    readdirMock.mockResolvedValue(['candidate.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1100</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );

    const replay = {
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'SEBRINGWEC',
      },
    } as unknown as LMUReplay;

    const result = await findBestLogFile('C:/logs', replay);

    expect(result).toEqual({
      logDataFileName: 'candidate.xml',
      logData: expect.objectContaining({
        rFactorXML: expect.objectContaining({
          RaceResults: expect.objectContaining({
            DateTime: 1100,
            TrackVenue: 'Sebring',
            Race: {},
          }),
        }),
      }),
    });
  });

  it('skips malformed log files instead of aborting replay sync', async () => {
    readdirMock.mockResolvedValue(['bad.xml', 'good.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);

    readFileMock.mockImplementation(async (filePath) => {
      if (String(filePath).includes('bad.xml')) {
        return '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults' as unknown as Awaited<
          ReturnType<typeof readFile>
        >;
      }

      return '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >;
    });

    const replay = {
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'SEBRINGWEC',
      },
    } as unknown as LMUReplay;

    const result = await findBestLogFile('C:/logs', replay);

    expect(result?.logDataFileName).toBe('good.xml');
    expect(result?.logData?.rFactorXML?.RaceResults?.Race).toEqual({});
  });

  it('loads full replay log data when explicitly requested', async () => {
    readdirMock.mockResolvedValue(['full.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          DateTime: 1000,
          TrackVenue: 'Sebring',
          Race: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);

    const replay = {
      replayDirectory: 'C:/replays/Replay',
      timestamp: 1000,
      metadata: {
        session: 'RACE',
        sceneDesc: 'SEBRINGWEC',
      },
    } as unknown as LMUReplay;

    const result = await getReplayLogData(replay, { fullData: true });

    expect(result?.logDataFileName).toBe('full.xml');
    expect(result?.logData).toEqual({
      DateTime: 1000,
      TrackVenue: 'Sebring',
      Race: {},
    });
  });

  it('filters stored replays by game type in the backend helper', () => {
    const filteredMultiplayerReplays = filterReplaysByGameType(
      [
        { replayName: 'mp', multiplayer: true },
        { replayName: 'rw', multiplayer: false },
        { replayName: 'default-rw' },
      ],
      'multiplayer',
    );

    const filteredRaceWeekendReplays = filterReplaysByGameType(
      [
        { replayName: 'mp', multiplayer: true },
        { replayName: 'rw', multiplayer: false },
        { replayName: 'default-rw' },
      ],
      'race-weekend',
    );

    expect(filteredMultiplayerReplays).toEqual([
      expect.objectContaining({ replayName: 'mp' }),
    ]);
    expect(filteredRaceWeekendReplays).toEqual([
      expect.objectContaining({ replayName: 'rw' }),
      expect.objectContaining({ replayName: 'default-rw' }),
    ]);
  });

  it('returns full parsed log data to the renderer without persisting it again', async () => {
    const replyMock = jest.fn();
    const event = { reply: replyMock } as unknown as Electron.IpcMainEvent;
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/rest/watch/replays')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 0,
              metadata: { session: 'RACE', sceneDesc: 'SEBRINGWEC' },
              replayDirectory: 'C:/replays',
              replayName: 'Sebring International Raceway R1 1',
              size: 123,
              timestamp: 1000,
            },
          ],
        };
      }

      return { ok: true, status: 200 };
    });
    global.fetch = fetchMock as typeof global.fetch;

    readdirMock.mockResolvedValue(['watch.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><Setting>Multiplayer</Setting><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><GameVersion>1.0</GameVersion><Race><Minutes>90</Minutes></Race></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          Setting: 'Multiplayer',
          DateTime: 1000,
          TrackVenue: 'Sebring',
          GameVersion: '1.0',
          Race: {
            Minutes: 90,
            Driver: [],
            Stream: {},
          },
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);

    const replay = {
      id: 0,
      metadata: { session: 'RACE', sceneDesc: 'SEBRINGWEC' },
      replayDirectory: 'C:/replays',
      replayName: 'Sebring International Raceway R1 1',
      size: 123,
      timestamp: 1000,
    } as unknown as LMUReplay;
    const replayHash = generateReplayHash(replay);

    await postWatchReplay(event, replayHash);

    expect(replyMock).toHaveBeenCalledWith(CONSTANTS.API.POST_WATCH_REPLAY, {
      status: 'success',
      data: expect.objectContaining({
        multiplayer: true,
        logData: expect.objectContaining({
          GameVersion: '1.0',
          Race: expect.objectContaining({ Minutes: 90 }),
        }),
        logDataLoaded: true,
      }),
    });

    /*
      Scoped to the cache rather than counting every write. What this test is
      about is the replay not being persisted a second time, and watching one
      also records which replay is now loaded — a different key, and not the
      thing being guarded against here.
    */
    const cacheWrites = replayStoreSetMock.mock.calls.filter(
      ([key]) => key === 'replays',
    );
    expect(cacheWrites).toHaveLength(1);

    /*
      And the separate record of which replay is now loaded.

      LMU cannot be asked this — `isActive` answers only true or false, and
      `/rest/watch/replays` marks none of them current — so this is the app's
      only answer to "which", and the return banner cannot survive a restart
      without it.
    */
    const [, activeRecord] =
      replayStoreSetMock.mock.calls.find(([key]) => key === 'activeReplay') ??
      [];

    expect(activeRecord).toMatchObject({
      hash: replayHash,
      sceneDesc: 'SEBRINGWEC',
      sessionType: 'RACE',
      replayName: 'Sebring International Raceway R1 1',
    });
  });

  /**
   * An imported replay was paired with its log when it was imported. Sending it
   * back through findBestLogFile against the whole results directory is exactly
   * the mismatch importing exists to avoid — the correct log is already known.
   */
  it('serves an imported replay from its recorded log, without re-matching', async () => {
    const replyMock = jest.fn();
    const event = { reply: replyMock } as unknown as Electron.IpcMainEvent;
    const replay = {
      id: 0,
      metadata: { session: 'RACE', sceneDesc: 'MONZAWEC' },
      replayDirectory: 'C:/replays',
      replayName: 'Autodromo Nazionale Monza R1 2',
      size: 456,
      timestamp: 1784398360,
    } as unknown as LMUReplay;
    const replayHash = generateReplayHash(replay);

    replayStoreData.importedReplays = {
      [replayHash]: {
        hash: replayHash,
        replayName: 'Autodromo Nazionale Monza R1 2',
        sceneDesc: 'MONZAWEC',
        session: 'RACE',
        timestamp: 1784398360,
        vcrFileName: 'Autodromo Nazionale Monza R1 2.Vcr',
        vcrPath: 'C:/replays/Autodromo Nazionale Monza R1 2.Vcr',
        logFileName: 'event-two-race.xml',
        logPath: 'C:/logs/event-two-race.xml',
        vcrFingerprint: 'aaa',
        logFingerprint: 'bbb',
        importedAt: 1,
        logData: null,
        origin: {
          trackFolder: 'Monza_2023',
          trackVersion: '1.27',
          trackContentHash: 'abc',
          installPath: 'E:/LMU',
        },
        match: { method: 'roster', confidence: 0.84, rosterOverlap: null },
      },
    };

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/rest/watch/replays')) {
        return { ok: true, status: 200, json: async () => [replay] };
      }
      return { ok: true, status: 200 };
    }) as typeof global.fetch;

    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          Setting: 'Multiplayer',
          DateTime: 1784398360,
          Race: { Minutes: 20 },
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);

    await postWatchReplay(event, replayHash);

    expect(readFileMock).toHaveBeenCalledWith(
      'C:/logs/event-two-race.xml',
      'utf-8',
    );
    // The whole point: the results directory is never scanned.
    expect(readdirMock).not.toHaveBeenCalled();

    expect(replyMock).toHaveBeenCalledWith(CONSTANTS.API.POST_WATCH_REPLAY, {
      status: 'success',
      data: expect.objectContaining({
        imported: true,
        timestamp: 1784398360,
        logDataFileName: 'event-two-race.xml',
        logDataLoaded: true,
        multiplayer: true,
      }),
    });

    delete replayStoreData.importedReplays;
  });

  /**
   * An imported .Vcr sits in the replay folder, so the game lists it like any
   * other. Without the exclusion it would be cached here as well and appear in
   * both the active and the imported view — and, since the flag does not gate
   * this, turning experimental features off must not change that.
   */
  it('does not cache a replay that was imported', async () => {
    /*
     * syncReplayData yields between replays via setImmediate, which jsdom does
     * not provide. Nothing here depends on macrotask ordering, so a minimal
     * stand-in is enough to exercise the loop.
     */
    const globalWithImmediate = globalThis as unknown as Record<
      string,
      unknown
    >;
    const originalSetImmediate = globalWithImmediate.setImmediate;
    globalWithImmediate.setImmediate = (callback: () => void) =>
      setTimeout(callback, 0);

    const importedReplay = {
      id: 0,
      metadata: { session: 'RACE', sceneDesc: 'MONZAWEC' },
      replayDirectory: 'C:/replays/',
      replayName: 'Autodromo Nazionale Monza R1 2',
      size: 456,
      timestamp: 1784398360,
    };
    const ownReplay = {
      id: 1,
      metadata: { session: 'RACE', sceneDesc: 'SEBRINGWEC' },
      replayDirectory: 'C:/replays/',
      replayName: 'Sebring International Raceway R1 1',
      size: 123,
      timestamp: 1000,
    };

    replayStoreData.replays = {};
    replayStoreData.importedReplays = {
      'imported-hash': {
        hash: 'imported-hash',
        vcrPath: 'C:\\replays\\Autodromo Nazionale Monza R1 2.Vcr',
        logPath: 'C:/logs/event-two-race.xml',
        logFileName: 'event-two-race.xml',
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [importedReplay, ownReplay],
    }) as typeof global.fetch;

    readdirMock.mockResolvedValue(['own.xml'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );

    await syncReplayData();

    const cached = Object.values(
      replayStoreData.replays as Record<string, LMUReplay>,
    );

    expect(cached.map((entry) => entry.replayName)).toEqual([
      'Sebring International Raceway R1 1',
    ]);

    globalWithImmediate.setImmediate = originalSetImmediate;
    delete replayStoreData.importedReplays;
    replayStoreData.replays = {};
  });

  /**
   * Log matching used to rebuild the results directory for every replay, so a
   * sync of N replays read and parsed every log N times. That was tolerable
   * while a log was ~80 KB. LMU now records 24-hour races, where a single
   * result log runs to tens of megabytes, and the same sync would read on the
   * order of a terabyte.
   *
   * Asserted on readdir rather than on parse counts because it is the cheapest
   * honest proxy: one listing per sync means one pass over the directory.
   */
  it('summarises the results directory once per sync, not once per replay', async () => {
    const globalWithImmediate = globalThis as unknown as Record<
      string,
      unknown
    >;
    const originalSetImmediate = globalWithImmediate.setImmediate;
    globalWithImmediate.setImmediate = (callback: () => void) =>
      setTimeout(callback, 0);

    const replays = Array.from({ length: 5 }, (_unused, index) => ({
      id: index,
      metadata: { session: 'RACE', sceneDesc: 'SEBRINGWEC' },
      replayDirectory: 'C:/replays/',
      replayName: `Sebring International Raceway R1 ${index + 1}`,
      size: 123,
      timestamp: 1000 + index,
    }));

    replayStoreData.replays = {};
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => replays,
    }) as typeof global.fetch;

    readdirMock.mockClear();
    readdirMock.mockResolvedValue([
      'race.xml',
      'quali.xml',
    ] as unknown as Awaited<ReturnType<typeof readdir>>);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<
        ReturnType<typeof readFile>
      >,
    );

    await syncReplayData();

    expect(
      Object.keys(replayStoreData.replays as Record<string, LMUReplay>),
    ).toHaveLength(5);
    expect(readdirMock).toHaveBeenCalledTimes(1);

    globalWithImmediate.setImmediate = originalSetImmediate;
    replayStoreData.replays = {};
  });
});

describe('main/replay archive', () => {
  const buildReplay = (overrides: Partial<LMUReplay> = {}) =>
    ({
      metadata: { session: 'RACE', sceneDesc: 'SEBRINGWEC' },
      replayDirectory: 'C:/replays',
      replayName: 'Sebring International Raceway R1 1',
      size: 123,
      timestamp: 1000,
      ...overrides,
    }) as unknown as LMUReplay;

  /** Mirrors buildReplayCacheIdentityKey, which is internal to the module. */
  const identityKeyFor = (replay: LMUReplay) =>
    [
      replay.metadata.sceneDesc,
      replay.metadata.session,
      replay.replayName,
      String(replay.timestamp),
      replay.replayDirectory,
    ]
      .map((value) => String(value).trim().toLowerCase())
      .join('|');

  const createEvent = () => {
    const replyMock = jest.fn();
    return {
      replyMock,
      event: { reply: replyMock } as unknown as Electron.IpcMainEvent,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(replayStoreData).forEach((key) => {
      delete replayStoreData[key];
    });
    replayStoreData.replays = {};
    global.fetch = jest.fn() as unknown as typeof global.fetch;
  });

  it('decorates replays with archive state matched by hash', () => {
    const replay = buildReplay();
    const hash = generateReplayHash(replay);

    const [decorated] = applyArchiveState([{ ...replay, hash }], {
      [hash]: {
        hash,
        identityKey: identityKeyFor(replay),
        archivedAt: 42,
        note: 'reviewed',
      },
    });

    expect(decorated).toEqual(
      expect.objectContaining({
        archived: true,
        archivedAt: 42,
        archiveNote: 'reviewed',
      }),
    );
  });

  it('keeps a replay archived when its hash has changed but its identity has not', () => {
    const replay = buildReplay();

    const [decorated] = applyArchiveState(
      [{ ...replay, hash: 'current-hash' }],
      {
        'stale-hash': {
          hash: 'stale-hash',
          identityKey: identityKeyFor(replay),
          archivedAt: 42,
        },
      },
    );

    expect(decorated.archived).toBe(true);
  });

  it('reports replays with no archive record as not archived', () => {
    const replay = buildReplay();

    const [decorated] = applyArchiveState([{ ...replay, hash: 'hash' }], {});

    expect(decorated.archived).toBe(false);
    expect(decorated.archiveNote).toBeUndefined();
  });

  it('archives replays with a shared note and without contacting the game', async () => {
    const replay = buildReplay();
    const hash = generateReplayHash(replay);
    const secondReplay = buildReplay({ replayName: 'Sebring Q1 1' });
    const secondHash = generateReplayHash(secondReplay);
    replayStoreData.replays = {
      [hash]: { ...replay, hash },
      [secondHash]: { ...secondReplay, hash: secondHash },
    };

    const { event, replyMock } = createEvent();
    await postArchiveReplays(event, {
      hashes: [hash, secondHash],
      note: 'reviewed',
    });

    const archived = replayStoreData.archivedReplays as Record<string, unknown>;
    expect(Object.keys(archived)).toEqual([hash, secondHash]);
    expect(archived[hash]).toEqual(
      expect.objectContaining({
        hash,
        identityKey: identityKeyFor(replay),
        note: 'reviewed',
      }),
    );
    expect(archived[secondHash]).toEqual(
      expect.objectContaining({ note: 'reviewed' }),
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(replyMock).toHaveBeenCalledWith(CONSTANTS.API.POST_ARCHIVE_REPLAYS, {
      status: 'success',
      data: [
        expect.objectContaining({ hash, archived: true }),
        expect.objectContaining({ hash: secondHash, archived: true }),
      ],
    });
  });

  it('omits the note when none was provided', async () => {
    const replay = buildReplay();
    const hash = generateReplayHash(replay);
    replayStoreData.replays = { [hash]: { ...replay, hash } };

    const { event } = createEvent();
    await postArchiveReplays(event, { hashes: [hash] });

    const archived = replayStoreData.archivedReplays as Record<
      string,
      Record<string, unknown>
    >;
    expect(archived[hash]).not.toHaveProperty('note');
  });

  it('replies with an error when no replays were provided', async () => {
    const { event, replyMock } = createEvent();
    await postArchiveReplays(event, { hashes: [] });

    expect(replyMock).toHaveBeenCalledWith(CONSTANTS.API.POST_ARCHIVE_REPLAYS, {
      status: 'error',
      message: 'No replays were provided to archive',
    });
    expect(replayStoreData.archivedReplays).toBeUndefined();
  });

  it('restores a replay archived under an older hash', async () => {
    const replay = buildReplay();
    const hash = generateReplayHash(replay);
    replayStoreData.replays = { [hash]: { ...replay, hash } };
    replayStoreData.archivedReplays = {
      'stale-hash': {
        hash: 'stale-hash',
        identityKey: identityKeyFor(replay),
        archivedAt: 42,
      },
    };

    const { event, replyMock } = createEvent();
    await postRestoreReplays(event, { hashes: [hash] });

    expect(replayStoreData.archivedReplays).toEqual({});
    expect(global.fetch).not.toHaveBeenCalled();
    expect(replyMock).toHaveBeenCalledWith(CONSTANTS.API.POST_RESTORE_REPLAYS, {
      status: 'success',
      data: [expect.objectContaining({ hash, archived: false })],
    });
  });

  it('sets and clears notes on already-archived replays', async () => {
    const replay = buildReplay();
    const hash = generateReplayHash(replay);
    replayStoreData.replays = { [hash]: { ...replay, hash } };
    replayStoreData.archivedReplays = {
      [hash]: {
        hash,
        identityKey: identityKeyFor(replay),
        archivedAt: 42,
        note: 'first pass',
      },
    };

    const { event } = createEvent();
    await postArchiveNote(event, { hashes: [hash], note: 'second pass' });

    let archived = replayStoreData.archivedReplays as Record<
      string,
      Record<string, unknown>
    >;
    expect(archived[hash].note).toBe('second pass');

    await postArchiveNote(event, { hashes: [hash], note: '   ' });

    archived = replayStoreData.archivedReplays as Record<
      string,
      Record<string, unknown>
    >;
    expect(archived[hash]).not.toHaveProperty('note');
    expect(archived[hash].archivedAt).toBe(42);
  });

  it('ignores note changes for replays that are not archived', async () => {
    const replay = buildReplay();
    const hash = generateReplayHash(replay);
    replayStoreData.replays = { [hash]: { ...replay, hash } };
    replayStoreData.archivedReplays = {};

    const { event, replyMock } = createEvent();
    await postArchiveNote(event, { hashes: [hash], note: 'reviewed' });

    expect(replayStoreData.archivedReplays).toEqual({});
    expect(replyMock).toHaveBeenCalledWith(
      CONSTANTS.API.POST_ARCHIVE_NOTE,
      expect.objectContaining({ status: 'success' }),
    );
  });
});
