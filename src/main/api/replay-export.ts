import { createWriteStream } from 'fs';
import { rm } from 'fs/promises';
import { basename } from 'path';
import { ZipFile } from 'yazl';

/** Written into every export so the far side can skip pairing entirely. */
export const EXPORT_MANIFEST_NAME = 'lmu-steward-export.json';

/**
 * What the renderer sends to identify a session. Identifiers only — every
 * filesystem path is resolved in the main process, because a renderer
 * assembling paths by string concatenation is how a template-literal escaping
 * slip once broke every export.
 */
export interface ExportReplayRequest {
  hash: string;
  replayName: string;
  sceneDesc: string;
  session: string;
  timestamp: number;
  logDataFileName: string;
  /**
   * Whether captured trace windows travel with the archive.
   *
   * Off unless the user says otherwise. A session export already carries driver
   * names and Steam IDs; traces go further — they are per-driver throttle,
   * brake and steering inputs, which is telemetry a driver may not expect a
   * third party to redistribute. Derived evidence (closing speeds, off-track,
   * blue-flag duration) always travels: it is a summary, and it is most of what
   * makes an incident adjudicable on the receiving side.
   */
  includeLiveTelemetry?: boolean;
}

export interface ExportWeekendRequest {
  /** Track display name, used only to name the archive. Never a path. */
  weekendLabel: string;
  /** The weekend's event time, used only to date the archive's name. */
  timestamp: number;
  sessions: ExportReplayRequest[];
}

/** The captured session travelling with an archive, if there is one. */
export const EXPORT_LIVE_DATA_NAME = 'lmu-steward-live.json';

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
  /** A captured session is included alongside the replay. */
  liveDataFileName?: string;
  /**
   * Whether the included capture carries trace windows.
   *
   * Recorded because it was a choice someone made about other people's
   * telemetry, and the archive should say which way it went rather than
   * leaving the receiving steward to infer it from what is missing.
   */
  includesLiveTelemetry?: boolean;
}

export const buildExportManifest = (
  request: ExportReplayRequest,
  vcrPath: string,
  logPath: string,
  liveData?: { includesTelemetry: boolean } | null,
): ExportManifest => ({
  createdBy: 'lmu-steward',
  version: 1,
  replayName: request.replayName,
  sceneDesc: request.sceneDesc,
  session: request.session,
  timestamp: request.timestamp,
  vcrFileName: basename(vcrPath),
  logFileName: basename(logPath),
  ...(liveData
    ? {
        liveDataFileName: EXPORT_LIVE_DATA_NAME,
        includesLiveTelemetry: liveData.includesTelemetry,
      }
    : {}),
});

/*
 * Archive layout
 * --------------
 * A weekend gets one directory per session:
 *
 *   Laguna Seca - 2026-07-28.zip
 *     lmu-steward-export.json                       <- the weekend manifest
 *     01 Practice - WeatherTech Raceway Laguna Seca P1 3/
 *       WeatherTech Raceway Laguna Seca P1 3.Vcr
 *       2026_07_28_21_56_13-00P1.xml
 *       lmu-steward-export.json                     <- a session manifest
 *     02 Qualifying - ...
 *     03 Race - ...
 *
 * The directory name carries the replay name rather than just the session
 * type, because a restarted race puts several RACE sessions in one weekend —
 * four of them in one real Daytona weekend — and "Race/" would collide for all
 * but the first. Replay names are file names in the LMU replay folder, so they
 * are already unique; the numeric prefix only fixes the running order, which
 * alphabetical sorting would otherwise get wrong past nine sessions.
 */

/** Windows-reserved characters plus separators, none of which LMU can produce. */
const UNSAFE_ARCHIVE_CHARACTERS = /[\\/:*?"<>|]/g;

/** Keeps extracted paths clear of MAX_PATH on the receiving machine. */
const MAX_DIRECTORY_NAME_LENGTH = 80;

/** Compared by code point rather than matched, to keep the source ASCII. */
const LAST_CONTROL_CODE_POINT = 0x1f;

/**
 * A name that is safe as a zip entry and as a file name once extracted.
 *
 * Nothing LMU writes needs this — replay names come from file names on disk, so
 * they cannot already hold a separator — but the label reaching the archive
 * root comes from track metadata, and an export must never be able to write
 * outside the archive.
 */
export const sanitizeArchiveName = (
  value: string,
  fallback: string,
): string => {
  const cleaned = [...value]
    .filter(
      (character) => (character.codePointAt(0) ?? 0) > LAST_CONTROL_CODE_POINT,
    )
    .join('')
    .replace(UNSAFE_ARCHIVE_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DIRECTORY_NAME_LENGTH)
    // Windows silently drops a trailing dot or space from a directory name.
    .replace(/[. ]+$/, '');

  return cleaned || fallback;
};

const SESSION_LABELS: Record<string, string> = {
  RACE: 'Race',
  QUALIFY: 'Qualifying',
  PRACTICE: 'Practice',
};

/**
 * Chronological, so the numeric prefix means something: a weekend runs
 * practice, then qualifying, then the race. This is the reverse of the
 * dashboard's ordering, which puts the race first because that is what a
 * steward opens.
 */
const SESSION_RUNNING_ORDER: Record<string, number> = {
  PRACTICE: 0,
  QUALIFY: 1,
  RACE: 2,
};

/**
 * Orders restarts by their trailing counter rather than as text, so "R1 10"
 * follows "R1 9" instead of preceding it.
 */
const compareReplayNames = (a: string, b: string): number => {
  const aMatch = a.match(/^(.*?)(\d+)$/);
  const bMatch = b.match(/^(.*?)(\d+)$/);

  if (aMatch && bMatch && aMatch[1] === bMatch[1]) {
    return Number(aMatch[2]) - Number(bMatch[2]);
  }

  return a.localeCompare(b);
};

export interface WeekendSessionSource {
  request: ExportReplayRequest;
  vcrPath: string;
  logPath: string;
  /** Byte sizes, so progress and the free-disk check have something to work on. */
  vcrSize: number;
  logSize: number;
}

export interface WeekendSessionEntry {
  request: ExportReplayRequest;
  directory: string;
  vcrPath: string;
  logPath: string;
  vcrEntryName: string;
  logEntryName: string;
  manifestEntryName: string;
  vcrSize: number;
  logSize: number;
  /**
   * Other session directories holding a copy of this same log file.
   *
   * Sibling sessions from one event routinely resolve to the same result XML,
   * and the copy is duplicated into each session directory rather than stored
   * once at the root: a session directory is then a complete export on its own,
   * so pulling one out of the archive never produces a .Vcr with no log — the
   * half-a-hand-off this whole feature exists to stop. Result logs run to a few
   * hundred KB against several GB of replay, so the duplication costs nothing
   * worth counting. This field is what keeps the archive honest about it.
   */
  logSharedWith: string[];
}

export interface WeekendLayout {
  entries: WeekendSessionEntry[];
  totalBytes: number;
}

/**
 * Assigns each session its directory and works out which sessions share a log.
 *
 * Pure, so the naming rules above can be asserted without touching a disk.
 */
export const buildWeekendLayout = (
  sources: WeekendSessionSource[],
): WeekendLayout => {
  const ordered = [...sources].sort((a, b) => {
    const aOrder =
      SESSION_RUNNING_ORDER[a.request.session] ?? Number.MAX_SAFE_INTEGER;
    const bOrder =
      SESSION_RUNNING_ORDER[b.request.session] ?? Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return compareReplayNames(a.request.replayName, b.request.replayName);
  });

  const usedDirectories = new Set<string>();
  const entries: WeekendSessionEntry[] = ordered.map((source, index) => {
    const label = SESSION_LABELS[source.request.session] ?? 'Session';
    const position = String(index + 1).padStart(2, '0');
    const base = sanitizeArchiveName(
      `${position} ${label} - ${source.request.replayName}`,
      `${position} ${label}`,
    );

    /*
     * Replay names are unique file names, so this only fires when sanitizing
     * or truncation has collapsed two of them together. Left in anyway: two
     * entries at one path in a zip is a silently lost session.
     */
    let directory = base;
    let attempt = 2;
    while (usedDirectories.has(directory.toLowerCase())) {
      directory = `${base} (${attempt})`;
      attempt += 1;
    }
    usedDirectories.add(directory.toLowerCase());

    const vcrFileName = basename(source.vcrPath);
    const logFileName = basename(source.logPath);

    return {
      request: source.request,
      directory,
      vcrPath: source.vcrPath,
      logPath: source.logPath,
      vcrEntryName: `${directory}/${vcrFileName}`,
      logEntryName: `${directory}/${logFileName}`,
      manifestEntryName: `${directory}/${EXPORT_MANIFEST_NAME}`,
      vcrSize: source.vcrSize,
      logSize: source.logSize,
      logSharedWith: [],
    };
  });

  for (const entry of entries) {
    entry.logSharedWith = entries
      .filter(
        (other) =>
          other !== entry &&
          other.logPath.toLowerCase() === entry.logPath.toLowerCase(),
      )
      .map((other) => other.directory);
  }

  return {
    entries,
    totalBytes: entries.reduce(
      (total, entry) => total + entry.vcrSize + entry.logSize,
      0,
    ),
  };
};

export interface WeekendManifestSession {
  directory: string;
  replayName: string;
  sceneDesc: string;
  session: string;
  timestamp: number;
  vcrFileName: string;
  logFileName: string;
  /** Directories holding a copy of the same log. Empty when it is not shared. */
  logSharedWith: string[];
}

export interface OmittedSession {
  replayName: string;
  session: string;
  reason: string;
}

export interface WeekendManifest {
  createdBy: 'lmu-steward';
  version: 2;
  kind: 'weekend';
  weekendLabel: string;
  timestamp: number;
  sessionCount: number;
  sessions: WeekendManifestSession[];
  /**
   * Sessions in the weekend that could not be included, so the far side can
   * tell a partial weekend from a complete one.
   */
  omittedSessions: OmittedSession[];
}

export const buildWeekendManifest = (
  request: ExportWeekendRequest,
  entries: WeekendSessionEntry[],
  omittedSessions: OmittedSession[],
): WeekendManifest => ({
  createdBy: 'lmu-steward',
  version: 2,
  kind: 'weekend',
  weekendLabel: request.weekendLabel,
  timestamp: request.timestamp,
  sessionCount: entries.length,
  sessions: entries.map((entry) => ({
    directory: entry.directory,
    replayName: entry.request.replayName,
    sceneDesc: entry.request.sceneDesc,
    session: entry.request.session,
    timestamp: entry.request.timestamp,
    vcrFileName: basename(entry.vcrPath),
    logFileName: basename(entry.logPath),
    logSharedWith: entry.logSharedWith,
  })),
  omittedSessions,
});

/**
 * The archive's default file name: track and date, which is how a steward
 * refers to a weekend. Sanitized because the label comes from track metadata
 * rather than from a file name.
 */
export const buildWeekendFileName = (
  weekendLabel: string,
  timestamp: number,
): string => {
  const date = new Date(timestamp * 1000);
  const datePart = Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : '';
  const label = sanitizeArchiveName(weekendLabel, 'Race weekend');

  return `${datePart ? `${label} - ${datePart}` : label}.zip`;
};

export interface ExportProgress {
  status: 'in-progress' | 'success' | 'error';
  /** Sessions fully written. */
  processed: number;
  total: number;
  bytesWritten: number;
  totalBytes: number;
  /** The session currently being written, for the progress line. */
  currentLabel: string;
  message?: string;
}

export interface ProgressStep {
  label: string;
  bytes: number;
}

/**
 * Turns a byte count into "which session are we on".
 *
 * yazl reports nothing per entry, so progress is taken from the bytes leaving
 * its output stream. Entries are written in the order they were added, so the
 * running total says which session the stream is inside. Pure, and separated
 * out because the arithmetic is the only part worth asserting.
 */
export const resolveProgressStep = (
  steps: ProgressStep[],
  bytesWritten: number,
): { processed: number; currentLabel: string } => {
  let consumed = 0;
  let processed = 0;

  for (const step of steps) {
    if (bytesWritten < consumed + step.bytes) {
      return { processed, currentLabel: step.label };
    }

    consumed += step.bytes;
    processed += 1;
  }

  return {
    processed: steps.length,
    currentLabel: steps.length > 0 ? steps[steps.length - 1].label : '',
  };
};

export interface ArchiveEntry {
  /** Path on disk, or a buffer for generated content such as a manifest. */
  source: { filePath: string } | { buffer: Buffer };
  /** Path inside the archive. Zip entry names always use forward slashes. */
  entryName: string;
}

/**
 * Writes a zip and reports progress as it goes.
 *
 * Entries are stored rather than deflated: .Vcr data is already packed, so
 * compressing several GB would be a long freeze for no meaningful size win.
 *
 * Progress is byte-based because that is all yazl exposes, and because with a
 * 250 MB practice session next to a 1 MB race a session count on its own would
 * sit still for minutes and then jump.
 */
export const writeArchive = async (
  entries: ArchiveEntry[],
  destination: string,
  onProgress?: (bytesWritten: number) => void,
): Promise<void> => {
  const zip = new ZipFile();

  for (const entry of entries) {
    if ('buffer' in entry.source) {
      zip.addBuffer(entry.source.buffer, entry.entryName, { compress: false });
    } else {
      zip.addFile(entry.source.filePath, entry.entryName, { compress: false });
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(destination);
      let bytesWritten = 0;

      zip.outputStream.on('data', (chunk: Buffer) => {
        bytesWritten += chunk.length;
        onProgress?.(bytesWritten);
      });

      zip.outputStream.on('error', reject);
      output.on('error', reject);
      output.on('close', () => resolve());

      zip.outputStream.pipe(output);
      /*
       * A single .Vcr can approach the 4 GB boundary, and a weekend passes it
       * comfortably, past which the classic zip end-of-central-directory cannot
       * address the archive.
       */
      zip.end({ forceZip64Format: true, comment: '' });
    });
  } catch (error: unknown) {
    /*
     * Whatever was written is a zip without a central directory: it carries the
     * .zip name and the size of a real archive, and nothing will open it. Left
     * on disk it is worse than no file at all, because the user has no way to
     * tell it apart from a finished export.
     */
    await rm(destination, { force: true }).catch(() => {});
    throw error;
  }
};
