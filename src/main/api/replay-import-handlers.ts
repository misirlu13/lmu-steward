import { CONSTANTS } from '@constants';
import { ImportedReplayRecord, ImportedReplayStore } from '@types';
import { dialog } from 'electron';
import { createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { basename, dirname, resolve as resolvePath } from 'path';
import { ZipFile } from 'yazl';
import { getMainPersistentStore } from '../storage/local-data-store';
import { readUserSettings } from './user-settings';
import {
  deleteImportedReplays,
  ImportPreviewRow,
  ImportSelection,
  importReplays,
  scanImportSource,
} from './replay-import';

const IMPORTED_REPLAYS_STORE_KEY = 'importedReplays';

/** Written into every export so the far side can skip pairing entirely. */
const EXPORT_MANIFEST_NAME = 'lmu-steward-export.json';

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

export const getImportedReplays = async (event: Electron.IpcMainEvent) => {
  try {
    event.reply(CONSTANTS.API.GET_IMPORTED_REPLAYS, {
      status: 'success',
      data: Object.values(readImportedStore()).sort(
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

export interface ExportReplayRequest {
  replayName: string;
  vcrPath: string;
  logPath: string;
  sceneDesc: string;
  session: string;
  timestamp: number;
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
): ExportManifest => ({
  createdBy: 'lmu-steward',
  version: 1,
  replayName: request.replayName,
  sceneDesc: request.sceneDesc,
  session: request.session,
  timestamp: request.timestamp,
  vcrFileName: basename(request.vcrPath),
  logFileName: basename(request.logPath),
});

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
    if (!request?.vcrPath || !request?.logPath) {
      throw new Error('This replay has no log file, so it cannot be exported.');
    }

    await stat(request.vcrPath);
    await stat(request.logPath);

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
    zip.addFile(request.vcrPath, basename(request.vcrPath), {
      compress: false,
    });
    zip.addFile(request.logPath, basename(request.logPath), {
      compress: false,
    });
    zip.addBuffer(
      Buffer.from(JSON.stringify(buildExportManifest(request), null, 2)),
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
