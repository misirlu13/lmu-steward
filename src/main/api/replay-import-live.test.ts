/**
 * Node, not jsdom: this drives the import handlers against a real temp
 * directory, and the capture is restored by reading a file off disk.
 *
 * @jest-environment node
 */

/*
 * Restoring a captured session on import — the wiring between two halves that
 * were each already tested on their own.
 *
 * `live-export.ts` covers building and applying a payload, and it always did.
 * What nothing covered was whether the handlers actually call it, which is how
 * the single-pair path came to skip the capture entirely: someone who extracted
 * a Steward archive and picked the .Vcr and the .xml out of it by hand got a
 * strictly worse import than the folder scan over the very same files, with no
 * indication anything had been left behind.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const IMPORTED_HASH = 'importing-machine-hash';
const SESSION_KEY = 'live|Daytona|1|1785495847000';

interface LivePayload {
  version: number;
  session: { sessionKey: string };
  incidents: unknown[];
  contexts?: unknown[];
  includesTelemetry: boolean;
}

interface LinkedReplay {
  hash: string;
  identityKey: string;
  replayName: string;
}

const applyLiveExportPayload = jest.fn(
  (_payload: LivePayload, _replay: LinkedReplay) => ({
    sessionKey: SESSION_KEY,
    incidentCount: 2,
    traceCount: 1,
  }),
);

jest.mock('electron', () => ({
  dialog: { showOpenDialog: jest.fn(), showSaveDialog: jest.fn() },
}));

jest.mock('electron-log', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

/*
 * Spied rather than replaced wholesale. `isLiveExportPayload` stays real so the
 * handlers still have to hand over something that passes the guard — a test
 * that accepted any JSON would pass with the parse removed.
 */
jest.mock('./live-export', () => ({
  ...jest.requireActual('./live-export'),
  applyLiveExportPayload: (payload: LivePayload, replay: LinkedReplay) =>
    applyLiveExportPayload(payload, replay),
}));

const store = new Map<string, unknown>();

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
  }),
}));

jest.mock('./user-settings', () => ({
  readUserSettings: () => ({
    lmuReplayDirectoryPath: 'C:\\LMU\\Replays',
  }),
}));

jest.mock('./replay', () => ({
  listReplayMatchTargets: () => [
    {
      hash: IMPORTED_HASH,
      identityKey: 'importing-identity',
      replayName: 'Daytona R1 2',
    },
  ],
  parseLogXml: jest.fn(),
}));

const importReplays = jest.fn();

/*
 * `readLiveDataSidecar` is deliberately the real one: the preview's report of
 * what is arriving and the restore that delivers it have to agree, and mocking
 * the detector would let them drift apart unnoticed.
 */
jest.mock('./replay-import', () => ({
  ...jest.requireActual('./replay-import'),
  importReplays: (...args: unknown[]) => importReplays(...(args as [])),
  readLogCandidate: jest.fn(),
  deleteImportedReplays: jest.fn(),
  scanImportSource: jest.fn(),
}));

jest.mock('./vcr-metadata', () => ({
  readVcrTrailerResult: jest.fn(),
}));

jest.mock('./replay-import-match', () => ({
  validateImportPair: jest.fn(),
}));

jest.mock('./track-matching', () => ({
  getTrackAliases: () => [],
}));

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  postImportReplayPair,
  postImportReplays,
} = require('./replay-import-handlers');
const { readLogCandidate } = require('./replay-import');
const { readVcrTrailerResult } = require('./vcr-metadata');
const { validateImportPair } = require('./replay-import-match');
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const LIVE_PAYLOAD = {
  version: 1,
  session: { sessionKey: SESSION_KEY, trackName: 'Daytona' },
  incidents: [{ id: 'i-1' }, { id: 'i-2' }],
  contexts: [{ incidentId: 'i-1' }],
  includesTelemetry: true,
};

let root = '';
let vcrPath = '';
let logPath = '';

/** Collects the handler's IPC reply so a failure reports its message. */
const createEvent = () => {
  const replies: Array<{ channel: string; payload: any }> = [];

  return {
    replies,
    reply: (channel: string, payload: unknown) => {
      replies.push({ channel, payload });
    },
  };
};

const expectSucceeded = (event: ReturnType<typeof createEvent>) => {
  const last = event.replies[event.replies.length - 1];
  expect(last?.payload?.message ?? null).toBeNull();
  expect(last?.payload?.status).toBe('success');
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lmu-steward-live-import-'));
  vcrPath = join(root, 'Daytona R1 2.Vcr');
  logPath = join(root, '2026_07_30_23_09_50-12R1.xml');

  writeFileSync(vcrPath, 'vcr');
  writeFileSync(logPath, '<xml/>');

  store.clear();
  applyLiveExportPayload.mockClear();

  importReplays.mockReset();
  importReplays.mockImplementation(
    ({ rows }: { rows: Array<{ id: string }> }) => ({
      outcomes: rows.map((row) => ({
        id: row.id,
        replayName: 'Daytona R1 2',
        status: 'imported',
        hash: IMPORTED_HASH,
      })),
      imported: {
        [IMPORTED_HASH]: {
          hash: IMPORTED_HASH,
          replayName: 'Daytona R1 2',
          vcrPath,
          timestamp: 1785495847,
        },
      },
    }),
  );

  readVcrTrailerResult.mockResolvedValue({
    ok: true,
    trailer: {
      sceneDesc: 'DAYTONA',
      session: 'RACE',
      drivers: [{ name: 'Anna One' }],
    },
  });

  readLogCandidate.mockResolvedValue({
    filePath: logPath,
    fileName: '2026_07_30_23_09_50-12R1.xml',
    session: 'RACE',
    eventDateTime: 1785495847,
    trackVenue: 'Daytona International Speedway',
    driverNames: ['Anna One'],
  });

  validateImportPair.mockReturnValue({
    issues: [],
    confidence: 1,
    rosterOverlap: { intersection: 1, vcrCount: 1, logCount: 1 },
    canImport: true,
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const writeCapture = () =>
  writeFileSync(
    join(root, 'lmu-steward-live.json'),
    JSON.stringify(LIVE_PAYLOAD),
  );

const previewRow = () => ({
  id: vcrPath,
  vcrPath,
  vcrFileName: 'Daytona R1 2.Vcr',
  replayName: 'Daytona R1 2',
  sceneDesc: 'DAYTONA',
  session: 'RACE',
  size: 1,
  trailer: { sceneDesc: 'DAYTONA', session: 'RACE', drivers: [] },
  pairing: { ranked: [], proposed: null, reason: 'only-candidate' },
  alreadyImportedHash: null,
  manifest: null,
  liveData: null,
});

describe('main/import restores a captured session', () => {
  /*
   * Both entry points, one expectation. They are separate code paths into the
   * same restore, and the pair path is the one that did not reach it.
   */
  describe.each([
    [
      'the folder and archive path',
      (event: ReturnType<typeof createEvent>) =>
        postImportReplays(event, {
          rows: [previewRow()],
          selections: [
            { id: vcrPath, logPath, method: 'manual', confidence: 1 },
          ],
        }),
    ],
    [
      'the single replay and log path',
      (event: ReturnType<typeof createEvent>) =>
        postImportReplayPair(event, { vcrPath, logPath }),
    ],
  ])('%s', (_label, runImport) => {
    it('links the capture beside the replay to the hash the import minted', async () => {
      writeCapture();

      const event = createEvent();
      await runImport(event);

      expectSucceeded(event);
      expect(applyLiveExportPayload).toHaveBeenCalledTimes(1);

      const [payload, replay] = applyLiveExportPayload.mock.calls[0];

      expect(payload.session.sessionKey).toBe(SESSION_KEY);
      expect(payload.incidents).toHaveLength(2);
      // Traces travel only because the exporting steward opted in.
      expect(payload.contexts).toHaveLength(1);

      /*
       * The hash from this install, never the exporting machine's. A stale one
       * would be a link pointing at nothing that still looks like a link.
       */
      expect(replay).toEqual({
        hash: IMPORTED_HASH,
        identityKey: 'importing-identity',
        replayName: 'Daytona R1 2',
      });
    });

    it('imports normally when no capture came with the replay', async () => {
      const event = createEvent();
      await runImport(event);

      expectSucceeded(event);
      expect(applyLiveExportPayload).not.toHaveBeenCalled();
    });

    /**
     * A capture that will not parse must not fail an import that has already
     * copied gigabytes onto the disk — but it must not look like a clean one
     * either, which is why the handler logs it rather than swallowing it.
     */
    it('completes the import when the capture cannot be read', async () => {
      writeFileSync(join(root, 'lmu-steward-live.json'), 'not json');

      const event = createEvent();
      await runImport(event);

      expectSucceeded(event);
      expect(applyLiveExportPayload).not.toHaveBeenCalled();
    });

    /** Anything that is not one of ours is ignored rather than handed over. */
    it('ignores a file that is not a captured session', async () => {
      writeFileSync(
        join(root, 'lmu-steward-live.json'),
        JSON.stringify({ hello: 'world' }),
      );

      const event = createEvent();
      await runImport(event);

      expectSucceeded(event);
      expect(applyLiveExportPayload).not.toHaveBeenCalled();
    });
  });
});
