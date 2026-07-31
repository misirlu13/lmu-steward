import { CONSTANTS } from '@constants';
import { ImportedReplayRecord, ImportedReplayStore } from '@types';
import { dialog } from 'electron';
import { createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { basename, dirname, join, resolve as resolvePath } from 'path';
import { ZipFile } from 'yazl';
import { getMainPersistentStore } from '../storage/local-data-store';
import { readUserSettings } from './user-settings';
import {
  deleteImportedReplays,
  ImportPreviewRow,
  ImportSelection,
  importReplays,
  readLogCandidate,
  scanImportSource,
} from './replay-import';
import { readVcrTrailerResult } from './vcr-metadata';
import { parseLogXml } from './replay';
import { validateImportPair } from './replay-import-match';
import { getTrackAliases } from './track-matching';

const IMPORTED_REPLAYS_STORE_KEY = 'importedReplays';

/** Written into every export so the far side can skip pairing entirely. */
const EXPORT_MANIFEST_NAME = 'lmu-steward-export.json';

const stripVcrExtension = (fileName: string): string =>
  fileName.replace(/\.vcr$/i, '');

/**
 * The session summary the dashboard renders from: incident, penalty and
 * track-limit counts, duration and car classes. Same shape replay sync stores
 * for a replay the user recorded themselves, so imported replays render through
 * exactly the same code.
 */
const readLogSummary = async (filePath: string): Promise<unknown> => {
  try {
    const parsed = await parseLogXml(filePath);
    return parsed?.rFactorXML?.RaceResults ?? null;
  } catch {
    return null;
  }
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? 'Unknown error');
};

const readImportedStore = (): ImportedReplayStore => {
  const stored = getMainPersistentStore().get(IMPORTED_REPLAYS_STORE_KEY);

  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return {};
  }

  return stored as ImportedReplayStore;
};

const writeImportedStore = (imported: ImportedReplayStore): void => {
  getMainPersistentStore().set(IMPORTED_REPLAYS_STORE_KEY, imported);
};

/**
 * Where imports are written. The log directory is derived from the replay
 * directory exactly as log lookup does, so an imported log lands where the app
 * and the game both already look for one.
 */
const resolveImportDirectories = async (): Promise<{
  replayDirectory: string;
  logDirectory: string;
}> => {
  const settings = await readUserSettings();
  const replayDirectory = String(settings?.lmuReplayDirectoryPath ?? '');

  if (!replayDirectory) {
    throw new Error('No LMU replay folder is configured in settings.');
  }

  return {
    replayDirectory,
    logDirectory: resolvePath(replayDirectory, '../Log/Results'),
  };
};

/**
 * Fills in the session summary for records imported before it was stored.
 *
 * Those replays render an empty card — no incidents, no penalties, no duration
 * — because the dashboard reads all of it from logData. Reparsing the log they
 * already point at fixes them in place, rather than asking the user to delete
 * and import again.
 */
const backfillLogSummaries = async (
  imported: ImportedReplayStore,
): Promise<{ imported: ImportedReplayStore; changed: boolean }> => {
  const next: ImportedReplayStore = { ...imported };
  let changed = false;

  for (const [hash, record] of Object.entries(next)) {
    if (record.logData || !record.logPath) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const logData = await readLogSummary(record.logPath);

    if (logData) {
      next[hash] = { ...record, logData };
      changed = true;
    }
  }

  return { imported: next, changed };
};

export const getImportedReplays = async (event: Electron.IpcMainEvent) => {
  try {
    const { imported, changed } =
      await backfillLogSummaries(readImportedStore());

    if (changed) {
      writeImportedStore(imported);
    }

    event.reply(CONSTANTS.API.GET_IMPORTED_REPLAYS, {
      status: 'success',
      data: Object.values(imported).sort(
        (a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0),
      ),
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_IMPORTED_REPLAYS, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * Asks for a folder and returns the preview. Nothing is written — the user sees
 * the proposed pairings and confirms before any file is copied.
 */
export const postSelectImportSource = async (event: Electron.IpcMainEvent) => {
  try {
    const response = await dialog.showOpenDialog({
      title: 'Choose a folder containing replays and result logs',
      properties: ['openDirectory'],
    });

    if (response.canceled || response.filePaths.length === 0) {
      event.reply(CONSTANTS.API.POST_SELECT_IMPORT_SOURCE, {
        status: 'success',
        data: { canceled: true, rows: [] },
      });
      return;
    }

    const { logDirectory } = await resolveImportDirectories();

    const rows = await scanImportSource({
      sourceDirectory: response.filePaths[0],
      existingLogDirectory: logDirectory,
      imported: readImportedStore(),
    });

    event.reply(CONSTANTS.API.POST_SELECT_IMPORT_SOURCE, {
      status: 'success',
      data: { canceled: false, sourceDirectory: response.filePaths[0], rows },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_SELECT_IMPORT_SOURCE, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

export interface ImportReplaysRequest {
  rows: ImportPreviewRow[];
  selections: ImportSelection[];
}

export const postImportReplays = async (
  event: Electron.IpcMainEvent,
  request?: ImportReplaysRequest,
) => {
  try {
    const rows = request?.rows ?? [];
    const selections = request?.selections ?? [];

    if (selections.length === 0) {
      throw new Error('No replays were selected to import.');
    }

    const { replayDirectory, logDirectory } = await resolveImportDirectories();

    const { outcomes, imported } = await importReplays({
      rows,
      selections,
      replayDirectory,
      logDirectory,
      imported: readImportedStore(),
      parseLogSummary: readLogSummary,
      onProgress: (progress) => {
        event.reply(CONSTANTS.API.PUSH_IMPORT_PROGRESS, {
          status: 'in-progress',
          ...progress,
        });
      },
    });

    writeImportedStore(imported);

    event.reply(CONSTANTS.API.PUSH_IMPORT_PROGRESS, {
      status: 'success',
      processed: selections.length,
      total: selections.length,
    });

    event.reply(CONSTANTS.API.POST_IMPORT_REPLAYS, {
      status: 'success',
      data: {
        outcomes,
        replays: Object.values(imported).sort(
          (a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0),
        ),
      },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.PUSH_IMPORT_PROGRESS, {
      status: 'error',
      processed: 0,
      total: 0,
      message: toErrorMessage(error),
    });

    event.reply(CONSTANTS.API.POST_IMPORT_REPLAYS, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

export interface DeleteImportedReplaysRequest {
  hashes: string[];
}

/**
 * Removes imported files from disk. Paths are resolved from the store here —
 * the renderer only ever sends hashes, so a path can never arrive from outside.
 */
export const postDeleteImportedReplays = async (
  event: Electron.IpcMainEvent,
  request?: DeleteImportedReplaysRequest,
) => {
  try {
    const hashes = (request?.hashes ?? [])
      .map((hash) => String(hash ?? '').trim())
      .filter(Boolean);

    if (hashes.length === 0) {
      throw new Error('No replays were provided to delete.');
    }

    const { deleted, skipped, imported } = await deleteImportedReplays(
      hashes,
      readImportedStore(),
    );

    writeImportedStore(imported);

    event.reply(CONSTANTS.API.POST_DELETE_IMPORTED_REPLAYS, {
      status: 'success',
      data: {
        deleted,
        skipped,
        replays: Object.values(imported).sort(
          (a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0),
        ),
      },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_DELETE_IMPORTED_REPLAYS, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * Identifies the replay to export. Paths are resolved here rather than sent
 * from the renderer, for the same reason delete works that way: the main
 * process already knows where replays live, and a renderer assembling
 * filesystem paths by string concatenation is both fragile and a way for a
 * path to arrive from outside.
 */
export interface ExportReplayRequest {
  hash: string;
  replayName: string;
  sceneDesc: string;
  session: string;
  timestamp: number;
  logDataFileName: string;
}

export interface ExportManifest {
  createdBy: 'lmu-steward';
  version: 1;
  replayName: string;
  sceneDesc: string;
  session: string;
  /** The event time to stamp onto the .Vcr on the importing machine. */
  timestamp: number;
  vcrFileName: string;
  logFileName: string;
}

export const buildExportManifest = (
  request: ExportReplayRequest,
  vcrPath: string,
  logPath: string,
): ExportManifest => ({
  createdBy: 'lmu-steward',
  version: 1,
  replayName: request.replayName,
  sceneDesc: request.sceneDesc,
  session: request.session,
  timestamp: request.timestamp,
  vcrFileName: basename(vcrPath),
  logFileName: basename(logPath),
});

/**
 * Where a replay's files actually are.
 *
 * An imported replay is taken straight from its record: it may carry an
 * "(imported)" marker in its name, and its log is wherever the import wrote
 * it. Anything else is derived from the configured replay folder.
 */
export const resolveExportPaths = async (
  request: ExportReplayRequest,
  imported: ImportedReplayStore,
): Promise<{ vcrPath: string; logPath: string }> => {
  const importedRecord = imported[request.hash];

  if (importedRecord) {
    return {
      vcrPath: importedRecord.vcrPath,
      logPath: importedRecord.logPath,
    };
  }

  if (!request.logDataFileName) {
    throw new Error('This replay has no result log, so it cannot be exported.');
  }

  const { replayDirectory, logDirectory } = await resolveImportDirectories();

  return {
    vcrPath: join(replayDirectory, `${request.replayName}.Vcr`),
    logPath: join(logDirectory, request.logDataFileName),
  };
};

const writeZip = (zip: ZipFile, destination: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const output = createWriteStream(destination);

    zip.outputStream.on('error', reject);
    output.on('error', reject);
    output.on('close', () => resolve());

    zip.outputStream.pipe(output);
    /*
     * A single .Vcr can approach the 4 GB boundary, past which the classic zip
     * end-of-central-directory cannot address the archive.
     */
    zip.end({ forceZip64Format: true, comment: '' });
  });

/**
 * Zips a replay with its result log so it can be handed to someone else.
 *
 * Entries are stored rather than deflated: .Vcr data is already packed, so
 * compressing 400 MB would be a long freeze for no meaningful size win.
 *
 * The manifest carries the event timestamp, which lets an importing copy of
 * Steward stamp the exact creation time and skip pairing altogether. Import
 * still works without it, because most files a steward receives will not have
 * come from Steward.
 */
export const postExportReplay = async (
  event: Electron.IpcMainEvent,
  request?: ExportReplayRequest,
) => {
  try {
    if (!request?.replayName) {
      throw new Error('No replay was provided to export.');
    }

    const { vcrPath, logPath } = await resolveExportPaths(
      request,
      readImportedStore(),
    );

    /*
     * Both files are confirmed before the save dialog opens. Asking where to
     * save and only then discovering a missing file wastes the user's time.
     */
    await stat(vcrPath).catch(() => {
      throw new Error(`The replay file could not be found at ${vcrPath}.`);
    });
    await stat(logPath).catch(() => {
      throw new Error(`The result log could not be found at ${logPath}.`);
    });

    const response = await dialog.showSaveDialog({
      title: 'Export replay',
      defaultPath: `${request.replayName}.zip`,
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    });

    if (response.canceled || !response.filePath) {
      event.reply(CONSTANTS.API.POST_EXPORT_REPLAY, {
        status: 'success',
        data: { canceled: true },
      });
      return;
    }

    const zip = new ZipFile();
    zip.addFile(vcrPath, basename(vcrPath), { compress: false });
    zip.addFile(logPath, basename(logPath), { compress: false });
    zip.addBuffer(
      Buffer.from(
        JSON.stringify(buildExportManifest(request, vcrPath, logPath), null, 2),
      ),
      EXPORT_MANIFEST_NAME,
      { compress: false },
    );

    await writeZip(zip, response.filePath);

    event.reply(CONSTANTS.API.POST_EXPORT_REPLAY, {
      status: 'success',
      data: {
        canceled: false,
        filePath: response.filePath,
        directory: dirname(response.filePath),
      },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_EXPORT_REPLAY, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * Files an import wrote, for the clear-storage prompt. Clearing storage drops
 * the records, so the user has to be told what is about to become untracked
 * and offered the chance to remove it first.
 */
export const summariseImportedFiles = async (
  imported: ImportedReplayStore,
): Promise<{ count: number; totalBytes: number }> => {
  const records: ImportedReplayRecord[] = Object.values(imported);
  let totalBytes = 0;

  for (const record of records) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { size } = await stat(record.vcrPath);
      totalBytes += size;
    } catch {
      // A file already removed by hand contributes nothing.
    }
  }

  return { count: records.length, totalBytes };
};

/**
 * The two-file import flow: the user picks a .Vcr and its result log
 * themselves, so nothing has to be proposed. The pairing is still checked
 * before anything is written — picking the wrong XML is easy when a hand-off
 * holds several logs from one track on one evening.
 */

export interface SelectImportFileRequest {
  kind: 'replay' | 'log';
}

export const postSelectImportFile = async (
  event: Electron.IpcMainEvent,
  request?: SelectImportFileRequest,
) => {
  const isReplay = request?.kind !== 'log';

  try {
    const response = await dialog.showOpenDialog({
      title: isReplay
        ? 'Choose a replay file'
        : 'Choose the matching result log',
      properties: ['openFile'],
      filters: isReplay
        ? [{ name: 'LMU replay', extensions: ['Vcr'] }]
        : [{ name: 'Result log', extensions: ['xml'] }],
    });

    if (response.canceled || response.filePaths.length === 0) {
      event.reply(CONSTANTS.API.POST_SELECT_IMPORT_FILE, {
        status: 'success',
        data: { canceled: true, kind: request?.kind ?? 'replay' },
      });
      return;
    }

    const filePath = response.filePaths[0];

    if (isReplay) {
      const result = await readVcrTrailerResult(filePath);

      // Reported as-is: the reader knows which of several very different
      // problems this is, and only it can say.
      if (!result.ok) {
        throw new Error(result.message);
      }

      const { trailer } = result;
      const { size } = await stat(filePath);

      event.reply(CONSTANTS.API.POST_SELECT_IMPORT_FILE, {
        status: 'success',
        data: {
          canceled: false,
          kind: 'replay',
          filePath,
          fileName: basename(filePath),
          size,
          sceneDesc: trailer.sceneDesc,
          session: trailer.session,
          driverCount: trailer.drivers.length,
          trackFolder: trailer.trackFolder,
          trackVersion: trailer.trackVersion,
          originInstallPath: trailer.originInstallPath,
        },
      });
      return;
    }

    const candidate = await readLogCandidate(filePath);

    if (!candidate) {
      throw new Error('That file is not a readable LMU result log.');
    }

    event.reply(CONSTANTS.API.POST_SELECT_IMPORT_FILE, {
      status: 'success',
      data: {
        canceled: false,
        kind: 'log',
        filePath,
        fileName: basename(filePath),
        session: candidate.session,
        eventDateTime: candidate.eventDateTime,
        trackVenue: candidate.trackVenue,
        driverCount: candidate.driverNames.length,
      },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_SELECT_IMPORT_FILE, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

export interface ImportPairRequest {
  vcrPath: string;
  logPath: string;
}

const buildPairValidation = async ({ vcrPath, logPath }: ImportPairRequest) => {
  const trailerResult = await readVcrTrailerResult(vcrPath);

  if (!trailerResult.ok) {
    throw new Error(trailerResult.message);
  }

  const { trailer } = trailerResult;

  const candidate = await readLogCandidate(logPath);

  if (!candidate) {
    throw new Error('That result log could not be read.');
  }

  const validation = validateImportPair(
    trailer,
    candidate,
    getTrackAliases(trailer.sceneDesc, stripVcrExtension(basename(vcrPath))),
  );

  return { trailer, candidate, validation };
};

export const postValidateImportPair = async (
  event: Electron.IpcMainEvent,
  request?: ImportPairRequest,
) => {
  try {
    if (!request?.vcrPath || !request?.logPath) {
      throw new Error('Both a replay file and a result log are required.');
    }

    const { validation } = await buildPairValidation(request);

    event.reply(CONSTANTS.API.POST_VALIDATE_IMPORT_PAIR, {
      status: 'success',
      data: validation,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_VALIDATE_IMPORT_PAIR, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

export const postImportReplayPair = async (
  event: Electron.IpcMainEvent,
  request?: ImportPairRequest,
) => {
  try {
    if (!request?.vcrPath || !request?.logPath) {
      throw new Error('Both a replay file and a result log are required.');
    }

    const { trailer, candidate, validation } =
      await buildPairValidation(request);

    /*
     * Re-checked here rather than trusting the renderer's copy. The files may
     * have changed since the dialog validated them, and an error-level issue
     * means the import cannot produce a correct result.
     */
    if (!validation.canImport) {
      throw new Error(
        validation.issues.find((issue) => issue.severity === 'error')
          ?.message ?? 'This replay and log cannot be imported together.',
      );
    }

    const { replayDirectory, logDirectory } = await resolveImportDirectories();
    const { size } = await stat(request.vcrPath);
    const vcrFileName = basename(request.vcrPath);

    const row: ImportPreviewRow = {
      id: request.vcrPath,
      vcrPath: request.vcrPath,
      vcrFileName,
      replayName: stripVcrExtension(vcrFileName),
      sceneDesc: trailer.sceneDesc,
      session: trailer.session,
      size,
      trailer,
      pairing: { ranked: [], proposed: null, reason: 'only-candidate' },
      alreadyImportedHash: null,
    };

    const { outcomes, imported } = await importReplays({
      rows: [row],
      selections: [
        {
          id: row.id,
          logPath: candidate.filePath,
          method: 'manual',
          confidence: validation.confidence,
        },
      ],
      replayDirectory,
      logDirectory,
      imported: readImportedStore(),
      parseLogSummary: readLogSummary,
    });

    const outcome = outcomes[0];

    if (outcome?.status !== 'imported') {
      throw new Error(outcome?.message ?? 'The replay could not be imported.');
    }

    writeImportedStore(imported);

    event.reply(CONSTANTS.API.POST_IMPORT_REPLAY_PAIR, {
      status: 'success',
      data: {
        outcome,
        replays: Object.values(imported).sort(
          (a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0),
        ),
      },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_IMPORT_REPLAY_PAIR, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};
