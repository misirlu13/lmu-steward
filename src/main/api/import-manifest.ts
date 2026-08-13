import { readFile, readdir } from 'fs/promises';
import { dirname, join } from 'path';
import {
  EXPORT_MANIFEST_NAME,
  ExportManifest,
  OmittedSession,
  WeekendManifest,
} from './replay-export';

/**
 * Reads the manifests export writes back off disk.
 *
 * The shapes come from `replay-export.ts` rather than being restated here, so
 * the reader and the writer cannot drift apart.
 *
 * A manifest is the only thing that reliably separates the sessions of a
 * restarted race. Four races from one weekend share an event time, a track, a
 * session type and an identical grid — roster overlap cannot tell them apart
 * and neither can the date. Locally that is resolved by comparing the replay's
 * modified time to the log's, but modified time does not survive every transfer
 * path; one fixture file was re-dated in transit by whatever carried it. So
 * when a manifest is present it is believed outright and pairing is skipped;
 * when it is not, those rows go to the user rather than being guessed at.
 */

/** Refuses a file that is not plausibly a manifest before parsing it. */
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

export interface ManifestSessionEntry {
  /** Absolute path of the .Vcr this manifest describes. */
  vcrPath: string;
  /** Absolute path of the result log the exporter paired it with. */
  logPath: string;
  replayName: string;
  sceneDesc: string;
  session: string;
  /**
   * The event time the exporting machine reported for this replay.
   *
   * Preferred over the log's root DateTime when stamping. The two agree to
   * within a few seconds, and this one is what the replay's hash was built from
   * on the far side — using it makes a Steward-to-Steward round trip land on
   * the same identity it started with.
   */
  timestamp: number;
  /**
   * Whether the capture travelling with this replay carries trace windows.
   *
   * Null when the manifest did not say — a weekend manifest describes the
   * layout rather than the contents, and only the session manifest sitting in
   * the directory records the exporter's telemetry choice. Null is "unknown",
   * never "no": claiming traces are absent when the manifest simply predates
   * the field would misreport someone else's decision about their own data.
   */
  includesTelemetry: boolean | null;
}

export interface ManifestScan {
  /** Keyed by lower-cased absolute .Vcr path. */
  sessions: Map<string, ManifestSessionEntry>;
  /**
   * Sessions the exporting side could not include. Surfaced so a partial
   * weekend is distinguishable from a complete one — otherwise a steward has
   * no way to know the race they are looking for was never in the archive.
   */
  omittedSessions: OmittedSession[];
  /** How many manifests were found at all, for reporting. */
  manifestCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * A version 1 manifest has no `kind`, so its absence means "session". Written
 * that way because version 1 shipped before weekend export existed, and
 * archives holding one are already in stewards' hands.
 */
const isWeekendManifest = (value: Record<string, unknown>): boolean =>
  value.kind === 'weekend';

const isStewardManifest = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && value.createdBy === 'lmu-steward';

const asOptionalBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

const toSessionEntry = (
  directory: string,
  vcrFileName: string,
  logFileName: string,
  replayName: string,
  sceneDesc: string,
  session: string,
  timestamp: number,
  includesTelemetry: boolean | null,
): ManifestSessionEntry | null => {
  /*
   * File names only. A manifest is data from elsewhere, and a name carrying a
   * separator would let it point the import at a file outside the archive.
   */
  if (
    !vcrFileName ||
    !logFileName ||
    /[\\/]/.test(vcrFileName) ||
    /[\\/]/.test(logFileName)
  ) {
    return null;
  }

  return {
    vcrPath: join(directory, vcrFileName),
    logPath: join(directory, logFileName),
    replayName,
    sceneDesc,
    session,
    timestamp,
    includesTelemetry,
  };
};

/**
 * Reads one manifest file into the sessions it describes.
 *
 * A weekend manifest names a directory per session and the files inside it; a
 * session manifest describes the directory it sits in.
 */
export const readManifestFile = async (
  manifestPath: string,
): Promise<{
  sessions: ManifestSessionEntry[];
  omittedSessions: OmittedSession[];
} | null> => {
  let parsed: unknown;

  try {
    const raw = await readFile(manifestPath, 'utf-8');

    if (raw.length > MAX_MANIFEST_BYTES) {
      return null;
    }

    parsed = JSON.parse(raw);
  } catch {
    // A manifest that will not parse is treated as absent. Pairing still works.
    return null;
  }

  if (!isStewardManifest(parsed)) {
    return null;
  }

  const root = dirname(manifestPath);

  if (isWeekendManifest(parsed)) {
    const manifest = parsed as unknown as WeekendManifest;
    const sessions: ManifestSessionEntry[] = [];

    for (const entry of Array.isArray(manifest.sessions)
      ? manifest.sessions
      : []) {
      const directory = asString(entry?.directory);

      // The directory is a single archive-relative segment, never a path.
      if (!directory || /[\\/]/.test(directory)) {
        continue;
      }

      const session = toSessionEntry(
        join(root, directory),
        asString(entry?.vcrFileName),
        asString(entry?.logFileName),
        asString(entry?.replayName),
        asString(entry?.sceneDesc),
        asString(entry?.session),
        asNumber(entry?.timestamp),
        /*
         * A weekend manifest lists the layout, not what each directory holds.
         * The session manifest inside carries the telemetry flag and is read
         * after this one, so it fills the gap where there is one to fill.
         */
        null,
      );

      if (session) {
        sessions.push(session);
      }
    }

    return {
      sessions,
      omittedSessions: Array.isArray(manifest.omittedSessions)
        ? manifest.omittedSessions.filter((omitted) => isRecord(omitted))
        : [],
    };
  }

  const manifest = parsed as unknown as ExportManifest;
  const session = toSessionEntry(
    root,
    asString(manifest.vcrFileName),
    asString(manifest.logFileName),
    asString(manifest.replayName),
    asString(manifest.sceneDesc),
    asString(manifest.session),
    asNumber(manifest.timestamp),
    asOptionalBoolean(manifest.includesLiveTelemetry),
  );

  return { sessions: session ? [session] : [], omittedSessions: [] };
};

const collectManifestPaths = async (
  directory: string,
  depth = 0,
): Promise<string[]> => {
  // An export is two levels deep; anything past that is not one of ours.
  if (depth > 4) {
    return [];
  }

  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const found: string[] = [];

    for (const entry of entries) {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        // eslint-disable-next-line no-await-in-loop
        found.push(...(await collectManifestPaths(entryPath, depth + 1)));
        continue;
      }

      if (entry.name.toLowerCase() === EXPORT_MANIFEST_NAME) {
        found.push(entryPath);
      }
    }

    return found;
  } catch {
    return [];
  }
};

/**
 * Finds every manifest under a directory and indexes the sessions by .Vcr path.
 *
 * Session manifests are read after the weekend manifest and win on conflict:
 * both describe the same session, and the one sitting beside the files is the
 * one that cannot be wrong about where they are.
 */
export const scanManifests = async (
  directory: string,
): Promise<ManifestScan> => {
  const manifestPaths = await collectManifestPaths(directory);
  const sessions = new Map<string, ManifestSessionEntry>();
  const omittedSessions: OmittedSession[] = [];
  let manifestCount = 0;

  // Root-level manifests first, so a session manifest deeper in overwrites it.
  const ordered = [...manifestPaths].sort(
    (a, b) => a.split(/[\\/]/).length - b.split(/[\\/]/).length,
  );

  for (const manifestPath of ordered) {
    // eslint-disable-next-line no-await-in-loop
    const parsed = await readManifestFile(manifestPath);

    if (!parsed) {
      continue;
    }

    manifestCount += 1;
    omittedSessions.push(...parsed.omittedSessions);

    for (const session of parsed.sessions) {
      sessions.set(session.vcrPath.toLowerCase(), session);
    }
  }

  return { sessions, omittedSessions, manifestCount };
};
