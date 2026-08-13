import { CONSTANTS } from '@constants';
import { CareerFilters } from '@types';
import {
  buildCareerAggregate,
  buildCareerLogIndex,
  claimCareerIdentity,
  enrichCareerFromReplays,
  ensureCareerIdentity,
  getCareerAggregate,
  readCareerIdentity,
  readCareerSessions,
  scanCareer,
  setCareerSessionExcluded,
} from './career';
import { getCachedReplaysForCareer, readImportedReplays } from './replay';
import { readUserSettings } from './user-settings';
import { readVcrTrailer } from './vcr-metadata';

/**
 * IPC surface for the driver dashboard.
 *
 * A scan is offered explicitly as well as riding the replay sync, because the
 * two are not the same thing: sync only visits replays the game still lists,
 * and a career is built from result logs whose replays may be long gone.
 */

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to read career data.';

const resolveResultsDirectory = async (): Promise<string> => {
  const settings = await readUserSettings();
  const replayDirectory = String(settings?.lmuReplayDirectoryPath ?? '').trim();
  const base = replayDirectory || CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH;

  return `${base.replace(/[\\/]+$/, '')}/../Log/Results`;
};

/**
 * Result logs this app *wrote* when importing someone else's replay.
 *
 * Only the ones it wrote. Importing a replay of a race the user also drove
 * copies no log, because theirs is already there — `logWasWritten` is false for
 * those, and excluding them would delete the user's own session from their
 * career on the grounds that somebody else's replay of it exists.
 */
const readImportedLogPaths = (): Set<string> =>
  new Set(
    Object.values(readImportedReplays())
      .filter((record) => record.logWasWritten)
      .map((record) => record.logPath)
      .filter((path): path is string => Boolean(path)),
  );

export const getCareerSummary = async (
  event: Electron.IpcMainEvent,
  filters?: CareerFilters,
) => {
  try {
    event.reply(CONSTANTS.API.GET_CAREER_SUMMARY, {
      status: 'success',
      data: { aggregate: getCareerAggregate(filters) },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_CAREER_SUMMARY, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

export const postCareerRescan = async (
  event: Electron.IpcMainEvent,
  request?: { rebuild?: boolean; filters?: CareerFilters },
) => {
  try {
    ensureCareerIdentity();

    const logDir = await resolveResultsDirectory();
    const report = await scanCareer({
      rebuild: Boolean(request?.rebuild),
      index: await buildCareerLogIndex(logDir),
      importedLogPaths: readImportedLogPaths(),
    });

    /*
     * Official-event identity comes only from the replay, and only for sessions
     * that still have one. Read after the scan so it decorates records that
     * exist, and never as a source — a missing replay costs one optional field.
     */
    await enrichCareerFromReplays(getCachedReplaysForCareer(), (filePath) =>
      readVcrTrailer(filePath).then((trailer) =>
        trailer
          ? {
              eventTitle: trailer.eventTitle,
              eventType: trailer.eventType,
              splitNo: trailer.splitNo,
            }
          : null,
      ),
    );

    event.reply(CONSTANTS.API.POST_CAREER_RESCAN, {
      status: 'success',
      data: { aggregate: getCareerAggregate(request?.filters), report },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_CAREER_RESCAN, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

export const postCareerClaimIdentity = async (
  event: Electron.IpcMainEvent,
  request?: { name?: string; filters?: CareerFilters },
) => {
  try {
    const name = String(request?.name ?? '').trim();
    if (name) {
      await claimCareerIdentity(name);
      /*
       * Claiming a name only changes which logs count, so the sessions it
       * unlocks have to be read back off disk before they can appear.
       */
      await scanCareer({
        index: await buildCareerLogIndex(await resolveResultsDirectory()),
        importedLogPaths: readImportedLogPaths(),
      });
    }

    event.reply(CONSTANTS.API.POST_CAREER_CLAIM_IDENTITY, {
      status: 'success',
      data: { aggregate: getCareerAggregate(request?.filters) },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_CAREER_CLAIM_IDENTITY, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};

export const postCareerExcludeSession = async (
  event: Electron.IpcMainEvent,
  request?: {
    sessionKey?: string;
    excluded?: boolean;
    filters?: CareerFilters;
  },
) => {
  try {
    const sessionKey = String(request?.sessionKey ?? '').trim();
    if (sessionKey) {
      setCareerSessionExcluded(sessionKey, Boolean(request?.excluded));
    }

    event.reply(CONSTANTS.API.POST_CAREER_EXCLUDE_SESSION, {
      status: 'success',
      data: {
        aggregate: buildCareerAggregate(
          Object.values(readCareerSessions()),
          readCareerIdentity(),
          null,
          request?.filters,
        ),
      },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_CAREER_EXCLUDE_SESSION, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};
