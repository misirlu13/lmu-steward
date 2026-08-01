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
import {
  ArchiveReplaysRequest,
  GetReplaysRequest,
  PersistedDashboardView,
} from '@types';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { CONSTANTS } from '../../constants';
import { getApiStatus } from './api/api-status';
import {
  getReplays,
  getIsReplayActive,
  postArchiveNote,
  postArchiveReplays,
  postCloseReplay,
  postRestoreReplays,
  postToggleUIElement,
  postWatchReplay,
  putReplayCommand,
  putReplayTime,
  syncReplayData,
} from './api/replay';
import {
  DeleteImportedReplaysRequest,
  ExportReplayRequest,
  ExportWeekendRequest,
  getImportedReplays,
  ImportPairRequest,
  ImportReplaysRequest,
  postDeleteImportedReplays,
  postDiscardImportPreview,
  postExportReplay,
  postExportWeekend,
  postImportReplayPair,
  postImportReplays,
  postSelectImportFile,
  postSelectImportSource,
  postSetImportedNote,
  postValidateImportPair,
  SelectImportFileRequest,
  SelectImportSourceRequest,
  SetImportedNoteRequest,
} from './api/replay-import-handlers';
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
  postDashboardView,
  postUserSettings,
  readUserSettings,
  UserSettings,
  writeUserSettings,
} from './api/user-settings';
import { getProfileInfo } from './api/profile';
import {
  getCareerSummary,
  postCareerClaimIdentity,
  postCareerExcludeSession,
  postCareerRescan,
} from './api/career-handlers';
import {
  closeLmu,
  postCloseLmu,
  postLaunchLmu,
  postOpenSettings,
  postSelectLmuExecutable,
  postSelectLmuReplayDirectory,
} from './api/lmu-launch';
import { isDevModeEnabled, replyWithMockData } from './api/mock-api-data';
import { getLocalDataDebugInfo } from './storage/local-data-store';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

type ApiChannel = (typeof CONSTANTS.API)[keyof typeof CONSTANTS.API];

interface RendererErrorPayload {
  source?: string;
  message?: string;
  stack?: string;
  url?: string;
  line?: number;
  column?: number;
  detail?: string;
}

type ChannelCallbackHandler = (
  event: Electron.IpcMainEvent,
  data: unknown,
) => Promise<void> | void;

const handleRendererError = async (
  _event: Electron.IpcMainEvent,
  payload: RendererErrorPayload,
): Promise<void> => {
  const source = payload?.source ?? 'renderer';
  const details = [
    `Renderer error source: ${source}`,
    payload?.url ? `URL: ${payload.url}` : undefined,
    payload?.line != null ? `Line: ${payload.line}` : undefined,
    payload?.column != null ? `Column: ${payload.column}` : undefined,
    payload?.message ? `Message: ${payload.message}` : undefined,
    payload?.detail ? `Detail: ${payload.detail}` : undefined,
    payload?.stack ? `Stack:\n${payload.stack}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  // Forward reference to a handler defined further down with the rest of the
  // crash-reporting helpers; only invoked once a renderer error arrives.
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  await handleFatalError(details, 'renderer');
};

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
  [CONSTANTS.API.GET_CAREER_SUMMARY]: withEventOnly(getCareerSummary),

  // POST REQUESTS
  [CONSTANTS.API.POST_CAREER_RESCAN]: withEventAndData<
    { rebuild?: boolean } | undefined
  >(postCareerRescan),
  [CONSTANTS.API.POST_CAREER_CLAIM_IDENTITY]: withEventAndData<
    { name?: string } | undefined
  >(postCareerClaimIdentity),
  [CONSTANTS.API.POST_CAREER_EXCLUDE_SESSION]: withEventAndData<
    { sessionKey?: string; excluded?: boolean } | undefined
  >(postCareerExcludeSession),
  [CONSTANTS.API.POST_REPLAY_COMMAND_UI]: withEventAndData<
    string | { all: boolean }
  >(postToggleUIElement),
  [CONSTANTS.API.POST_USER_SETTINGS]:
    withEventAndData<UserSettings>(postUserSettings),
  [CONSTANTS.API.POST_DASHBOARD_VIEW]:
    withEventAndData<PersistedDashboardView | null>(postDashboardView),
  [CONSTANTS.API.POST_WATCH_REPLAY]: withEventAndData<string>(postWatchReplay),
  [CONSTANTS.API.POST_ARCHIVE_REPLAYS]:
    withEventAndData<ArchiveReplaysRequest>(postArchiveReplays),
  [CONSTANTS.API.POST_RESTORE_REPLAYS]:
    withEventAndData<ArchiveReplaysRequest>(postRestoreReplays),
  [CONSTANTS.API.POST_ARCHIVE_NOTE]:
    withEventAndData<ArchiveReplaysRequest>(postArchiveNote),
  [CONSTANTS.API.POST_CAMERA_ANGLE]:
    withEventAndData<CameraAngleRequestBody>(postSetCameraAngle),
  [CONSTANTS.API.POST_CLOSE_REPLAY]: withEventOnly(postCloseReplay),
  [CONSTANTS.API.POST_CLOSE_LMU]: withEventOnly(postCloseLmu),
  [CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE]: withEventOnly(
    postClearLocalStorage,
  ),
  [CONSTANTS.API.POST_LAUNCH_LMU]: withEventOnly(postLaunchLmu),
  [CONSTANTS.API.POST_OPEN_SETTINGS]: withEventOnly(postOpenSettings),
  [CONSTANTS.API.POST_SELECT_LMU_EXECUTABLE]: withEventOnly(
    postSelectLmuExecutable,
  ),
  [CONSTANTS.API.POST_SELECT_LMU_REPLAY_DIRECTORY]: withEventOnly(
    postSelectLmuReplayDirectory,
  ),
  [CONSTANTS.API.POST_RENDERER_ERROR]:
    withEventAndData<RendererErrorPayload>(handleRendererError),
  // PUT REQUESTS
  [CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN]:
    withEventAndData<string>(putReplayCommand),
  [CONSTANTS.API.PUT_REPLAY_COMMAND_TIME]:
    withEventAndData<string>(putReplayTime),
  [CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR]:
    withEventAndData<string>(putFocusCar),
  [CONSTANTS.API.PUT_FOCUS_CAR]: withEventAndData<string>(putFocusCar),

  // REPLAY IMPORT / EXPORT
  [CONSTANTS.API.GET_IMPORTED_REPLAYS]: withEventOnly(getImportedReplays),
  [CONSTANTS.API.POST_SELECT_IMPORT_SOURCE]:
    withEventAndData<SelectImportSourceRequest>(postSelectImportSource),
  [CONSTANTS.API.POST_DISCARD_IMPORT_PREVIEW]: withEventOnly(
    postDiscardImportPreview,
  ),
  [CONSTANTS.API.POST_IMPORT_REPLAYS]:
    withEventAndData<ImportReplaysRequest>(postImportReplays),
  [CONSTANTS.API.POST_DELETE_IMPORTED_REPLAYS]:
    withEventAndData<DeleteImportedReplaysRequest>(postDeleteImportedReplays),
  [CONSTANTS.API.POST_SET_IMPORTED_NOTE]:
    withEventAndData<SetImportedNoteRequest>(postSetImportedNote),
  [CONSTANTS.API.POST_EXPORT_REPLAY]:
    withEventAndData<ExportReplayRequest>(postExportReplay),
  [CONSTANTS.API.POST_EXPORT_WEEKEND]:
    withEventAndData<ExportWeekendRequest>(postExportWeekend),
  [CONSTANTS.API.POST_SELECT_IMPORT_FILE]:
    withEventAndData<SelectImportFileRequest>(postSelectImportFile),
  [CONSTANTS.API.POST_VALIDATE_IMPORT_PAIR]:
    withEventAndData<ImportPairRequest>(postValidateImportPair),
  [CONSTANTS.API.POST_IMPORT_REPLAY_PAIR]:
    withEventAndData<ImportPairRequest>(postImportReplayPair),
};

const devModeEnabled = isDevModeEnabled();

if (devModeEnabled) {
  log.info(
    'LMU_DEVMODE enabled: backend API calls are being served from mock data.',
  );
}

let crashWindow: BrowserWindow | null = null;
let crashReported = false;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getCrashReportText = (error: unknown, source: string): string => {
  const errorText =
    error instanceof Error ? error.stack || error.message : String(error);
  return [
    `Source: ${source}`,
    `Timestamp: ${new Date().toISOString()}`,
    '',
    errorText,
  ].join('\n');
};

const createCrashReportHtml = (details: string): string => {
  const escapedDetails = escapeHtml(details);
  const issueUrl = 'https://github.com/misirlu13/lmu-steward/issues/new/choose';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>LMU Steward Crash Report</title>
    <style>
      body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #171717; color: #f5f5f5; }
      .container { display: flex; flex-direction: column; height: 100vh; padding: 20px; gap: 16px; }
      h1 { margin: 0; font-size: 1.4rem; }
      p { margin: 0; color: #cfcfcf; }
      textarea { width: 100%; flex: 1 1 auto; resize: none; background: #0f0f0f; color: #f5f5f5; border: 1px solid #444; border-radius: 8px; padding: 12px; font-family: ui-monospace, SFMono-Regular, 'Segoe UI Mono', monospace; font-size: 0.9rem; line-height: 1.4; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; }
      button { border: none; border-radius: 6px; padding: 10px 14px; font-size: 0.95rem; cursor: pointer; }
      button.primary { background: #0078d4; color: white; }
      button.secondary { background: #2b2b2b; color: #f5f5f5; }
      .footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
      a { color: #80b3ff; }
    </style>
  </head>
  <body>
    <div class="container">
      <div>
        <h1>LMU Steward encountered an error</h1>
        <p>Copy the text below and paste it into a GitHub issue so the maintainers can investigate.</p>
      </div>
      <textarea id="details" readonly>${escapedDetails}</textarea>
      <div class="actions">
        <button class="primary" id="copy">Copy error details</button>
        <button class="secondary" id="openIssue">Open GitHub issue page</button>
        <button class="secondary" id="closeApp">Close app</button>
      </div>
      <div class="footer">
        <span>Once you have copied the report, close the app and reopen it.</span>
        <a href="#" id="openRepo">Report an issue on GitHub</a>
      </div>
    </div>
    <script>
      const { clipboard, shell } = require('electron');
      const details = document.getElementById('details');
      document.getElementById('copy').addEventListener('click', () => {
        clipboard.writeText(details.value);
        alert('Error details copied to clipboard.');
      });
      document.getElementById('openIssue').addEventListener('click', () => {
        shell.openExternal('${issueUrl}');
      });
      document.getElementById('openRepo').addEventListener('click', (event) => {
        event.preventDefault();
        shell.openExternal('${issueUrl}');
      });
      document.getElementById('closeApp').addEventListener('click', () => {
        window.close();
      });
    </script>
  </body>
</html>`;
};

const showCrashReportWindow = async (details: string) => {
  if (crashWindow) {
    crashWindow.focus();
    return;
  }

  const createWindow = () => {
    crashWindow = new BrowserWindow({
      width: 760,
      height: 580,
      minWidth: 620,
      minHeight: 480,
      title: 'LMU Steward crash report',
      backgroundColor: '#171717',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    crashWindow.on('closed', () => {
      crashWindow = null;
      app.exit(1);
    });

    crashWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(createCrashReportHtml(details))}`,
    );
    crashWindow.show();
  };

  if (app.isReady()) {
    createWindow();
  } else {
    await app.whenReady();
    createWindow();
  }
};

const handleFatalError = async (error: unknown, source: string) => {
  if (crashReported) {
    return;
  }

  crashReported = true;
  const details = getCrashReportText(error, source);
  log.error('Unhandled application error', details);

  try {
    await showCrashReportWindow(details);
  } catch (showError) {
    log.error('Failed to display crash report window', showError);
  }
};

process.on('uncaughtException', (error: unknown) => {
  void handleFatalError(error, 'uncaughtException');
});

process.on('unhandledRejection', (reason: unknown) => {
  void handleFatalError(reason, 'unhandledRejection');
});

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
  const syncOnIntervalMinutes = Number.isFinite(
    Number(settings.syncOnIntervalMinutes),
  )
    ? Math.max(1, Number(settings.syncOnIntervalMinutes))
    : 5;

  if (!automaticSyncEnabled) {
    return;
  }

  if (syncOnAppLaunch && !firstRun) {
    void runReplayAutoSync('launch');
  }

  replayAutoSyncIntervalId = setInterval(
    () => {
      void runReplayAutoSync('interval');
    },
    syncOnIntervalMinutes * 60 * 1000,
  );
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

ipcMain.handle(CONSTANTS.API.GET_STORAGE_DEBUG_INFO, async () => {
  return getLocalDataDebugInfo();
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
      const closeLmuWhenStewardExits = Boolean(
        settings.closeLmuWhenStewardExits,
      );
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
