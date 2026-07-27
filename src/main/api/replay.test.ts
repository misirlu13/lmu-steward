const replayStoreSetMock = jest.fn();
const replayStoreData: Record<string, unknown> = { replays: {} };

jest.mock('../storage/local-data-store', () => ({
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
}));

jest.mock('xml2js', () => ({
  parseStringPromise: jest.fn(),
}));

import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { readdir, readFile } from 'fs/promises';
import { parseStringPromise } from 'xml2js';
import { LMUReplay } from '@types';
import { CONSTANTS } from '@constants';
import { generateReplayHash } from '../util';
import {
  filterReplaysByGameType,
  findBestLogFile,
  getLogDataSessionType,
  getReplayLogData,
  parseLogXml,
  postWatchReplay,
} from './replay';

describe('main/replay helpers', () => {
    it('matches known track aliases for new tracks (Paul Ricard layouts, Barcelona ELMS, Silverstone International)', async () => {
      // Paul Ricard 1A
      readdirMock.mockResolvedValue(['paulricard.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
      readFileMock.mockResolvedValue('<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Paul Ricard Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>);
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
      readdirMock.mockResolvedValue(['paulricard_v2.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
      readFileMock.mockResolvedValue('<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Paul Ricard Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>);
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
      readdirMock.mockResolvedValue(['paulricard_v2_short.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
      readFileMock.mockResolvedValue('<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Paul Ricard Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>);
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
      readdirMock.mockResolvedValue(['paulricard_3a.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
      readFileMock.mockResolvedValue('<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Paul Ricard Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>);
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
      readdirMock.mockResolvedValue(['barcelona.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
      readFileMock.mockResolvedValue('<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Circuit de Barcelona</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>);
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
      readdirMock.mockResolvedValue(['silverstone_int.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
      readFileMock.mockResolvedValue('<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Silverstone Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>);
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
  const readdirMock = readdir as jest.MockedFunction<typeof readdir>;
  const readFileMock = readFile as jest.MockedFunction<typeof readFile>;
  const createReadStreamMock = createReadStream as jest.MockedFunction<typeof createReadStream>;
  const parseStringPromiseMock =
    parseStringPromise as jest.MockedFunction<typeof parseStringPromise>;

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
      '<rFactorXML><RaceResults><Setting>Multiplayer</Setting><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>,
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

  it('parseLogXml reads streamed XML and parses session summary counts', async () => {
    const xmlChunks = [
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race><Minutes>60</Minutes><CarClass>LMP2</CarClass><CarClass>GTE</CarClass><Driver></Driver><Driver></Driver><Stream><Incident></Incident><Penalty></Penalty><TrackLimit></TrackLimit></Stream></Race></RaceResults></rFactorXML>',
    ];
    const stream = Readable.from(xmlChunks, { objectMode: false });
    createReadStreamMock.mockReturnValueOnce(stream as unknown as ReturnType<typeof createReadStream>);
    readFileMock.mockRejectedValue(new Error('readFile should not be called'));

    const result = await parseLogXml('C:/logs/file.xml');

    expect(createReadStreamMock).toHaveBeenCalledWith('C:/logs/file.xml', { encoding: 'utf-8' });
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
    expect(getLogDataSessionType({ rFactorXML: { RaceResults: {} } })).toBeNull();
  });

  it('finds best matching log file based on timestamp/session/track', async () => {
    readdirMock.mockResolvedValue(['old.xml', 'match.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);

    readFileMock.mockImplementation(async (filePath) => {
      if (String(filePath).includes('old.xml')) {
        return '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Qualify /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>;
      }
      return '<rFactorXML><RaceResults><DateTime>995</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>;
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
    readdirMock.mockResolvedValue(
      ['first.xml', 'second.xml'] as unknown as Awaited<ReturnType<typeof readdir>>,
    );

    readFileMock.mockImplementation(async (filePath) => {
      if (String(filePath).includes('first.xml')) {
        return '<rFactorXML><RaceResults><DateTime>930</DateTime><TrackVenue>Sebring International Raceway</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>;
      }

      return '<rFactorXML><RaceResults><DateTime>995</DateTime><TrackVenue>Sebring International Raceway</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>;
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
    readdirMock.mockResolvedValue(
      ['candidate.xml'] as unknown as Awaited<ReturnType<typeof readdir>>,
    );
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Bahrain International Circuit</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>,
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
    readdirMock.mockResolvedValue(['x.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
    readFileMock.mockResolvedValue('<rFactorXML><RaceResults><DateTime>5000</DateTime><TrackVenue>Different Track</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>);

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
    readdirMock.mockResolvedValue(['candidate.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
    readFileMock.mockResolvedValue('<rFactorXML><RaceResults><DateTime>1100</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>);

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
    readdirMock.mockResolvedValue(['candidate.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
    readFileMock.mockResolvedValue('<rFactorXML><RaceResults><DateTime>1100</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>);

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
    readdirMock.mockResolvedValue([
      'bad.xml',
      'good.xml',
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    readFileMock.mockImplementation(async (filePath) => {
      if (String(filePath).includes('bad.xml')) {
        return '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults' as unknown as Awaited<ReturnType<typeof readFile>>;
      }

      return '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>;
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
    readdirMock.mockResolvedValue(['full.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><Race /></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>,
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

    readdirMock.mockResolvedValue(['watch.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
    readFileMock.mockResolvedValue(
      '<rFactorXML><RaceResults><Setting>Multiplayer</Setting><DateTime>1000</DateTime><TrackVenue>Sebring</TrackVenue><GameVersion>1.0</GameVersion><Race><Minutes>90</Minutes></Race></RaceResults></rFactorXML>' as unknown as Awaited<ReturnType<typeof readFile>>,
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

    expect(replayStoreSetMock).toHaveBeenCalledTimes(1);
  });
});
