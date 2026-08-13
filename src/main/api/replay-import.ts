import { createHash } from 'crypto';
import { execFile } from 'child_process';
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
} from 'fs/promises';
import { basename, dirname, join } from 'path';
import { promisify } from 'util';
import { ImportedReplayRecord, ImportedReplayStore, SessionType } from '@types';
import { generateReplayHash } from '../util';
import { assertFreeSpace } from './disk-space';
import { scanManifests } from './import-manifest';
import { EXPORT_LIVE_DATA_NAME, OmittedSession } from './replay-export';
import { readVcrTrailer, VcrTrailer } from './vcr-metadata';
import {
  LogCandidate,
  PairingResult,
  scoreLogCandidates,
} from './replay-import-match';

const execFileAsync = promisify(execFile);

/** Hashed from each end plus the size — enough to catch a replaced file. */
const FINGERPRINT_SAMPLE_BYTES = 1024 * 1024;

const VCR_EXTENSION = /\.vcr$/i;
const LOG_EXTENSION = /\.xml$/i;

/** An in-progress recording, not an importable replay. */
const TEMP_RECORDING = /^_vcr\d+\.tmp$/i;

export interface ImportPreviewRow {
  /** Stable within one preview, so the renderer can refer back to a row. */
  id: string;
  vcrPath: string;
  vcrFileName: string;
  replayName: string;
  sceneDesc: string;
  session: SessionType;
  size: number;
  trailer: VcrTrailer;
  pairing: PairingResult;
  /** Set when this replay has already been imported. */
  alreadyImportedHash: string | null;
  /**
   * The log and event time a Steward export manifest named for this replay.
   *
   * Present only when the hand-off came from this app. When it is, it settles
   * the pairing outright — including for a restarted race, whose sessions
   * nothing else can separate.
   */
  manifest: { logPath: string; timestamp: number } | null;
  /**
   * The captured session travelling with this replay, if one is beside it.
   *
   * Surfaced so a steward confirming an import knows evidence is arriving —
   * and, when the manifest says so, whether that evidence includes other
   * drivers' telemetry. The export side makes including traces a deliberate
   * opt-in; the receiving side should not have to infer what it was handed.
   */
  liveData: ImportLiveData | null;
}

export interface ImportLiveData {
  /**
   * Whether the capture carries trace windows, per the manifest.
   *
   * Null means the manifest did not say, not that traces are absent. The flag
   * is a courtesy; the capture's presence is established by the file itself.
   */
  includesTelemetry: boolean | null;
}

/**
 * The captured session sitting beside a replay, if there is one.
 *
 * Presence is decided by the file rather than by the manifest that names it,
 * because that is what the restore does: it reads
 * `EXPORT_LIVE_DATA_NAME` next to the .Vcr and consults nothing else. Trusting
 * the manifest here would let the preview promise evidence the import cannot
 * deliver — an archive whose capture was deleted after export being the
 * obvious way to produce one.
 */
export const readLiveDataSidecar = async (
  vcrPath: string,
  includesTelemetry: boolean | null = null,
): Promise<ImportLiveData | null> => {
  try {
    await stat(join(dirname(vcrPath), EXPORT_LIVE_DATA_NAME));
    return { includesTelemetry };
  } catch {
    return null;
  }
};

export interface ImportSelection {
  id: string;
  logPath: string;
  method: 'roster' | 'manual' | 'manifest';
  confidence: number | null;
  /**
   * Event time from a manifest, used in place of the log's root DateTime.
   *
   * The two agree to within seconds, but this is the value the exporting
   * machine built the replay's hash from, so preferring it makes a
   * Steward-to-Steward round trip land on the identity it started with.
   */
  timestamp?: number;
  /**
   * The steward's note for this replay.
   *
   * Per selection rather than per run, even though the bulk preview writes one
   * value across all of them: the note belongs to the replay once it is
   * imported, and carrying it here means per-row notes become a UI change
   * rather than a data migration.
   */
  note?: string;
}

export interface ImportOutcome {
  id: string;
  replayName: string;
  status: 'imported' | 'skipped' | 'failed';
  message?: string;
  hash?: string;
}

/**
 * Content fingerprint used to confirm, at deletion time, that a file is still
 * the one this app wrote. Sampling the ends is deliberate: these are 400 MB
 * files and hashing them in full would make deleting a weekend take minutes.
 */
export const fingerprintFile = async (filePath: string): Promise<string> => {
  const handle = await open(filePath, 'r');

  try {
    const { size } = await handle.stat();
    const sampleLength = Math.min(FINGERPRINT_SAMPLE_BYTES, size);
    const head = Buffer.alloc(sampleLength);
    const tail = Buffer.alloc(sampleLength);

    await handle.read(head, 0, sampleLength, 0);
    await handle.read(tail, 0, sampleLength, Math.max(0, size - sampleLength));

    return createHash('sha256')
      .update(String(size))
      .update(head)
      .update(tail)
      .digest('hex');
  } finally {
    await handle.close();
  }
};

/**
 * Sets a file's NTFS creation time.
 *
 * This is the whole mechanism the import depends on. LMU reports a replay's
 * creation time as its timestamp, and Windows assigns a fresh one on copy — so
 * without this every imported replay claims to have happened at the moment it
 * was pasted, and log matching, dashboard grouping and replay hashing all go
 * wrong together.
 *
 * Node cannot do it; `fs.utimes` only covers access and modified times.
 *
 * Values go in through the environment rather than as arguments. `$args` is
 * only populated by `-File`; with `-Command`, PowerShell appends trailing
 * arguments to the command *text*, so a path lands in the script as code —
 * `C:\Program Files (x86)\…` then fails to parse on the parentheses. Reading
 * `$env:` avoids quoting and escaping altogether, and leaves no way for a
 * replay name to be interpreted as PowerShell.
 *
 * The result is read back rather than trusted. A silent no-op here would date
 * every imported replay to the moment it was copied, which is exactly the bug
 * importing exists to fix, so it is worth one extra stat to be certain.
 */
export const setFileCreationTime = async (
  filePath: string,
  epochSeconds: number,
): Promise<void> => {
  const iso = new Date(epochSeconds * 1000).toISOString();

  await execFileAsync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$ErrorActionPreference = "Stop"; ' +
        '$item = Get-Item -LiteralPath $env:LMU_STEWARD_TARGET_PATH; ' +
        '$item.CreationTimeUtc = ' +
        '[datetime]::Parse($env:LMU_STEWARD_CREATED_AT).ToUniversalTime()',
    ],
    {
      windowsHide: true,
      env: {
        ...process.env,
        LMU_STEWARD_TARGET_PATH: filePath,
        LMU_STEWARD_CREATED_AT: iso,
      },
    },
  );

  const { birthtimeMs } = await stat(filePath);
  const appliedSeconds = Math.round(birthtimeMs / 1000);

  // NTFS stores creation time far more precisely than a second; allow for the
  // rounding rather than demanding an exact match.
  if (Math.abs(appliedSeconds - epochSeconds) > 1) {
    throw new Error(
      `Could not set the replay's creation date. Expected ${iso}, but the file reports ${new Date(
        birthtimeMs,
      ).toISOString()}.`,
    );
  }
};

const readTextHead = (value: string, tag: string): string => {
  const match = value.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1].trim() : '';
};

const decodeXmlText = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const resolveLogSession = (xml: string): SessionType | null => {
  if (/<Race>/.test(xml)) {
    return 'RACE';
  }
  if (/<Qualify>/.test(xml)) {
    return 'QUALIFY';
  }
  if (/<Practice1>/.test(xml)) {
    return 'PRACTICE';
  }
  return null;
};

/**
 * Reads what pairing needs out of a result log: the session, the event's root
 * DateTime, the track, and the grid.
 *
 * The root <DateTime> specifically — each session carries its own, and it is the
 * root one that corresponds to a replay's timestamp. Taking the last match would
 * reintroduce the bug this feature exists to fix.
 */
export const readLogCandidate = async (
  filePath: string,
  options: { includeIncidentTimes?: boolean } = {},
): Promise<LogCandidate | null> => {
  try {
    const xml = await readFile(filePath, 'utf-8');
    const session = resolveLogSession(xml);

    if (!session) {
      return null;
    }

    const rootDateTime = xml.match(/<DateTime>(\d+)<\/DateTime>/);

    const driverNames = [
      ...xml.matchAll(/<Driver>[\s\S]*?<Name>([^<]*)<\/Name>/g),
    ].map((match) => decodeXmlText(match[1]).trim());

    return {
      fileName: basename(filePath),
      filePath,
      session,
      eventDateTime: rootDateTime ? Number(rootDateTime[1]) : null,
      trackVenue: readTextHead(xml, 'TrackVenue'),
      trackCourse: readTextHead(xml, 'TrackCourse'),
      trackEvent: readTextHead(xml, 'TrackEvent'),
      driverNames,
      /*
       * Off by default. Import pairs on the roster and has no use for these,
       * and a bulk preview reads hundreds of logs — several of which may be
       * 29 MB — so nothing here should do work nobody asked for.
       */
      incidentTimes: options.includeIncidentTimes
        ? [...xml.matchAll(/<Incident\s+et="([\d.]+)"/g)].map((match) =>
            Number(match[1]),
          )
        : undefined,
    };
  } catch {
    return null;
  }
};

const collectFiles = async (
  directory: string,
  matcher: RegExp,
): Promise<string[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        // eslint-disable-next-line no-await-in-loop
        files.push(...(await collectFiles(entryPath, matcher)));
        continue;
      }

      if (matcher.test(entry.name) && !TEMP_RECORDING.test(entry.name)) {
        files.push(entryPath);
      }
    }

    return files;
  } catch {
    return [];
  }
};

export interface ScanImportSourceArgs {
  sourceDirectory: string;
  /** The steward's own log directory, searched alongside the hand-off. */
  existingLogDirectory?: string;
  imported: ImportedReplayStore;
}

export interface ImportScanResult {
  rows: ImportPreviewRow[];
  /** How many rows a manifest settled, so the user knows why nothing scored. */
  manifestSessionCount: number;
  /**
   * Sessions the exporting side could not include. Reported because a steward
   * looking for a race that was never in the archive would otherwise have no
   * way to tell that from a scan that missed it.
   */
  omittedSessions: OmittedSession[];
}

/**
 * Builds the preview. Nothing is written — this reads trailers and logs, pairs
 * them, and hands the result back for the user to confirm.
 *
 * A Steward manifest short-circuits pairing for the replays it names. That is
 * not an optimisation: a restarted race puts several sessions in one weekend
 * that share an event time, a track, a session type and an identical grid, and
 * no automatic axis separates them. The manifest is the only thing that does.
 */
export const scanImportSource = async ({
  sourceDirectory,
  existingLogDirectory,
  imported,
}: ScanImportSourceArgs): Promise<ImportScanResult> => {
  const manifestScan = await scanManifests(sourceDirectory);
  const vcrPaths = await collectFiles(sourceDirectory, VCR_EXTENSION);
  const logPaths = [
    ...(await collectFiles(sourceDirectory, LOG_EXTENSION)),
    ...(existingLogDirectory
      ? await collectFiles(existingLogDirectory, LOG_EXTENSION)
      : []),
  ];

  const logCandidates = (
    await Promise.all(logPaths.map((logPath) => readLogCandidate(logPath)))
  ).filter((candidate): candidate is LogCandidate => candidate !== null);

  const importedByVcrPath = new Map(
    Object.values(imported).map((record) => [
      record.vcrPath.toLowerCase(),
      record.hash,
    ]),
  );

  const candidatesByPath = new Map(
    logCandidates.map((candidate) => [
      candidate.filePath.toLowerCase(),
      candidate,
    ]),
  );

  const rows: ImportPreviewRow[] = [];
  let manifestSessionCount = 0;

  for (const vcrPath of vcrPaths) {
    // eslint-disable-next-line no-await-in-loop
    const trailer = await readVcrTrailer(vcrPath);

    if (!trailer) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const { size } = await stat(vcrPath);
    const vcrFileName = basename(vcrPath);
    const replayName = vcrFileName.replace(VCR_EXTENSION, '');

    const sessionCandidates = logCandidates.filter(
      (candidate) => candidate.session === trailer.session,
    );

    /*
     * Only honoured when the log it names is actually there. A manifest whose
     * files were removed or renamed after export is worse than none, so a
     * dangling one falls back to scoring rather than proposing a missing file.
     */
    const manifestEntry = manifestScan.sessions.get(vcrPath.toLowerCase());
    const manifestCandidate = manifestEntry
      ? candidatesByPath.get(manifestEntry.logPath.toLowerCase())
      : undefined;

    let pairing: PairingResult;
    let manifest: ImportPreviewRow['manifest'] = null;

    if (manifestEntry && manifestCandidate) {
      manifestSessionCount += 1;
      manifest = {
        logPath: manifestCandidate.filePath,
        timestamp: manifestEntry.timestamp,
      };
      pairing = {
        ranked: [
          {
            candidate: manifestCandidate,
            confidence: 1,
            intersection: 0,
            vcrCount: trailer.drivers.length,
            logCount: manifestCandidate.driverNames.length,
          },
          ...scoreLogCandidates(trailer, sessionCandidates).ranked.filter(
            (ranked) =>
              ranked.candidate.filePath.toLowerCase() !==
              manifestCandidate.filePath.toLowerCase(),
          ),
        ],
        proposed: null,
        reason: 'manifest',
      };
      [pairing.proposed] = pairing.ranked;
    } else {
      pairing = scoreLogCandidates(trailer, sessionCandidates);
    }

    rows.push({
      id: vcrPath,
      vcrPath,
      vcrFileName,
      replayName,
      sceneDesc: trailer.sceneDesc,
      session: trailer.session,
      size,
      trailer,
      pairing,
      alreadyImportedHash: importedByVcrPath.get(vcrPath.toLowerCase()) ?? null,
      manifest,
      /*
       * Keyed off `manifestEntry` rather than the resolved pairing: a replay
       * whose log went missing still says what it brought with it, and saying
       * so is part of explaining why the row cannot be imported.
       */
      // eslint-disable-next-line no-await-in-loop
      liveData: await readLiveDataSidecar(
        vcrPath,
        manifestEntry?.includesTelemetry ?? null,
      ),
    });
  }

  return {
    rows,
    manifestSessionCount,
    omittedSessions: manifestScan.omittedSessions,
  };
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Marker appended to an imported replay whose name is already taken.
 *
 * Collisions are the normal case, not an edge case. LMU names replays
 * `<Track> <SessionCode><N>` where N counts up per install, so any steward who
 * has raced at a track already holds the names an incoming league replay from
 * that track will arrive with.
 *
 * The marker is deliberately visible rather than a silent counter bump: it
 * shows up in LMU's own replay browser, so a steward can tell an imported
 * replay from one they recorded themselves without leaving the game.
 */
const IMPORT_NAME_MARKER = 'imported';

/** Bounded so a pathological directory cannot spin here forever. */
const MAX_NAME_ATTEMPTS = 200;

export interface ImportDestination {
  fileName: string;
  replayName: string;
  filePath: string;
  /** True when the requested name was taken and a marker was appended. */
  renamed: boolean;
}

const buildCandidateName = (baseName: string, attempt: number): string => {
  if (attempt === 0) {
    return baseName;
  }

  return attempt === 1
    ? `${baseName} (${IMPORT_NAME_MARKER})`
    : `${baseName} (${IMPORT_NAME_MARKER} ${attempt})`;
};

/**
 * Finds a free name in the replay directory.
 *
 * This is how "never overwrite" is honoured: rather than refusing an import
 * because the steward already has a replay by that name — which would destroy
 * their own recording if we replaced it, and strand the import if we stopped —
 * the copy lands beside it under a name that is free.
 */
export const resolveDestinationName = async (
  replayDirectory: string,
  vcrFileName: string,
): Promise<ImportDestination> => {
  const baseName = vcrFileName.replace(/\.vcr$/i, '');

  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
    const replayName = buildCandidateName(baseName, attempt);
    const fileName = `${replayName}.Vcr`;
    const filePath = join(replayDirectory, fileName);

    // eslint-disable-next-line no-await-in-loop
    if (!(await fileExists(filePath))) {
      return { fileName, replayName, filePath, renamed: attempt > 0 };
    }
  }

  throw new Error(
    `Could not find a free name for "${vcrFileName}" in the LMU replay folder.`,
  );
};

export interface ImportReplaysArgs {
  rows: ImportPreviewRow[];
  selections: ImportSelection[];
  replayDirectory: string;
  logDirectory: string;
  imported: ImportedReplayStore;
  /**
   * Reads the log's session summary — incident, penalty and track-limit counts,
   * duration, car classes. The dashboard renders every replay from this, so an
   * import without it shows a card with nothing on it.
   *
   * Injected rather than imported so this module stays free of the replay
   * store, which the parser's module initialises on load.
   */
  parseLogSummary?: (filePath: string) => Promise<unknown>;
  onProgress?: (progress: {
    processed: number;
    total: number;
    /** The replay just handled, so the dialog can name what it is working on. */
    currentLabel?: string;
  }) => void;
}

export interface ImportReplaysResult {
  outcomes: ImportOutcome[];
  imported: ImportedReplayStore;
}

/**
 * Copies each confirmed replay and its log into the LMU installation, stamps
 * the replay's creation time to the log's event time, and records what it
 * wrote.
 *
 * Each row is independent: a row that fails removes whatever it wrote and is
 * reported, while the rest continue. A half-written import is worse than a
 * missing one, because the leftover file has no record and cannot be deleted
 * from the app.
 */
export const importReplays = async ({
  rows,
  selections,
  replayDirectory,
  logDirectory,
  imported,
  parseLogSummary,
  onProgress,
}: ImportReplaysArgs): Promise<ImportReplaysResult> => {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const nextImported: ImportedReplayStore = { ...imported };
  const outcomes: ImportOutcome[] = [];

  await mkdir(replayDirectory, { recursive: true });
  await mkdir(logDirectory, { recursive: true });

  /*
   * Checked once, up front, against the whole selection. A weekend of imports
   * is several GB, and running out of room half way through leaves truncated
   * .Vcr files in the LMU install — files the app has no record of and so
   * cannot offer to remove.
   */
  await assertFreeSpace(
    replayDirectory,
    selections.reduce(
      (total, selection) => total + (rowsById.get(selection.id)?.size ?? 0),
      0,
    ),
    'import these replays',
  );

  let processed = 0;

  for (const selection of selections) {
    const row = rowsById.get(selection.id);
    processed += 1;

    if (!row) {
      outcomes.push({
        id: selection.id,
        replayName: selection.id,
        status: 'skipped',
        message: 'Replay was no longer part of the import.',
      });
      onProgress?.({ processed, total: selections.length });
      continue;
    }

    const logFileName = basename(selection.logPath);
    const destinationLogPath = join(logDirectory, logFileName);
    let destinationVcrPath = '';
    let wroteVcr = false;
    let wroteLog = false;

    try {
      /*
       * Resolved before anything else, because the destination name is what LMU
       * will report and therefore what the replay's hash must be built from.
       * Deriving the hash from the source name would leave a record that never
       * matches the live API — the replay would import and then refuse to play.
       */
      // eslint-disable-next-line no-await-in-loop
      const destination = await resolveDestinationName(
        replayDirectory,
        row.vcrFileName,
      );

      destinationVcrPath = destination.filePath;

      // eslint-disable-next-line no-await-in-loop
      const logCandidate = await readLogCandidate(selection.logPath);

      /*
       * A manifest's event time wins over the log's root DateTime. The two
       * agree to within seconds, but the manifest carries what the exporting
       * machine's LMU reported for this exact replay, which is what its hash
       * was built from — so a Steward-to-Steward round trip lands back on the
       * identity it started with rather than a few seconds off it.
       */
      const eventDateTime =
        selection.method === 'manifest' && selection.timestamp
          ? selection.timestamp
          : logCandidate?.eventDateTime;

      if (!eventDateTime) {
        throw new Error(
          'The selected log has no event date to import against.',
        );
      }

      if (!logCandidate) {
        throw new Error('The selected log could not be read.');
      }

      // eslint-disable-next-line no-await-in-loop
      await copyFile(row.vcrPath, destinationVcrPath);
      wroteVcr = true;

      // eslint-disable-next-line no-await-in-loop
      if (!(await fileExists(destinationLogPath))) {
        // eslint-disable-next-line no-await-in-loop
        await copyFile(selection.logPath, destinationLogPath);
        wroteLog = true;
      }

      // eslint-disable-next-line no-await-in-loop
      await setFileCreationTime(destinationVcrPath, eventDateTime);

      // Built from the destination name, which is the one LMU will report.
      const hash = generateReplayHash({
        metadata: { sceneDesc: row.sceneDesc, session: row.session },
        replayName: destination.replayName,
        timestamp: eventDateTime,
        size: row.size,
      });

      /* eslint-disable no-await-in-loop */
      const record: ImportedReplayRecord = {
        hash,
        replayName: destination.replayName,
        originalReplayName: row.replayName,
        sceneDesc: row.sceneDesc,
        session: row.session,
        timestamp: eventDateTime,
        vcrFileName: destination.fileName,
        vcrPath: destinationVcrPath,
        size: row.size,
        logFileName,
        logPath: destinationLogPath,
        logWasWritten: wroteLog,
        vcrFingerprint: await fingerprintFile(destinationVcrPath),
        logFingerprint: await fingerprintFile(destinationLogPath),
        importedAt: Date.now(),
        // Trimmed here rather than in the renderer, so a note that is only
        // whitespace does not put an empty note marker on the row.
        note: selection.note?.trim() || undefined,
        logData: parseLogSummary
          ? ((await parseLogSummary(destinationLogPath)) ?? null)
          : null,
        origin: {
          trackFolder: row.trailer.trackFolder,
          trackVersion: row.trailer.trackVersion,
          trackContentHash: row.trailer.trackContentHash,
          installPath: row.trailer.originInstallPath,
        },
        match: {
          method: selection.method,
          confidence: selection.confidence,
          rosterOverlap: row.pairing.proposed
            ? {
                intersection: row.pairing.proposed.intersection,
                vcrCount: row.pairing.proposed.vcrCount,
                logCount: row.pairing.proposed.logCount,
              }
            : null,
        },
      };
      /* eslint-enable no-await-in-loop */

      nextImported[hash] = record;
      outcomes.push({
        id: row.id,
        replayName: row.replayName,
        status: 'imported',
        hash,
      });
    } catch (error: unknown) {
      /* eslint-disable no-await-in-loop */
      if (wroteVcr) {
        await rm(destinationVcrPath, { force: true });
      }
      if (wroteLog) {
        await rm(destinationLogPath, { force: true });
      }
      /* eslint-enable no-await-in-loop */

      outcomes.push({
        id: row.id,
        replayName: row.replayName,
        status: 'failed',
        message:
          error instanceof Error ? error.message : 'Unable to import replay.',
      });
    }

    onProgress?.({
      processed,
      total: selections.length,
      currentLabel: row.replayName,
    });
  }

  return { outcomes, imported: nextImported };
};

export interface DeleteImportedResult {
  deleted: string[];
  skipped: Array<{ hash: string; reason: string }>;
  imported: ImportedReplayStore;
}

/**
 * Removes the files an import wrote, then its records.
 *
 * Only paths held in the store are ever touched — the renderer sends hashes and
 * paths are resolved here, so a path can never arrive from outside. Each file is
 * re-fingerprinted first: a mismatch means it was replaced since import, and
 * something the app did not write is not the app's to delete.
 */
export const deleteImportedReplays = async (
  hashes: string[],
  imported: ImportedReplayStore,
): Promise<DeleteImportedResult> => {
  const nextImported: ImportedReplayStore = { ...imported };
  const deleted: string[] = [];
  const skipped: Array<{ hash: string; reason: string }> = [];

  for (const hash of hashes) {
    const record = nextImported[hash];

    if (!record) {
      skipped.push({ hash, reason: 'This replay is not an imported replay.' });
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const currentFingerprint = await fingerprintFile(record.vcrPath);

      if (currentFingerprint !== record.vcrFingerprint) {
        skipped.push({
          hash,
          reason:
            'The replay file has changed since it was imported, so it was left alone.',
        });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await rm(record.vcrPath, { force: true });

      /*
       * Sibling practice, qualifying and race sessions share one result log.
       * Removing it because one of them was deleted would strip the log data
       * from the others.
       */
      const logStillReferenced = Object.values(nextImported).some(
        (other) =>
          other.hash !== hash &&
          other.logPath.toLowerCase() === record.logPath.toLowerCase(),
      );

      /*
       * Only logs this import wrote are ever removed. A steward who raced in
       * the event already has its result log, so importing another driver's
       * replay of that race copies nothing — deleting the log here would
       * destroy a file the app never placed.
       *
       * Records written before this flag existed have it undefined, which is
       * treated as "not ours": leaving a stale log behind is recoverable,
       * deleting someone's own is not.
       */
      if (record.logWasWritten === true && !logStillReferenced) {
        // eslint-disable-next-line no-await-in-loop
        const logFingerprint = await fingerprintFile(record.logPath).catch(
          () => null,
        );

        if (logFingerprint === record.logFingerprint) {
          // eslint-disable-next-line no-await-in-loop
          await rm(record.logPath, { force: true });
        }
      }

      delete nextImported[hash];
      deleted.push(hash);
    } catch (error: unknown) {
      skipped.push({
        hash,
        reason:
          error instanceof Error ? error.message : 'Unable to delete replay.',
      });
    }
  }

  return { deleted, skipped, imported: nextImported };
};
