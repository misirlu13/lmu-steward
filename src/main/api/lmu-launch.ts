import { dialog, shell } from 'electron';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { CONSTANTS } from '@constants';
import {
  getLmuExecutablePathValidationError,
  readUserSettings,
} from './user-settings';

const LMU_EXECUTABLE_KEYS = ['lmuExecutablePath', 'lmuPath', 'executablePath'] as const;
const LMU_EXECUTABLE_FILE_NAME = 'Le Mans Ultimate.exe';

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const normalized = String(error ?? '').trim();
  return normalized || fallback;
};

const normalizeExecutablePath = (candidatePath: string): string => {
  const trimmedPath = String(candidatePath ?? '').trim();
  if (!trimmedPath) {
    return '';
  }

  if (/\.exe$/i.test(trimmedPath)) {
    return trimmedPath;
  }

  return path.join(trimmedPath, LMU_EXECUTABLE_FILE_NAME);
};

const getConfiguredLmuExecutablePath = async (): Promise<string | null> => {
  const settings = await readUserSettings();

  for (const key of LMU_EXECUTABLE_KEYS) {
    const value = settings[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return normalizeExecutablePath(value);
    }
  }

  return normalizeExecutablePath(CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH);
};

export const postLaunchLmu = async (event: Electron.IpcMainEvent) => {
  try {
    const executablePath = await getConfiguredLmuExecutablePath();

    if (!executablePath) {
      event.reply(CONSTANTS.API.POST_LAUNCH_LMU, {
        status: 'error',
        message:
          'LMU executable path is not configured. Add it from settings and try again.',
      });
      return;
    }

    const executablePathValidationError =
      getLmuExecutablePathValidationError(executablePath);
    if (executablePathValidationError) {
      event.reply(CONSTANTS.API.POST_LAUNCH_LMU, {
        status: 'error',
        message: executablePathValidationError,
      });
      return;
    }

    if (!existsSync(executablePath)) {
      event.reply(CONSTANTS.API.POST_LAUNCH_LMU, {
        status: 'error',
        message:
          'Configured LMU executable path was not found. Update your path in settings.',
      });
      return;
    }

    const executableDirectory = path.dirname(executablePath);
    let launchMethod: 'spawn' | 'shell.openPath' = 'spawn';

    try {
      const childProcess = spawn(executablePath, [], {
        cwd: executableDirectory,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      childProcess.unref();
    } catch (spawnError) {
      const shellOpenError = await shell.openPath(executablePath);
      if (shellOpenError) {
        throw new Error(
          `Failed to launch LMU via spawn and shell fallback. ${shellOpenError}`,
        );
      }

      launchMethod = 'shell.openPath';
      console.warn('Spawn launch failed. LMU launched using shell.openPath fallback.', spawnError);
    }

    event.reply(CONSTANTS.API.POST_LAUNCH_LMU, {
      status: 'success',
      data: {
        executablePath,
        launchMethod,
      },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_LAUNCH_LMU, {
      status: 'error',
      message: toErrorMessage(error, 'Unable to launch LMU.'),
    });
  }
};

export const closeLmu = async (): Promise<void> => {
  const response = await fetch(
    `${CONSTANTS.LMU_API_BASE_URL}/navigation/action/NAV_EXIT`,
    {
      method: 'POST',
    },
  );

  if (!response.ok) {
    throw new Error(`API responded with status ${response.status}`);
  }
};

export const postCloseLmu = async (event: Electron.IpcMainEvent) => {
  try {
    await closeLmu();

    event.reply(CONSTANTS.API.POST_CLOSE_LMU, {
      status: 'success',
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_CLOSE_LMU, {
      status: 'error',
      message: toErrorMessage(error, 'Unable to close LMU.'),
    });
  }
};

export const postOpenSettings = async (event: Electron.IpcMainEvent) => {
  event.reply(CONSTANTS.API.POST_OPEN_SETTINGS, {
    status: 'success',
    data: {
      openRoute: '/user-settings',
    },
  });
};

export const postSelectLmuExecutable = async (event: Electron.IpcMainEvent) => {
  try {
    const response = await dialog.showOpenDialog({
      title: 'Select Le Mans Ultimate executable',
      properties: ['openFile'],
      filters: [
        { name: 'Executable', extensions: ['exe'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });

    if (response.canceled || response.filePaths.length === 0) {
      event.reply(CONSTANTS.API.POST_SELECT_LMU_EXECUTABLE, {
        status: 'success',
        data: {
          canceled: true,
        },
      });
      return;
    }

    event.reply(CONSTANTS.API.POST_SELECT_LMU_EXECUTABLE, {
      status: 'success',
      data: {
        canceled: false,
        lmuExecutablePath: normalizeExecutablePath(response.filePaths[0]),
      },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_SELECT_LMU_EXECUTABLE, {
      status: 'error',
      message: toErrorMessage(error, 'Unable to select LMU executable path.'),
    });
  }
};

export const postSelectLmuReplayDirectory = async (event: Electron.IpcMainEvent) => {
  try {
    const response = await dialog.showOpenDialog({
      title: 'Select Le Mans Ultimate replay directory',
      properties: ['openDirectory'],
    });

    if (response.canceled || response.filePaths.length === 0) {
      event.reply(CONSTANTS.API.POST_SELECT_LMU_REPLAY_DIRECTORY, {
        status: 'success',
        data: {
          canceled: true,
        },
      });
      return;
    }

    event.reply(CONSTANTS.API.POST_SELECT_LMU_REPLAY_DIRECTORY, {
      status: 'success',
      data: {
        canceled: false,
        lmuReplayDirectoryPath: response.filePaths[0],
      },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_SELECT_LMU_REPLAY_DIRECTORY, {
      status: 'error',
      message: toErrorMessage(error, 'Unable to select replay directory path.'),
    });
  }
};
