/*
 * Export path resolution.
 *
 * The renderer used to assemble these paths by string concatenation, which is
 * how a template-literal escaping slip produced a log path containing the
 * literal text "${currentReplay.logDataFileName}" and made every export fail.
 * Paths are now resolved here, and these assert that they land where the files
 * actually are.
 */
/* eslint-disable import/first */
const settings: Record<string, unknown> = {
  lmuReplayDirectoryPath: 'C:\\LMU\\UserData\\Replays',
};

import { join } from 'path';
import { ImportedReplayStore } from '@types';
import {
  buildExportManifest,
  ExportReplayRequest,
  resolveExportPaths,
} from './replay-import-handlers';

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({
    get: () => undefined,
    set: () => {},
    clear: () => {},
  }),
}));

jest.mock('./user-settings', () => ({
  readUserSettings: async () => settings,
}));
/* eslint-enable import/first */

const buildRequest = (
  overrides: Partial<ExportReplayRequest> = {},
): ExportReplayRequest => ({
  hash: 'own-hash',
  replayName: 'Autodromo Nazionale Monza R1 2',
  sceneDesc: 'MONZAWEC',
  session: 'RACE',
  timestamp: 1784398360,
  logDataFileName: '2026_07_18_22_37_06-39R1.xml',
  ...overrides,
});

describe('main/replay export paths', () => {
  it('resolves a replay the user recorded from the configured folder', async () => {
    const { vcrPath, logPath } = await resolveExportPaths(buildRequest(), {});

    expect(vcrPath).toBe(
      join('C:\\LMU\\UserData\\Replays', 'Autodromo Nazionale Monza R1 2.Vcr'),
    );
    expect(logPath).toBe(
      join('C:\\LMU\\UserData\\Log\\Results', '2026_07_18_22_37_06-39R1.xml'),
    );
    // The separator is real, not a stray literal from string concatenation.
    expect(logPath).not.toContain('${');
  });

  /**
   * An imported replay may carry an "(imported)" marker in its name and its log
   * lives wherever the import wrote it, so its record is the only reliable
   * source — rebuilding the path from the replay name would miss both.
   */
  it('takes an imported replay straight from its record', async () => {
    const imported: ImportedReplayStore = {
      'imported-hash': {
        hash: 'imported-hash',
        replayName: 'Autodromo Nazionale Monza R1 2 (imported)',
        originalReplayName: 'Autodromo Nazionale Monza R1 2',
        sceneDesc: 'MONZAWEC',
        session: 'RACE',
        timestamp: 1784398360,
        vcrFileName: 'Autodromo Nazionale Monza R1 2 (imported).Vcr',
        vcrPath: 'D:\\Elsewhere\\Autodromo Nazionale Monza R1 2 (imported).Vcr',
        size: 10,
        logFileName: 'event-two-race.xml',
        logPath: 'D:\\Elsewhere\\Logs\\event-two-race.xml',
        logWasWritten: true,
        vcrFingerprint: 'a',
        logFingerprint: 'b',
        importedAt: 1,
        logData: null,
        origin: {
          trackFolder: 'Monza_2023',
          trackVersion: '1.27',
          trackContentHash: 'abc',
          installPath: 'E:\\LMU',
        },
        match: { method: 'manual', confidence: null, rosterOverlap: null },
      },
    };

    const { vcrPath, logPath } = await resolveExportPaths(
      buildRequest({ hash: 'imported-hash' }),
      imported,
    );

    expect(vcrPath).toBe(imported['imported-hash'].vcrPath);
    expect(logPath).toBe(imported['imported-hash'].logPath);
  });

  it('refuses a replay with no result log', async () => {
    await expect(
      resolveExportPaths(buildRequest({ logDataFileName: '' }), {}),
    ).rejects.toThrow(/no result log/);
  });

  it('names the files in the manifest as they appear in the archive', () => {
    const manifest = buildExportManifest(
      buildRequest(),
      'C:\\LMU\\UserData\\Replays\\Autodromo Nazionale Monza R1 2.Vcr',
      'C:\\LMU\\UserData\\Log\\Results\\2026_07_18_22_37_06-39R1.xml',
    );

    expect(manifest).toMatchObject({
      createdBy: 'lmu-steward',
      version: 1,
      // The event time is the point of the manifest: it lets the receiving
      // copy stamp the exact creation time and skip pairing entirely.
      timestamp: 1784398360,
      vcrFileName: 'Autodromo Nazionale Monza R1 2.Vcr',
      logFileName: '2026_07_18_22_37_06-39R1.xml',
    });
  });
});
