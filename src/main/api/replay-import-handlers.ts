import { CONSTANTS } from '@constants';
import { ImportedReplayRecord, ImportedReplayStore } from '@types';
import { dialog } from 'electron';
import log from 'electron-log';
import { mkdir, mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, join, resolve as resolvePath } from 'path';
import { getMainPersistentStore } from '../storage/local-data-store';
import { readUserSettings } from './user-settings';
import {
  deleteImportedReplays,
  ImportPreviewRow,
  ImportSelection,
  importReplays,
  readLiveDataSidecar,
  readLogCandidate,
  scanImportSource,
} from './replay-import';
import { readManifestFile } from './import-manifest';
import { readVcrTrailerResult } from './vcr-metadata';
import { listReplayMatchTargets, parseLogXml } from './replay';
import {
  applyLiveExportPayload,
  buildLiveExportPayload,
  isLiveExportPayload,
} from './live-export';
import { validateImportPair } from './replay-import-match';
import { getTrackAliases } from './track-matching';
import { assertFreeSpace } from './disk-space';
import { extractArchive, inspectArchive } from './archive-reader';
import {
  ArchiveEntry,
  buildExportManifest,
  buildWeekendFileName,
  buildWeekendLayout,
  buildWeekendManifest,
  EXPORT_LIVE_DATA_NAME,
  EXPORT_MANIFEST_NAME,
  ExportProgress,
  ExportReplayRequest,
  ExportWeekendRequest,
  OmittedSession,
  ProgressStep,
  resolveProgressStep,
  WeekendSessionSource,
  writeArchive,
} from './replay-export';

export type {
  ExportManifest,
  ExportReplayRequest,
  ExportWeekendRequest,
} from './replay-export';
export { buildExportManifest } from './replay-export';

const IMPORTED_REPLAYS_STORE_KEY = 'importedReplays';

/**
 * Progress for the whole bulk-import run, whichever stage it is in.
 *
 * One channel rather than one per phase, because to the user it is a single
 * operation: pick an archive, watch it unpack, watch it import. `phase` is what
 * lets the dialog label the bar honestly — unpacking counts bytes, importing
 * counts replays, and reporting either as the other would be a lie about how
 * far along it is.
 */
export interface ImportProgress {
  status: 'idle' | 'in-progress' | 'success' | 'error';
  phase: 'extracting' | 'scanning' | 'importing';
  processed: number;
  total: number;
  currentLabel: string;
  message?: string;
}

const pushImportProgress = (
  event: Electron.IpcMainEvent,
  progress: ImportProgress,
) => {
  event.reply(CONSTANTS.API.PUSH_IMPORT_PROGRESS, progress);
};

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
 * Where a zip is unpacked before it is scanned.
 *
 * Held in module state rather than passed through the renderer, for the same
 * reason every other path here is: the renderer sends identifiers and never
 * filesystem paths. Only one extraction is live at a time — starting another
 * selection or finishing an import clears the last one.
 */
let extractedSourceDirectory: string | null = null;

const discardExtractedSource = async (): Promise<void> => {
  if (!extractedSourceDirectory) {
    return;
  }

  const directory = extractedSourceDirectory;
  extractedSourceDirectory = null;

  // A temp directory that will not delete is not worth failing an import over.
  await rm(directory, { recursive: true, force: true }).catch(() => {});
};

/**
 * Unpacks an archive into a directory this app owns, then hands back where.
 *
 * Extracted rather than read in place because everything downstream — trailer
 * parsing, log reading, the copy into the LMU install — works on files, and
 * teaching all of it to read through a zip would be a much larger change for a
 * step that happens once.
 *
 * The cost is that the archive is briefly on disk twice, which is why the space
 * check covers the extraction *and* the copy that follows it.
 */
const extractSourceArchive = async (
  event: Electron.IpcMainEvent,
  archivePath: string,
): Promise<{ directory: string; rejectedEntries: string[] }> => {
  const { totalUncompressedBytes } = await inspectArchive(archivePath);

  const root = join(tmpdir(), 'lmu-steward-import');
  await mkdir(root, { recursive: true });

  /*
   * Both halves at once. Extracting successfully and then failing to copy
   * would leave the user with a full disk and nothing imported, having waited
   * through the unpack for it.
   */
  await assertFreeSpace(
    root,
    totalUncompressedBytes * 2,
    'unpack and import this archive',
  );

  const directory = await mkdtemp(join(root, 'source-'));

  const { rejectedEntries } = await extractArchive(
    archivePath,
    directory,
    ({ bytesWritten, totalBytes, currentEntry }) => {
      pushImportProgress(event, {
        status: 'in-progress',
        phase: 'extracting',
        processed: bytesWritten,
        total: totalBytes,
        currentLabel: basename(currentEntry),
      });
    },
  );

  extractedSourceDirectory = directory;

  return { directory, rejectedEntries };
};

export interface SelectImportSourceRequest {
  /**
   * Windows cannot show one dialog that accepts either, so the caller says
   * which. Electron's own note: setting both `openFile` and `openDirectory`
   * shows a directory selector on Windows and Linux, silently.
   */
  kind?: 'folder' | 'zip';
}

/**
 * Asks for a folder or an archive and returns the preview. Nothing is written
 * into the LMU install — the user sees the proposed pairings and confirms
 * before any replay is copied.
 */
export const postSelectImportSource = async (
  event: Electron.IpcMainEvent,
  request?: SelectImportSourceRequest,
) => {
  const isArchive = request?.kind === 'zip';

  try {
    await discardExtractedSource();

    const response = await dialog.showOpenDialog(
      isArchive
        ? {
            title: 'Choose an exported replay archive',
            properties: ['openFile'],
            filters: [{ name: 'Zip archive', extensions: ['zip'] }],
          }
        : {
            title: 'Choose a folder containing replays and result logs',
            properties: ['openDirectory'],
          },
    );

    if (response.canceled || response.filePaths.length === 0) {
      event.reply(CONSTANTS.API.POST_SELECT_IMPORT_SOURCE, {
        status: 'success',
        data: { canceled: true, rows: [] },
      });
      return;
    }

    const selectedPath = response.filePaths[0];
    let sourceDirectory = selectedPath;
    let rejectedEntries: string[] = [];

    if (isArchive) {
      const extracted = await extractSourceArchive(event, selectedPath);
      sourceDirectory = extracted.directory;
      rejectedEntries = extracted.rejectedEntries;
    }

    const { logDirectory } = await resolveImportDirectories();

    pushImportProgress(event, {
      status: 'in-progress',
      phase: 'scanning',
      processed: 0,
      total: 0,
      currentLabel: '',
    });

    const { rows, manifestSessionCount, omittedSessions } =
      await scanImportSource({
        sourceDirectory,
        existingLogDirectory: logDirectory,
        imported: readImportedStore(),
      });

    pushImportProgress(event, {
      status: 'idle',
      phase: 'scanning',
      processed: 0,
      total: 0,
      currentLabel: '',
    });

    event.reply(CONSTANTS.API.POST_SELECT_IMPORT_SOURCE, {
      status: 'success',
      data: {
        canceled: false,
        kind: isArchive ? 'zip' : 'folder',
        /** What the user picked, not where it was unpacked. */
        sourceLabel: selectedPath,
        rows,
        manifestSessionCount,
        omittedSessions,
        rejectedEntries,
      },
    });
  } catch (error: unknown) {
    await discardExtractedSource();

    pushImportProgress(event, {
      status: 'error',
      phase: isArchive ? 'extracting' : 'scanning',
      processed: 0,
      total: 0,
      currentLabel: '',
      message: toErrorMessage(error),
    });

    event.reply(CONSTANTS.API.POST_SELECT_IMPORT_SOURCE, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * Called when the user closes the preview without importing. Without this an
 * abandoned archive would sit in temp at full size until the OS cleared it.
 */
export const postDiscardImportPreview = async (
  event: Electron.IpcMainEvent,
) => {
  await discardExtractedSource();

  event.reply(CONSTANTS.API.POST_DISCARD_IMPORT_PREVIEW, {
    status: 'success',
    data: {},
  });
};

export interface ImportReplaysRequest {
  rows: ImportPreviewRow[];
  selections: ImportSelection[];
}

/**
 * Copies every confirmed row into the LMU install.
 *
 * Rows arrive from the renderer with the paths the scan gave them, and those
 * paths are the only ones used — either inside the folder the user picked or
 * inside the temp directory this process unpacked. A row naming anything else
 * is dropped rather than trusted.
 */
/**
 * Restores any captured sessions that travelled with the imported replays.
 *
 * The file sits beside the .Vcr it belongs to, which is what makes the pairing
 * unambiguous — no matching is needed or wanted here, because the archive is a
 * direct statement from the exporting steward about which capture goes with
 * which replay.
 *
 * Isolated per row: an unreadable capture must not fail an import that has
 * already copied gigabytes of replay onto the disk successfully.
 */
const restoreImportedLiveData = async (
  rows: ImportPreviewRow[],
  outcomes: Array<{ id: string; status: string; hash?: string }>,
): Promise<void> => {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const targets = listReplayMatchTargets();

  for (const outcome of outcomes) {
    if (outcome.status !== 'imported' || !outcome.hash) {
      continue;
    }

    const row = rowsById.get(outcome.id);
    const target = targets.find((entry) => entry.hash === outcome.hash);

    if (!row || !target) {
      continue;
    }

    const livePath = join(dirname(row.vcrPath), EXPORT_LIVE_DATA_NAME);

    try {
      // eslint-disable-next-line no-await-in-loop
      const raw = await readFile(livePath, 'utf-8');
      const payload = JSON.parse(raw) as unknown;

      if (!isLiveExportPayload(payload)) {
        log.warn(
          `live-export: ${livePath} is not a captured session, ignoring it`,
        );
        continue;
      }

      applyLiveExportPayload(payload, {
        hash: target.hash,
        identityKey: target.identityKey,
        replayName: target.replayName,
      });
    } catch (error) {
      /*
        A missing file is the ordinary case — most archives carry no capture.
        Anything else is not, and must not look like it: swallowing a parse or
        write failure here would make a broken import indistinguishable from a
        normal one, with the evidence silently absent on the far side.
      */
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        log.error(
          `live-export: failed to restore the capture from ${livePath}`,
          error,
        );
      }
    }
  }
};

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
        pushImportProgress(event, {
          status: 'in-progress',
          phase: 'importing',
          currentLabel: progress.currentLabel ?? '',
          processed: progress.processed,
          total: progress.total,
        });
      },
    });

    writeImportedStore(imported);

    /*
      Captured sessions ride in beside the replays they belong to. Restored
      after the store is written, because the link needs the hash and identity
      key the import just minted — and before the extracted source is thrown
      away, which is the only place the file exists.
    */
    await restoreImportedLiveData(rows, outcomes);

    // The unpacked archive has served its purpose the moment the copies land.
    await discardExtractedSource();

    pushImportProgress(event, {
      status: 'success',
      phase: 'importing',
      processed: selections.length,
      total: selections.length,
      currentLabel: '',
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
    pushImportProgress(event, {
      status: 'error',
      phase: 'importing',
      processed: 0,
      total: 0,
      currentLabel: '',
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

export interface SetImportedNoteRequest {
  hashes: string[];
  note: string;
}

/**
 * Rewrites the note on imported replays.
 *
 * Without this an import note would be permanent: an imported replay is never
 * in the archived view, which is the only place note editing lives today. A
 * typo on a hand-off a steward keeps for a season is a poor place to have no
 * second chance.
 */
export const postSetImportedNote = async (
  event: Electron.IpcMainEvent,
  request?: SetImportedNoteRequest,
) => {
  try {
    const hashes = (request?.hashes ?? [])
      .map((hash) => String(hash ?? '').trim())
      .filter(Boolean);

    if (hashes.length === 0) {
      throw new Error('No replays were provided.');
    }

    const note = String(request?.note ?? '').trim();
    const imported = { ...readImportedStore() };

    for (const hash of hashes) {
      const record = imported[hash];

      if (record) {
        // An empty note removes it rather than storing a blank string, so the
        // row's note marker disappears with it.
        imported[hash] = { ...record, note: note || undefined };
      }
    }

    writeImportedStore(imported);

    event.reply(CONSTANTS.API.POST_SET_IMPORTED_NOTE, {
      status: 'success',
      data: {
        replays: Object.values(imported).sort(
          (a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0),
        ),
      },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_SET_IMPORTED_NOTE, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

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

/**
 * Confirms both files exist and reports their sizes.
 *
 * Checked before the save dialog opens. Asking where to save and only then
 * discovering a missing file wastes the user's time, and the sizes are what
 * the free-disk check and the progress bar are built from.
 */
const measureSessionFiles = async (
  vcrPath: string,
  logPath: string,
): Promise<{ vcrSize: number; logSize: number }> => {
  const vcrStat = await stat(vcrPath).catch(() => {
    throw new Error(`The replay file could not be found at ${vcrPath}.`);
  });
  const logStat = await stat(logPath).catch(() => {
    throw new Error(`The result log could not be found at ${logPath}.`);
  });

  return { vcrSize: vcrStat.size, logSize: logStat.size };
};

/**
 * The captured session for a replay, ready to drop into the archive.
 *
 * Null when the replay has no linked capture, which is the ordinary case and
 * produces exactly the archive exports produced before this existed.
 *
 * Failures are swallowed: a hand-off that carries the footage and the log is
 * still a working hand-off, and refusing to export a multi-gigabyte replay
 * because a trace could not be read would be a poor trade.
 */
const buildLiveArchiveEntry = (
  request: ExportReplayRequest,
  entryPrefix: string,
): {
  entry: ArchiveEntry;
  bytes: number;
  summary: { includesTelemetry: boolean };
} | null => {
  try {
    const identityKey = listReplayMatchTargets().find(
      (target) => target.hash === request.hash,
    )?.identityKey;

    const payload = buildLiveExportPayload(
      request.hash,
      Boolean(request.includeLiveTelemetry),
      identityKey,
    );

    if (!payload) {
      return null;
    }

    const buffer = Buffer.from(JSON.stringify(payload));

    return {
      entry: {
        source: { buffer },
        entryName: `${entryPrefix}${EXPORT_LIVE_DATA_NAME}`,
      },
      bytes: buffer.byteLength,
      summary: { includesTelemetry: payload.includesTelemetry },
    };
  } catch (error) {
    log.warn('live-export: could not attach captured session', error);
    return null;
  }
};

/**
 * Byte-based progress, pushed while the archive is written.
 *
 * A weekend is several 400 MB files, so without this the window looks frozen
 * for minutes. Throttled to whole percent: yazl's output stream fires per
 * chunk, which is thousands of messages a second on a fast disk, and flooding
 * the renderer with them would itself be a way to make the UI stutter.
 */
const createProgressPusher = (
  event: Electron.IpcMainEvent,
  steps: ProgressStep[],
  totalBytes: number,
) => {
  let lastPercent = -1;

  return (bytesWritten: number) => {
    const percent =
      totalBytes > 0 ? Math.floor((bytesWritten / totalBytes) * 100) : 0;

    if (percent === lastPercent) {
      return;
    }
    lastPercent = percent;

    const { processed, currentLabel } = resolveProgressStep(
      steps,
      bytesWritten,
    );

    const progress: ExportProgress = {
      status: 'in-progress',
      processed,
      total: steps.length,
      bytesWritten,
      totalBytes,
      currentLabel,
    };

    event.reply(CONSTANTS.API.PUSH_EXPORT_PROGRESS, progress);
  };
};

const pushExportProgress = (
  event: Electron.IpcMainEvent,
  progress: ExportProgress,
) => {
  event.reply(CONSTANTS.API.PUSH_EXPORT_PROGRESS, progress);
};

/**
 * Zips a replay with its result log so it can be handed to someone else.
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

    const { vcrSize, logSize } = await measureSessionFiles(vcrPath, logPath);

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

    /*
      Built before the free-space check so its bytes are counted. A session's
      trace windows can run to tens of megabytes, which is nothing beside a
      .Vcr but is not nothing beside a nearly-full disk.
    */
    const liveEntry = buildLiveArchiveEntry(request, '');
    const totalBytes = vcrSize + logSize + (liveEntry?.bytes ?? 0);

    await assertFreeSpace(
      dirname(response.filePath),
      totalBytes,
      'export this replay',
    );

    const steps: ProgressStep[] = [
      { label: request.replayName, bytes: totalBytes },
    ];

    await writeArchive(
      [
        {
          source: { filePath: vcrPath },
          entryName: basename(vcrPath),
        },
        {
          source: { filePath: logPath },
          entryName: basename(logPath),
        },
        ...(liveEntry ? [liveEntry.entry] : []),
        {
          source: {
            buffer: Buffer.from(
              JSON.stringify(
                buildExportManifest(
                  request,
                  vcrPath,
                  logPath,
                  liveEntry?.summary ?? null,
                ),
                null,
                2,
              ),
            ),
          },
          entryName: EXPORT_MANIFEST_NAME,
        },
      ],
      response.filePath,
      createProgressPusher(event, steps, totalBytes),
    );

    pushExportProgress(event, {
      status: 'success',
      processed: 1,
      total: 1,
      bytesWritten: totalBytes,
      totalBytes,
      currentLabel: request.replayName,
    });

    event.reply(CONSTANTS.API.POST_EXPORT_REPLAY, {
      status: 'success',
      data: {
        canceled: false,
        filePath: response.filePath,
        directory: dirname(response.filePath),
      },
    });
  } catch (error: unknown) {
    pushExportProgress(event, {
      status: 'error',
      processed: 0,
      total: 0,
      bytesWritten: 0,
      totalBytes: 0,
      currentLabel: '',
      message: toErrorMessage(error),
    });

    event.reply(CONSTANTS.API.POST_EXPORT_REPLAY, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

/**
 * Zips every session in a weekend, one directory per session.
 *
 * Built on top of session export rather than replacing it: a single replay and
 * its log is a pairing with nothing to resolve, while a weekend has to decide
 * what a directory is called, what happens when sibling sessions resolve to the
 * same result log, and what to do with a session that has no log at all.
 *
 * A session with no matched log is left out rather than failing the export. A
 * .Vcr on its own is the half-a-hand-off this feature exists to stop, but one
 * unmatched practice session is no reason to refuse a steward the other four —
 * the weekend manifest names what was omitted so the far side is not misled.
 */
export const postExportWeekend = async (
  event: Electron.IpcMainEvent,
  request?: ExportWeekendRequest,
) => {
  try {
    const sessions = request?.sessions ?? [];

    if (sessions.length === 0) {
      throw new Error('No sessions were provided to export.');
    }

    const imported = readImportedStore();
    const sources: WeekendSessionSource[] = [];
    const omittedSessions: OmittedSession[] = [];

    for (const session of sessions) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const { vcrPath, logPath } = await resolveExportPaths(
          session,
          imported,
        );
        // eslint-disable-next-line no-await-in-loop
        const { vcrSize, logSize } = await measureSessionFiles(
          vcrPath,
          logPath,
        );

        sources.push({ request: session, vcrPath, logPath, vcrSize, logSize });
      } catch (error: unknown) {
        omittedSessions.push({
          replayName: session.replayName,
          session: session.session,
          reason: toErrorMessage(error),
        });
      }
    }

    if (sources.length === 0) {
      throw new Error(
        'None of the sessions in this weekend have both a replay file and a result log.',
      );
    }

    const { entries, totalBytes } = buildWeekendLayout(sources);

    const response = await dialog.showSaveDialog({
      title: 'Export weekend',
      defaultPath: buildWeekendFileName(
        request?.weekendLabel ?? '',
        request?.timestamp ?? 0,
      ),
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    });

    if (response.canceled || !response.filePath) {
      event.reply(CONSTANTS.API.POST_EXPORT_WEEKEND, {
        status: 'success',
        data: { canceled: true },
      });
      return;
    }

    await assertFreeSpace(
      dirname(response.filePath),
      totalBytes,
      'export this weekend',
    );

    const manifest = buildWeekendManifest(
      {
        weekendLabel: request?.weekendLabel ?? '',
        timestamp: request?.timestamp ?? 0,
        sessions,
      },
      entries,
      omittedSessions,
    );

    const archiveEntries: ArchiveEntry[] = [
      {
        source: {
          buffer: Buffer.from(JSON.stringify(manifest, null, 2)),
        },
        entryName: EXPORT_MANIFEST_NAME,
      },
    ];

    for (const entry of entries) {
      // The session directory the per-session manifest already sits in, so the
      // capture lands beside the replay it belongs to rather than at the root.
      const liveEntry = buildLiveArchiveEntry(
        entry.request,
        entry.manifestEntryName.slice(
          0,
          entry.manifestEntryName.lastIndexOf('/') + 1,
        ),
      );

      archiveEntries.push(
        {
          source: { filePath: entry.vcrPath },
          entryName: entry.vcrEntryName,
        },
        {
          source: { filePath: entry.logPath },
          entryName: entry.logEntryName,
        },
        ...(liveEntry ? [liveEntry.entry] : []),
        {
          source: {
            buffer: Buffer.from(
              JSON.stringify(
                buildExportManifest(
                  entry.request,
                  entry.vcrPath,
                  entry.logPath,
                  liveEntry?.summary ?? null,
                ),
                null,
                2,
              ),
            ),
          },
          entryName: entry.manifestEntryName,
        },
      );
    }

    const steps: ProgressStep[] = entries.map((entry) => ({
      label: entry.request.replayName,
      bytes: entry.vcrSize + entry.logSize,
    }));

    await writeArchive(
      archiveEntries,
      response.filePath,
      createProgressPusher(event, steps, totalBytes),
    );

    pushExportProgress(event, {
      status: 'success',
      processed: entries.length,
      total: entries.length,
      bytesWritten: totalBytes,
      totalBytes,
      currentLabel: '',
    });

    event.reply(CONSTANTS.API.POST_EXPORT_WEEKEND, {
      status: 'success',
      data: {
        canceled: false,
        filePath: response.filePath,
        directory: dirname(response.filePath),
        exported: entries.length,
        omitted: omittedSessions,
      },
    });
  } catch (error: unknown) {
    pushExportProgress(event, {
      status: 'error',
      processed: 0,
      total: 0,
      bytesWritten: 0,
      totalBytes: 0,
      currentLabel: '',
      message: toErrorMessage(error),
    });

    event.reply(CONSTANTS.API.POST_EXPORT_WEEKEND, {
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
  /**
   * Echoed back untouched so the bulk preview knows which row asked.
   *
   * The two-file dialog leaves it unset — it only ever has one of each. Opaque
   * to this process: it is the renderer's own row id, never used as a path.
   */
  rowId?: string;
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
        data: {
          canceled: true,
          kind: request?.kind ?? 'replay',
          rowId: request?.rowId ?? '',
        },
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
          rowId: request?.rowId ?? '',
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
        rowId: request?.rowId ?? '',
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
  /** Optional note about where this hand-off came from. */
  note?: string;
}

/**
 * The telemetry flag for a replay the user picked by hand.
 *
 * The bulk paths get this from the manifest scan; there is no scan here, so the
 * session manifest beside the .Vcr is read on its own. Absent for a loose
 * replay, which is the ordinary case and simply leaves the flag unknown.
 */
const readSiblingTelemetryFlag = async (
  vcrPath: string,
): Promise<boolean | null> => {
  const parsed = await readManifestFile(
    join(dirname(vcrPath), EXPORT_MANIFEST_NAME),
  );

  return (
    parsed?.sessions.find(
      (entry) => entry.vcrPath.toLowerCase() === vcrPath.toLowerCase(),
    )?.includesTelemetry ?? null
  );
};

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

  const liveData = await readLiveDataSidecar(
    vcrPath,
    await readSiblingTelemetryFlag(vcrPath),
  );

  return { trailer, candidate, validation, liveData };
};

export const postValidateImportPair = async (
  event: Electron.IpcMainEvent,
  request?: ImportPairRequest,
) => {
  try {
    if (!request?.vcrPath || !request?.logPath) {
      throw new Error('Both a replay file and a result log are required.');
    }

    const { validation, liveData } = await buildPairValidation(request);

    event.reply(CONSTANTS.API.POST_VALIDATE_IMPORT_PAIR, {
      status: 'success',
      data: { ...validation, liveData },
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

    const { trailer, candidate, validation, liveData } =
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
      // The user picked both files themselves; there is nothing to consult.
      manifest: null,
      liveData,
    };

    const { outcomes, imported } = await importReplays({
      rows: [row],
      selections: [
        {
          id: row.id,
          logPath: candidate.filePath,
          method: 'manual',
          confidence: validation.confidence,
          note: request.note,
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

    /*
      Same restore the bulk paths run, for the same reason.

      Picking the two files by hand is a statement about the pairing, not a
      refusal of anything else in the folder — someone who extracted a Steward
      archive and reached for the .Vcr and the .xml has the capture sitting
      right beside them. Skipping it here made this path silently produce a
      worse import than the folder scan over the very same files.
    */
    await restoreImportedLiveData([row], outcomes);

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
