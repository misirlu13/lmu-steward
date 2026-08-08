import { CONSTANTS } from '@constants';
import path from 'path';
import log from 'electron-log';
import {
  clearPersistentStorage,
  getMainPersistentStore,
} from '../storage/local-data-store';
import { sweepExpiredLiveSessions } from './live-retention';

export type UserSettings = Record<string, unknown>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  lmuExecutablePath: CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH,
  lmuReplayDirectoryPath: CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH,
  firstRun: true,
  automaticSyncEnabled: true,
  quickViewEnabled: false,
  syncOnAppLaunch: true,
  syncOnIntervalMinutes: 5,
  lastReplaySyncAt: null,
  closeLmuWhenStewardExits: false,
  closeLmuOnExitAlwaysPerformAction: false,
  persistDashboardFiltersEnabled: false,
  dashboardView: null,
  /**
   * Gates anything listed in CONSTANTS.EXPERIMENTAL_FEATURES. Off by default —
   * experimental is opt-in, and a user who has never seen the setting should
   * not be running unfinished features.
   */
  experimentalFeaturesEnabled: false,
  /**
   * Runs the live capture sidecar. Separate from the experimental gate, and
   * off by default, because the sidecar takes a machine-wide lock that wheel
   * LED and motion software also use — enabling live stewarding should not
   * silently start touching shared memory.
   */
  liveCaptureEnabled: false,
  /**
   * How long captured live sessions are kept, in days. Null never expires them.
   *
   * Age is the only axis, deliberately. Link state looks like a useful signal
   * and is not: an unlinked session may link later when a replay is imported
   * from another machine, and the user who does not keep replays is exactly the
   * one for whom the capture is the only record of a race.
   *
   * Steward decisions are never swept, at any setting.
   */
  liveCaptureRetentionDays: 30,
  /**
   * Who new steward decisions are recorded as. Empty means "not set", which
   * the renderer resolves to a generic author rather than writing a blank one —
   * a decision with no author is undefendable on appeal, which is the entire
   * reason the field is on the record.
   *
   * Only ever applied to calls made from here on. Past decisions keep the
   * author they were written with; a name typed today says nothing about who
   * made a call last week.
   */
  stewardAuthorName: '',
};

/** The windows offered, longest-lived last. `null` is "never delete". */
export const LIVE_RETENTION_OPTIONS: Array<number | null> = [7, 30, 90, null];

// Removed threshold constants

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const normalized = String(error ?? '').trim();
  return normalized || fallback;
};

const LMU_EXECUTABLE_FILE_NAME = 'le mans ultimate.exe';
const LMU_FOLDER_SEGMENT = 'le mans ultimate';
const LMU_REPLAYS_TRAILING_SEGMENT = 'userdata\\replays';

const normalizeWindowsPath = (value: string): string =>
  String(value ?? '')
    .trim()
    .replace(/\//g, '\\')
    .toLowerCase();

export const getLmuExecutablePathValidationError = (
  candidatePath: string,
): string | null => {
  const normalizedPath = normalizeWindowsPath(candidatePath);
  if (!normalizedPath) {
    return 'LMU executable path is required.';
  }

  if (path.basename(normalizedPath) !== LMU_EXECUTABLE_FILE_NAME) {
    return 'LMU executable path must point to "Le Mans Ultimate.exe".';
  }

  if (!normalizedPath.includes(`\\${LMU_FOLDER_SEGMENT}\\`)) {
    return 'LMU executable path must include the "Le Mans Ultimate" installation folder.';
  }

  return null;
};

export const getLmuReplayDirectoryPathValidationError = (
  candidatePath: string,
): string | null => {
  const normalizedPath = normalizeWindowsPath(candidatePath);
  if (!normalizedPath) {
    return 'LMU replay directory path is required.';
  }

  if (!normalizedPath.includes(`\\${LMU_FOLDER_SEGMENT}\\`)) {
    return 'Replay directory must include the "Le Mans Ultimate" folder.';
  }

  if (!normalizedPath.includes(LMU_REPLAYS_TRAILING_SEGMENT)) {
    return 'Replay directory must include "UserData\\Replays".';
  }

  return null;
};

// Removed getReplayLogMatchThresholdValidationError

const validateUserSettingsUpdates = (updates: UserSettings): string | null => {
  if (typeof updates?.lmuExecutablePath === 'string') {
    const executablePathValidationError = getLmuExecutablePathValidationError(
      updates.lmuExecutablePath,
    );

    if (executablePathValidationError) {
      return executablePathValidationError;
    }
  }

  if (typeof updates?.lmuReplayDirectoryPath === 'string') {
    const replayDirectoryValidationError =
      getLmuReplayDirectoryPathValidationError(updates.lmuReplayDirectoryPath);

    if (replayDirectoryValidationError) {
      return replayDirectoryValidationError;
    }
  }

  // Removed replayLogMatchThresholdMs validation

  return null;
};

export const readUserSettings = async (): Promise<UserSettings> => {
  const storedSettings =
    (getMainPersistentStore().get('userSettings') as UserSettings) ?? {};

  return {
    ...DEFAULT_USER_SETTINGS,
    ...storedSettings,
  };
};

export const writeUserSettings = async (
  updates: UserSettings,
): Promise<UserSettings> => {
  const existing = await readUserSettings();
  const nextSettings = {
    ...existing,
    ...(updates ?? {}),
  };

  getMainPersistentStore().set('userSettings', nextSettings);
  return nextSettings;
};

export const getUserSettings = async (event: Electron.IpcMainEvent) => {
  try {
    const data = await readUserSettings();

    event.reply(CONSTANTS.API.GET_USER_SETTINGS, {
      status: 'success',
      data,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_USER_SETTINGS, {
      status: 'error',
      message: toErrorMessage(error, 'Unable to read user settings'),
    });
  }
};

export const postUserSettings = async (
  event: Electron.IpcMainEvent,
  updates: UserSettings,
) => {
  try {
    const validationError = validateUserSettingsUpdates(updates ?? {});
    if (validationError) {
      event.reply(CONSTANTS.API.POST_USER_SETTINGS, {
        status: 'error',
        message: validationError,
      });
      return;
    }

    const nextSettings = await writeUserSettings(updates);

    /*
      A shortened window is the one case where the user has explicitly asked for
      data to go now, so it is swept immediately rather than waiting for the next
      app start. The renderer has already confirmed against a summary of exactly
      what will be removed; this is the write that carries it out.

      Isolated from the reply: expiry failing must not make a settings change
      look like it failed.
    */
    try {
      if (
        Object.prototype.hasOwnProperty.call(
          updates ?? {},
          'liveCaptureRetentionDays',
        )
      ) {
        sweepExpiredLiveSessions(
          nextSettings.liveCaptureRetentionDays as number | null,
        );
      }
    } catch (sweepError) {
      log.warn(
        'live-retention: sweep after settings change failed',
        sweepError,
      );
    }

    event.reply(CONSTANTS.API.POST_USER_SETTINGS, {
      status: 'success',
      data: nextSettings,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_USER_SETTINGS, {
      status: 'error',
      message: toErrorMessage(error, 'Unable to update user settings'),
    });
  }
};

/**
 * Persists dashboard filter and sort state on its own channel. This is kept
 * separate from POST_USER_SETTINGS because that channel reconfigures replay
 * auto-sync on every write, and dashboard filters change far too often to
 * justify restarting the sync interval each time.
 */
export const postDashboardView = async (
  event: Electron.IpcMainEvent,
  dashboardView: unknown,
) => {
  try {
    const nextSettings = await writeUserSettings({
      dashboardView: dashboardView ?? null,
    });

    event.reply(CONSTANTS.API.POST_DASHBOARD_VIEW, {
      status: 'success',
      data: nextSettings,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_DASHBOARD_VIEW, {
      status: 'error',
      message: toErrorMessage(error, 'Unable to save dashboard filters'),
    });
  }
};

export const postClearLocalStorage = async (event: Electron.IpcMainEvent) => {
  try {
    clearPersistentStorage();

    const data = await readUserSettings();

    event.reply(CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE, {
      status: 'success',
      data,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE, {
      status: 'error',
      message: toErrorMessage(error, 'Unable to clear local storage'),
    });
  }
};
