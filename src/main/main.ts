/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { CONSTANTS } from '../../constants';
import { getApiStatus } from './api/api-status';
import {
  getReplays,
  getIsReplayActive,
  postCloseReplay,
  postToggleUIElement,
  postWatchReplay,
  putReplayCommand,
  putReplayTime,
  syncReplayData,
} from './api/replay';
import {
  getTrackThumbnail,
  getStandings,
  getStandingsHistory,
  getTrackMap,
  getSessionInfo,
} from './api/session';
import {
  CameraAngleRequestBody,
  postSetCameraAngle,
  putFocusCar,
  getFocusedCar,
} from './api/camera';
import {
  getUserSettings,
  postClearLocalStorage,
  postUserSettings,
  readUserSettings,
  UserSettings,
  writeUserSettings,
} from './api/user-settings';
import { getProfileInfo } from './api/profile';
import {
  closeLmu,
  postCloseLmu,
  postLaunchLmu,
  postOpenSettings,
  postSelectLmuExecutable,
  postSelectLmuReplayDirectory,
} from './api/lmu-launch';
import { isDevModeEnabled, replyWithMockData } from './api/mock-api-data';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

type ApiChannel = (typeof CONSTANTS.API)[keyof typeof CONSTANTS.API];
interface GetReplaysRequest {
  forceReplayCacheReset?: boolean;
}

type ChannelCallbackHandler = (
  event: Electron.IpcMainEvent,
  data: unknown,
) => Promise<void> | void;

const withEventOnly =
  (
    handler: (event: Electron.IpcMainEvent) => Promise<void> | void,
  ): ChannelCallbackHandler =>
  (event) =>
    handler(event);

const withEventAndData =
  <T>(
    handler: (event: Electron.IpcMainEvent, data: T) => Promise<void> | void,
  ): ChannelCallbackHandler =>
  (event, data) =>
    handler(event, data as T);

const CHANNEL_CALLBACK_HANDLERS: Partial<
  Record<ApiChannel, ChannelCallbackHandler>
> = {
  // GET REQUESTS
  [CONSTANTS.API.GET_API_STATUS]: withEventOnly(getApiStatus),
  [CONSTANTS.API.GET_TRACK_MAP]: withEventOnly(getTrackMap),
  [CONSTANTS.API.GET_REPLAYS]: withEventAndData<GetReplaysRequest | undefined>(
    getReplays,
  ),
  [CONSTANTS.API.GET_TRACK_THUMBNAIL]:
    withEventAndData<number>(getTrackThumbnail),
  [CONSTANTS.API.GET_USER_SETTINGS]: withEventOnly(getUserSettings),
  [CONSTANTS.API.GET_PROFILE_INFO]: withEventOnly(getProfileInfo),
  [CONSTANTS.API.GET_STANDINGS_HISTORY]: withEventOnly(getStandingsHistory),
  [CONSTANTS.API.GET_STANDINGS]: withEventOnly(getStandings),
  [CONSTANTS.API.GET_IS_REPLAY_ACTIVE]: withEventOnly(getIsReplayActive),
  [CONSTANTS.API.GET_SESSION_INFO]: withEventOnly(getSessionInfo),
  [CONSTANTS.API.GET_FOCUSED_CAR]: withEventOnly(getFocusedCar),

  // POST REQUESTS
  [CONSTANTS.API.POST_REPLAY_COMMAND_UI]: withEventAndData<
    string | { all: boolean }
  >(postToggleUIElement),
  [CONSTANTS.API.POST_USER_SETTINGS]: withEventAndData<UserSettings>(postUserSettings),
  [CONSTANTS.API.POST_WATCH_REPLAY]: withEventAndData<string>(postWatchReplay),
  [CONSTANTS.API.POST_CAMERA_ANGLE]: withEventAndData<CameraAngleRequestBody>(postSetCameraAngle),
  [CONSTANTS.API.POST_CLOSE_REPLAY]: withEventOnly(postCloseReplay),
  [CONSTANTS.API.POST_CLOSE_LMU]: withEventOnly(postCloseLmu),
  [CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE]: withEventOnly(postClearLocalStorage),
  [CONSTANTS.API.POST_LAUNCH_LMU]: withEventOnly(postLaunchLmu),
  [CONSTANTS.API.POST_OPEN_SETTINGS]: withEventOnly(postOpenSettings),
  [CONSTANTS.API.POST_SELECT_LMU_EXECUTABLE]: withEventOnly(
    postSelectLmuExecutable,
  ),
  [CONSTANTS.API.POST_SELECT_LMU_REPLAY_DIRECTORY]: withEventOnly(
    postSelectLmuReplayDirectory,
  ),
  // PUT REQUESTS
  [CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN]:
    withEventAndData<string>(putReplayCommand),
  [CONSTANTS.API.PUT_REPLAY_COMMAND_TIME]:
    withEventAndData<string>(putReplayTime),
  [CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR]:
    withEventAndData<string>(putFocusCar),
  [CONSTANTS.API.PUT_FOCUS_CAR]: withEventAndData<string>(putFocusCar),
};

const devModeEnabled = isDevModeEnabled();

if (devModeEnabled) {
  log.info('LMU_DEVMODE enabled: backend API calls are being served from mock data.');
}

let replayAutoSyncIntervalId: ReturnType<typeof setInterval> | null = null;
let replayAutoSyncInProgress = false;

interface ExitConfirmDecision {
  shouldExit: boolean;
  closeLmuWhenStewardExits: boolean;
  alwaysPerformAction: boolean;
}

const requestExitDecisionFromRenderer = async (
  window: BrowserWindow,
  defaultCloseLmuWhenStewardExits: boolean,
): Promise<ExitConfirmDecision | null> => {
  if (window.isDestroyed()) {
    return null;
  }

  return new Promise<ExitConfirmDecision | null>((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(null);
    }, 60_000);

    ipcMain.once(CONSTANTS.API.REPLY_APP_EXIT_CONFIRM, (_event, payload) => {
      clearTimeout(timeoutId);
      const decision = (payload ?? {}) as Partial<ExitConfirmDecision>;
      resolve({
        shouldExit: Boolean(decision.shouldExit),
        closeLmuWhenStewardExits: Boolean(decision.closeLmuWhenStewardExits),
        alwaysPerformAction: Boolean(decision.alwaysPerformAction),
      });
    });

    window.webContents.send(CONSTANTS.API.REQUEST_APP_EXIT_CONFIRM, {
      defaultCloseLmuWhenStewardExits,
    });
  });
};

const runReplayAutoSync = async (source: 'launch' | 'interval') => {
  if (replayAutoSyncInProgress) {
    return;
  }

  replayAutoSyncInProgress = true;
  try {
    await syncReplayData();
    const nextSettings = await writeUserSettings({
      lastReplaySyncAt: Date.now(),
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(CONSTANTS.API.PUSH_USER_SETTINGS, {
        status: 'success',
        data: nextSettings,
      });
    }
  } catch (error) {
    log.warn(`Replay auto-sync (${source}) failed`, error);
  } finally {
    replayAutoSyncInProgress = false;
  }
};

const configureReplayAutoSync = async () => {
  if (replayAutoSyncIntervalId) {
    clearInterval(replayAutoSyncIntervalId);
    replayAutoSyncIntervalId = null;
  }

  if (devModeEnabled) {
    return;
  }

  const settings = await readUserSettings();
  const firstRun = Boolean(settings.firstRun ?? true);
  const automaticSyncEnabled = Boolean(settings.automaticSyncEnabled ?? true);
  const syncOnAppLaunch = Boolean(settings.syncOnAppLaunch ?? true);
  const syncOnIntervalMinutes = Number.isFinite(Number(settings.syncOnIntervalMinutes))
    ? Math.max(1, Number(settings.syncOnIntervalMinutes))
    : 5;

  if (!automaticSyncEnabled) {
    return;
  }

  if (syncOnAppLaunch && !firstRun) {
    void runReplayAutoSync('launch');
  }

  replayAutoSyncIntervalId = setInterval(() => {
    void runReplayAutoSync('interval');
  }, syncOnIntervalMinutes * 60 * 1000);
};

// Initialize IPC handlers for all channels defined in CONSTANTS.IPC_CHANNELS
Object.entries(CHANNEL_CALLBACK_HANDLERS).forEach(([channel, handler]) => {
  ipcMain.on(channel, async (event, arg) => {
    if (devModeEnabled) {
      const didReplyWithMock = await replyWithMockData(
        event,
        channel as ApiChannel,
        arg,
      );

      if (didReplyWithMock) {
        return;
      }
    }

    await handler(event, arg);

    if (channel === CONSTANTS.API.POST_USER_SETTINGS) {
      await configureReplayAutoSync();
    }
  });
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch((error: unknown) => {
      log.warn('Failed to install development extensions', error);
    });
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 1024,
    minHeight: 1024,
    minWidth: 1280,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  let isCloseFlowInProgress = false;
  let isCloseConfirmed = false;

  mainWindow.on('close', async (event) => {
    if (isCloseConfirmed || isCloseFlowInProgress) {
      return;
    }

    event.preventDefault();
    isCloseFlowInProgress = true;

    try {
      const settings = await readUserSettings();
      const closeLmuWhenStewardExits = Boolean(settings.closeLmuWhenStewardExits);
      const closeLmuOnExitAlwaysPerformAction = Boolean(
        settings.closeLmuOnExitAlwaysPerformAction,
      );

      let shouldCloseLmu = closeLmuWhenStewardExits;

      if (!closeLmuOnExitAlwaysPerformAction) {
        const decision = await requestExitDecisionFromRenderer(
          mainWindow!,
          closeLmuWhenStewardExits,
        );

        if (!decision?.shouldExit) {
          return;
        }

        shouldCloseLmu = decision.closeLmuWhenStewardExits;

        await writeUserSettings({
          closeLmuWhenStewardExits: shouldCloseLmu,
          closeLmuOnExitAlwaysPerformAction: decision.alwaysPerformAction,
        });
      }

      if (shouldCloseLmu) {
        try {
          await closeLmu();
        } catch (closeError) {
          console.warn('Unable to close LMU during app shutdown:', closeError);
        }
      }

      isCloseConfirmed = true;
      mainWindow?.close();
    } finally {
      isCloseFlowInProgress = false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();

  await configureReplayAutoSync();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  if (replayAutoSyncIntervalId) {
    clearInterval(replayAutoSyncIntervalId);
    replayAutoSyncIntervalId = null;
  }

  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch((error: unknown) => {
    log.error('Application bootstrap failed', error);
  });
