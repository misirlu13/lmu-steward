import { ImportedReplayRecord, LMUReplay } from '@types';

/**
 * Presents an imported replay as an `LMUReplay` so every existing dashboard
 * component — grouping, filtering, sorting, the session cards — works on it
 * unchanged.
 *
 * `imported` is what keeps it out of the active and archived lists, and is the
 * reason an imported replay can never be archived: the three views are mutually
 * exclusive, so it is never in the list where the archive action lives.
 */
export const importedRecordToReplay = (
  record: ImportedReplayRecord,
): LMUReplay =>
  ({
    hash: record.hash,
    metadata: {
      sceneDesc: record.sceneDesc,
      session: record.session,
    },
    replayName: record.replayName,
    replayDirectory: record.vcrPath.slice(
      0,
      Math.max(0, record.vcrPath.length - record.vcrFileName.length),
    ),
    size: record.size ?? 0,
    timestamp: record.timestamp,
    logData: record.logData ?? null,
    logDataDirectory: record.logPath.slice(
      0,
      Math.max(0, record.logPath.length - record.logFileName.length),
    ),
    logDataFileName: record.logFileName,
    logDataLoaded: false,
    imported: true,
    importedAt: record.importedAt,
    importMatchConfidence: record.match?.confidence ?? null,
    importMatchMethod: record.match?.method,
    importVcrFileName: record.vcrFileName,
    importLogFileName: record.logFileName,
    importVcrPath: record.vcrPath,
    importLogPath: record.logPath,
    importOriginInstallPath: record.origin?.installPath,
  }) as LMUReplay;

export const importedRecordsToReplays = (
  records: ImportedReplayRecord[],
): LMUReplay[] => records.map(importedRecordToReplay);

/** Human-readable size for the delete and clear-storage confirmations. */
export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 MB';
  }

  const gigabytes = bytes / 1024 ** 3;
  if (gigabytes >= 1) {
    return `${gigabytes.toFixed(1)} GB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
};
