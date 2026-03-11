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

    const result = await findBestLogFile('C:/logs', replay, 120_000);

    expect(result).toEqual(
      expect.objectContaining({
        logDataFileName: 'match.xml',
      }),
    );
    expect(result?.logData?.rFactorXML?.RaceResults?.Race).toEqual({});
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

    const result = await findBestLogFile('C:/logs', replay, 120_000);

    expect(result).toEqual({ logDataFileName: null, logData: null });
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

    const result = await findBestLogFile('C:/logs', replay, 100_000);

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

    const result = await findBestLogFile('C:/logs', replay, 99_000);

    expect(result).toEqual({ logDataFileName: null, logData: null });
  });
});
