jest.mock('electron-store', () => ({
  __esModule: true,
  default: class MockStore {
    private data: Record<string, unknown> = { replays: {} };

    get(key: string) {
      return this.data[key];
    }

    set(key: string, value: unknown) {
      this.data[key] = value;
    }

    clear() {
      this.data = { replays: {} };
    }
  },
}));

jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
  readFile: jest.fn(),
}));

jest.mock('xml2js', () => ({
  parseStringPromise: jest.fn(),
}));

import { readdir, readFile } from 'fs/promises';
import { parseStringPromise } from 'xml2js';
import { LMUReplay } from '@types';
import {
  findBestLogFile,
  getLogDataSessionType,
  parseLogXml,
} from './replay';

describe('main/replay helpers', () => {
    it('matches known track aliases for new tracks (Paul Ricard layouts, Barcelona ELMS, Silverstone International)', async () => {
      // Paul Ricard 1A
      readdirMock.mockResolvedValue(['paulricard.xml'] as unknown as Awaited<ReturnType<typeof readdir>>);
      readFileMock.mockResolvedValue('paulricard-xml' as unknown as Awaited<ReturnType<typeof readFile>>);
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
      readFileMock.mockResolvedValue('paulricard-v2-xml' as unknown as Awaited<ReturnType<typeof readFile>>);
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
      readFileMock.mockResolvedValue('paulricard-v2-short-xml' as unknown as Awaited<ReturnType<typeof readFile>>);
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
      readFileMock.mockResolvedValue('paulricard-3a-xml' as unknown as Awaited<ReturnType<typeof readFile>>);
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
      readFileMock.mockResolvedValue('barcelona-xml' as unknown as Awaited<ReturnType<typeof readFile>>);
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
      readFileMock.mockResolvedValue('silverstone-int-xml' as unknown as Awaited<ReturnType<typeof readFile>>);
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
  const parseStringPromiseMock =
    parseStringPromise as jest.MockedFunction<typeof parseStringPromise>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parseLogXml reads file and parses XML with expected options', async () => {
    readFileMock.mockResolvedValue('<xml>payload</xml>' as unknown as Awaited<ReturnType<typeof readFile>>);
    parseStringPromiseMock.mockResolvedValue({ parsed: true } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);

    const result = await parseLogXml('C:/logs/file.xml');

    expect(readFileMock).toHaveBeenCalledWith('C:/logs/file.xml', 'utf-8');
    expect(parseStringPromiseMock).toHaveBeenCalledWith('<xml>payload</xml>', {
      explicitArray: false,
      mergeAttrs: true,
    });
    expect(result).toEqual({ parsed: true });
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
        return 'old-xml' as unknown as Awaited<ReturnType<typeof readFile>>;
      }
      return 'match-xml' as unknown as Awaited<ReturnType<typeof readFile>>;
    });

    parseStringPromiseMock.mockImplementation(async (xml) => {
      if (xml === 'old-xml') {
        return {
          rFactorXML: {
            RaceResults: {
              DateTime: 1000,
              TrackVenue: 'Sebring',
              Qualify: {},
            },
          },
        } as unknown as Awaited<ReturnType<typeof parseStringPromise>>;
      }

      return {
        rFactorXML: {
          RaceResults: {
            DateTime: 995,
            TrackVenue: 'Sebring',
            Race: {},
          },
        },
      } as unknown as Awaited<ReturnType<typeof parseStringPromise>>;
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
        return 'first-xml' as unknown as Awaited<ReturnType<typeof readFile>>;
      }

      return 'second-xml' as unknown as Awaited<ReturnType<typeof readFile>>;
    });

    parseStringPromiseMock.mockImplementation(async (xml) => {
      if (xml === 'first-xml') {
        return {
          rFactorXML: {
            RaceResults: {
              DateTime: 930,
              TrackVenue: 'Sebring International Raceway',
              Race: {},
            },
          },
        } as unknown as Awaited<ReturnType<typeof parseStringPromise>>;
      }

      return {
        rFactorXML: {
          RaceResults: {
            DateTime: 995,
            TrackVenue: 'Sebring International Raceway',
            Race: {},
          },
        },
      } as unknown as Awaited<ReturnType<typeof parseStringPromise>>;
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
      'candidate-xml' as unknown as Awaited<ReturnType<typeof readFile>>,
    );
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          DateTime: 1000,
          TrackVenue: 'Bahrain International Circuit',
          Race: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);

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
    readFileMock.mockResolvedValue('mismatch-xml' as unknown as Awaited<ReturnType<typeof readFile>>);
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          DateTime: 5000,
          TrackVenue: 'Different Track',
          Race: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);

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
    readFileMock.mockResolvedValue('candidate-xml' as unknown as Awaited<ReturnType<typeof readFile>>);
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          DateTime: 1100,
          TrackVenue: 'Sebring',
          Race: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);

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
    readFileMock.mockResolvedValue('candidate-xml' as unknown as Awaited<ReturnType<typeof readFile>>);
    parseStringPromiseMock.mockResolvedValue({
      rFactorXML: {
        RaceResults: {
          DateTime: 1100,
          TrackVenue: 'Sebring',
          Race: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof parseStringPromise>>);

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
});
