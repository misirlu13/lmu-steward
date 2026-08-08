import {
  Avatar,
  Box,
  Button,
  Divider,
  InputAdornment,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONSTANTS } from '@constants';
import { LiveRetentionPreview, LocalDataSummary } from '@types';
import { useNavigate } from 'react-router-dom';
import { ViewHeader } from '../components/Common/ViewHeader';
import { RetentionShorteningDialog } from '../components/UserSettings/RetentionShorteningDialog';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';
import { getProfileInitials } from '../utils/profileInitials';
import { DEFAULT_STEWARD_AUTHOR } from '../utils/stewardAuthor';
import {
  LONGEST_COUNTRY_NAME,
  LMU_LAUNCH_COOLDOWN_MS,
  READ_ONLY_VALUE_COLOR_SX,
} from '../utils/userSettingsHelpers';
import { UserSettingsClearStorageDialog } from '../components/UserSettings/UserSettingsClearStorageDialog';
import { UserSettingsAutosaveStatus } from '../components/UserSettings/UserSettingsAutosaveStatus';
import { useUserSettingsDerivedState } from '../hooks/useUserSettingsDerivedState';
// import { UserSettingsReplayThresholdDialog } from '../components/UserSettings/UserSettingsReplayThresholdDialog';
import { UserSettingsReplaySyncDefaultsDialog } from '../components/UserSettings/UserSettingsReplaySyncDefaultsDialog';

const DEFAULT_REPLAY_SYNC_SETTINGS = {
  automaticSyncEnabled: true,
  syncOnAppLaunch: true,
  quickViewEnabled: false,
  syncOnIntervalMinutes: 5,
  replayLogMatchThresholdMinutes: 2,
};

interface ApiResponse {
  status?: 'success' | 'error';
  message?: string;
  data?: {
    profileInfo?: {
      language?: string;
      name?: string;
      nationality?: string;
      nick?: string;
      steamID?: string;
    };
    hasFetchedProfileInfo?: boolean;
    source?: 'live' | 'cache';
    lmuExecutablePath?: string;
    lmuReplayDirectoryPath?: string;
    automaticSyncEnabled?: boolean;
    quickViewEnabled?: boolean;
    syncOnAppLaunch?: boolean;
    syncOnIntervalMinutes?: number;
    replayLogMatchThresholdMs?: number;
    persistDashboardFiltersEnabled?: boolean;
    experimentalFeaturesEnabled?: boolean;
    liveCaptureEnabled?: boolean;
    anonymizeDriverData?: boolean;
    telemetryCacheEnabled?: boolean;
    clearCacheOnExit?: boolean;
    closeLmuWhenStewardExits?: boolean;
    closeLmuOnExitAlwaysPerformAction?: boolean;
    lastReplaySyncAt?: number;
    canceled?: boolean;
    launchMethod?: string;
    [key: string]: unknown;
  };
}

type SaveMode = 'manual' | 'auto' | 'none';

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export const UserSettingsView: React.FC = () => {
  const navigate = useNavigate();
  const {
    isConnected,
    hasApiStatusResponse,
    lastReplaySyncAt,
    requestReplays,
    markReplayCacheResetRequired,
    importedReplays,
    requestImportedReplays,
    deleteImportedReplays,
  } = useApi();
  const [lmuExecutablePath, setLmuExecutablePath] = useState<string>(
    CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH,
  );
  const [lmuReplayDirectoryPath, setLmuReplayDirectoryPath] = useState<string>(
    CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH,
  );
  const [profileName, setProfileName] = useState('Unknown Steward');
  const [profileNickname, setProfileNickname] = useState('N/A');
  const [profileSteamId, setProfileSteamId] = useState('N/A');
  const [profileNationalityCode, setProfileNationalityCode] = useState('');
  const [profileLanguage, setProfileLanguage] = useState('');
  const [, setProfileSource] = useState<'live' | 'cache' | 'none'>('none');
  const [, setHasFetchedProfileInfo] = useState(false);
  const [lastProfileSyncAt, setLastProfileSyncAt] = useState<number | null>(
    null,
  );
  const [isProfileSyncing, setIsProfileSyncing] = useState(false);
  const [automaticSyncEnabled, setAutomaticSyncEnabled] = useState(true);
  const [quickViewEnabled, setQuickViewEnabled] = useState(false);
  const [syncOnAppLaunch, setSyncOnAppLaunch] = useState(true);
  const [syncOnIntervalMinutes, setSyncOnIntervalMinutes] = useState(5);
  const [replayLogMatchThresholdMinutes, setReplayLogMatchThresholdMinutes] =
    useState(2);
  const [
    pendingReplayLogMatchThresholdMinutes,
    setPendingReplayLogMatchThresholdMinutes,
  ] = useState(2);
  const [persistDashboardFiltersEnabled, setPersistDashboardFiltersEnabled] =
    useState(false);
  const [experimentalFeaturesEnabled, setExperimentalFeaturesEnabled] =
    useState(false);
  const [liveCaptureEnabled, setLiveCaptureEnabled] = useState(false);
  const [liveCaptureRetentionDays, setLiveCaptureRetentionDays] = useState<
    number | null
  >(30);
  /*
    Held untrimmed so the field does not fight the cursor mid-word; the trim
    happens where the value leaves for the store.
  */
  const [stewardAuthorName, setStewardAuthorName] = useState('');
  /*
    Shortening the window deletes data, so the change is held here until the
    user has seen what it would remove and confirmed it. Lengthening never
    lands here — it takes nothing away.
  */
  const [pendingRetentionDays, setPendingRetentionDays] = useState<
    number | null | undefined
  >(undefined);
  const [retentionPreview, setRetentionPreview] =
    useState<LiveRetentionPreview | null>(null);
  const [isRetentionPreviewLoading, setIsRetentionPreviewLoading] =
    useState(false);
  const [localDataSummary, setLocalDataSummary] =
    useState<LocalDataSummary | null>(null);
  /*
   * Defaults to keeping the files. Clearing a cache should not destroy
   * multi-GB replays as a side effect — the destructive option is the one the
   * user actively picks.
   */
  const [deleteImportedFilesOnClear, setDeleteImportedFilesOnClear] =
    useState(false);
  const [importedReplayBytes, setImportedReplayBytes] = useState(0);
  const [anonymizeDriverData, setAnonymizeDriverData] = useState(false);
  const [telemetryCacheEnabled, setTelemetryCacheEnabled] = useState(true);
  const [clearCacheOnExit, setClearCacheOnExit] = useState(false);
  const [closeLmuWhenStewardExits, setCloseLmuWhenStewardExits] =
    useState(false);
  const [persistedLastReplaySyncAt, setPersistedLastReplaySyncAt] = useState<
    number | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [isClearingLocalStorage, setIsClearingLocalStorage] = useState(false);
  const [isClearLocalStorageDialogOpen, setIsClearLocalStorageDialogOpen] =
    useState(false);
  const [, setIsReplayThresholdDialogOpen] = useState(false);
  const [isReplaySyncDefaultsDialogOpen, setIsReplaySyncDefaultsDialogOpen] =
    useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [autosaveError, setAutosaveError] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [isLaunchCooldownActive, setIsLaunchCooldownActive] = useState(false);
  const [manualSaveTone, setManualSaveTone] = useState<'error' | 'success'>(
    'success',
  );
  const [manualSaveMessage, setManualSaveMessage] = useState('');
  const [statusTone, setStatusTone] = useState<'error' | 'success' | 'info'>(
    'info',
  );
  const [statusMessage, setStatusMessage] = useState('');
  const saveModeRef = useRef<SaveMode>('none');
  const hasInitializedSettingsRef = useRef(false);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchCooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastAutosavedPayloadRef = useRef('');
  const lastManualSavedPayloadRef = useRef('');
  const shouldForceReplayResyncAfterSaveRef = useRef(false);
  const {
    isLmuRunning,
    launchLmuDisabled,
    launchLmuTooltip,
    syncNowDisabled,
    syncNowTooltip,
    profileNationalityName,
    profileNationalityFlag,
    profileNationalityFlagImageUrl,
    lastSyncLabel,
    lastProfileSyncLabel,
    autosavePayload,
    manualSavePayload,
    manualSaveDisabled,
    areSystemPathsAtDefaults,
  } = useUserSettingsDerivedState({
    hasApiStatusResponse,
    isConnected,
    isLoading,
    isSaving,
    isLaunching,
    isLaunchCooldownActive,
    lastReplaySyncAt,
    persistedLastReplaySyncAt,
    lastProfileSyncAt,
    profileNationalityCode,
    automaticSyncEnabled,
    quickViewEnabled,
    syncOnAppLaunch,
    syncOnIntervalMinutes,
    persistDashboardFiltersEnabled,
    experimentalFeaturesEnabled,
    liveCaptureEnabled,
    stewardAuthorName,
    // replayLogMatchThresholdMinutes,
    anonymizeDriverData,
    telemetryCacheEnabled,
    clearCacheOnExit,
    lmuExecutablePath,
    lmuReplayDirectoryPath,
    closeLmuWhenStewardExits,
    hasInitializedSettings: hasInitializedSettingsRef.current,
    lastManualSavedPayload: lastManualSavedPayloadRef.current,
    isAutosaving,
  });

  const isReplaySyncDefaultsApplied = useMemo(() => {
    return (
      automaticSyncEnabled ===
        DEFAULT_REPLAY_SYNC_SETTINGS.automaticSyncEnabled &&
      syncOnAppLaunch === DEFAULT_REPLAY_SYNC_SETTINGS.syncOnAppLaunch &&
      quickViewEnabled === DEFAULT_REPLAY_SYNC_SETTINGS.quickViewEnabled &&
      syncOnIntervalMinutes ===
        DEFAULT_REPLAY_SYNC_SETTINGS.syncOnIntervalMinutes &&
      replayLogMatchThresholdMinutes ===
        DEFAULT_REPLAY_SYNC_SETTINGS.replayLogMatchThresholdMinutes
    );
  }, [
    automaticSyncEnabled,
    quickViewEnabled,
    replayLogMatchThresholdMinutes,
    syncOnAppLaunch,
    syncOnIntervalMinutes,
  ]);

  const persistUserSettings = (
    mode: SaveMode,
    payload: Record<string, unknown>,
  ) => {
    const payloadForPersistence = { ...payload };
    if (
      Object.prototype.hasOwnProperty.call(
        payloadForPersistence,
        'replayLogMatchThresholdMinutes',
      )
    ) {
      const thresholdMinutes = Number(
        payloadForPersistence.replayLogMatchThresholdMinutes,
      );

      if (Number.isFinite(thresholdMinutes)) {
        payloadForPersistence.replayLogMatchThresholdMs =
          Math.max(1, thresholdMinutes) * 60_000;
      }

      delete payloadForPersistence.replayLogMatchThresholdMinutes;
    }

    if (mode === 'manual') {
      setIsSaving(true);
      setManualSaveMessage('');
    }

    if (mode === 'auto') {
      setIsAutosaving(true);
      setAutosaveStatus('saving');
      setAutosaveError('');
      lastAutosavedPayloadRef.current = JSON.stringify(payload);
    }

    saveModeRef.current = mode;
    sendMessage(CONSTANTS.API.POST_USER_SETTINGS, payloadForPersistence);
  };

  useEffect(() => {
    const applyUserSettingsResponse = (response: ApiResponse) => {
      if (response?.status !== 'success') {
        return;
      }

      const resolvedPath =
        typeof response?.data?.lmuExecutablePath === 'string' &&
        response.data.lmuExecutablePath.trim().length > 0
          ? response.data.lmuExecutablePath.trim()
          : CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH;

      const resolvedReplayDirectoryPath =
        typeof response?.data?.lmuReplayDirectoryPath === 'string' &&
        response.data.lmuReplayDirectoryPath.trim().length > 0
          ? response.data.lmuReplayDirectoryPath.trim()
          : CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH;

      setLmuExecutablePath(resolvedPath);
      setLmuReplayDirectoryPath(resolvedReplayDirectoryPath);
      setAutomaticSyncEnabled(
        Boolean(response?.data?.automaticSyncEnabled ?? true),
      );
      setQuickViewEnabled(Boolean(response?.data?.quickViewEnabled ?? false));
      setSyncOnAppLaunch(Boolean(response?.data?.syncOnAppLaunch ?? true));
      const resolvedSyncIntervalMinutes = Number.isFinite(
        Number(response?.data?.syncOnIntervalMinutes),
      )
        ? Math.max(1, Number(response?.data?.syncOnIntervalMinutes))
        : 5;
      // const resolvedReplayLogMatchThresholdMs = Number.isFinite(
      //   Number(response?.data?.replayLogMatchThresholdMs),
      // )
      //   ? Math.max(60_000, Number(response?.data?.replayLogMatchThresholdMs))
      //   : DEFAULT_REPLAY_LOG_MATCH_THRESHOLD_MS;
      // const resolvedReplayLogMatchThresholdMinutes = Math.max(
      //   1,
      //   Math.round(resolvedReplayLogMatchThresholdMs / 60_000),
      // );
      setSyncOnIntervalMinutes(resolvedSyncIntervalMinutes);
      // setReplayLogMatchThresholdMinutes(resolvedReplayLogMatchThresholdMinutes);
      // setPendingReplayLogMatchThresholdMinutes(
      //   resolvedReplayLogMatchThresholdMinutes,
      // );
      const resolvedPersistDashboardFiltersEnabled = Boolean(
        response?.data?.persistDashboardFiltersEnabled ?? false,
      );
      const resolvedExperimentalFeaturesEnabled = Boolean(
        response?.data?.experimentalFeaturesEnabled ?? false,
      );
      const resolvedLiveCaptureEnabled = Boolean(
        response?.data?.liveCaptureEnabled ?? false,
      );
      const resolvedStewardAuthorName =
        typeof response?.data?.stewardAuthorName === 'string'
          ? response.data.stewardAuthorName.trim()
          : '';
      const resolvedAnonymizeDriverData = Boolean(
        response?.data?.anonymizeDriverData ?? false,
      );
      const resolvedTelemetryCacheEnabled = Boolean(
        response?.data?.telemetryCacheEnabled ?? true,
      );
      const resolvedClearCacheOnExit = Boolean(
        response?.data?.clearCacheOnExit ?? false,
      );
      const resolvedCloseLmuWhenStewardExits = Boolean(
        response?.data?.closeLmuWhenStewardExits ?? false,
      );
      const resolvedLastReplaySyncAt = Number.isFinite(
        Number(response?.data?.lastReplaySyncAt),
      )
        ? Number(response?.data?.lastReplaySyncAt)
        : null;

      setPersistDashboardFiltersEnabled(resolvedPersistDashboardFiltersEnabled);
      setExperimentalFeaturesEnabled(resolvedExperimentalFeaturesEnabled);
      setLiveCaptureEnabled(resolvedLiveCaptureEnabled);
      /*
        Null is a real value here — "never delete" — so it cannot be collapsed
        into the default with `??`. Only a missing key falls back to 30.
      */
      setLiveCaptureRetentionDays(
        response?.data?.liveCaptureRetentionDays === undefined
          ? 30
          : (response.data.liveCaptureRetentionDays as number | null),
      );
      setStewardAuthorName(resolvedStewardAuthorName);
      setAnonymizeDriverData(resolvedAnonymizeDriverData);
      setTelemetryCacheEnabled(resolvedTelemetryCacheEnabled);
      setClearCacheOnExit(resolvedClearCacheOnExit);
      setCloseLmuWhenStewardExits(resolvedCloseLmuWhenStewardExits);
      setPersistedLastReplaySyncAt(resolvedLastReplaySyncAt);

      lastAutosavedPayloadRef.current = JSON.stringify({
        automaticSyncEnabled: Boolean(
          response?.data?.automaticSyncEnabled ?? true,
        ),
        quickViewEnabled: Boolean(response?.data?.quickViewEnabled ?? false),
        syncOnAppLaunch: Boolean(response?.data?.syncOnAppLaunch ?? true),
        syncOnIntervalMinutes: resolvedSyncIntervalMinutes,
        persistDashboardFiltersEnabled: resolvedPersistDashboardFiltersEnabled,
        experimentalFeaturesEnabled: resolvedExperimentalFeaturesEnabled,
        liveCaptureEnabled: resolvedLiveCaptureEnabled,
        stewardAuthorName: resolvedStewardAuthorName,
        // replayLogMatchThresholdMinutes: resolvedReplayLogMatchThresholdMinutes,
        anonymizeDriverData: resolvedAnonymizeDriverData,
        telemetryCacheEnabled: resolvedTelemetryCacheEnabled,
        clearCacheOnExit: resolvedClearCacheOnExit,
      });
      lastManualSavedPayloadRef.current = JSON.stringify({
        lmuExecutablePath: resolvedPath,
        lmuReplayDirectoryPath: resolvedReplayDirectoryPath,
        closeLmuWhenStewardExits: resolvedCloseLmuWhenStewardExits,
      });
      hasInitializedSettingsRef.current = true;
    };

    const unsubscribeGetSettings = window.electron?.ipcRenderer.on(
      CONSTANTS.API.GET_USER_SETTINGS,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as ApiResponse;
        setIsLoading(false);

        if (response?.status !== 'success') {
          setStatusTone('error');
          setStatusMessage(
            response?.message || 'Unable to load your settings.',
          );
          return;
        }
        applyUserSettingsResponse(response);
      },
    );

    const unsubscribePushSettings = window.electron?.ipcRenderer.on(
      CONSTANTS.API.PUSH_USER_SETTINGS,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as ApiResponse;
        applyUserSettingsResponse(response);
      },
    );

    const unsubscribePostSettings = window.electron?.ipcRenderer.on(
      CONSTANTS.API.POST_USER_SETTINGS,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as ApiResponse;
        const currentSaveMode = saveModeRef.current;
        saveModeRef.current = 'none';

        if (currentSaveMode === 'manual') {
          setIsSaving(false);
        }

        if (currentSaveMode === 'auto') {
          setIsAutosaving(false);
        }

        if (response?.status !== 'success') {
          if (currentSaveMode === 'auto') {
            setAutosaveStatus('failed');
            setAutosaveError(
              response?.message || 'Unable to auto-save settings.',
            );
          } else {
            setManualSaveTone('error');
            setManualSaveMessage(
              response?.message || 'Unable to save settings.',
            );
          }
          return;
        }

        const resolvedPath =
          typeof response?.data?.lmuExecutablePath === 'string' &&
          response.data.lmuExecutablePath.trim().length > 0
            ? response.data.lmuExecutablePath.trim()
            : '';

        const resolvedReplayDirectoryPath =
          typeof response?.data?.lmuReplayDirectoryPath === 'string' &&
          response.data.lmuReplayDirectoryPath.trim().length > 0
            ? response.data.lmuReplayDirectoryPath.trim()
            : '';

        if (resolvedPath) {
          setLmuExecutablePath(resolvedPath);
        }

        if (resolvedReplayDirectoryPath) {
          setLmuReplayDirectoryPath(resolvedReplayDirectoryPath);
        }

        if (typeof response?.data?.automaticSyncEnabled === 'boolean') {
          setAutomaticSyncEnabled(response.data.automaticSyncEnabled);
        }

        if (typeof response?.data?.quickViewEnabled === 'boolean') {
          setQuickViewEnabled(response.data.quickViewEnabled);
        }

        if (typeof response?.data?.syncOnAppLaunch === 'boolean') {
          setSyncOnAppLaunch(response.data.syncOnAppLaunch);
        }

        if (Number.isFinite(Number(response?.data?.syncOnIntervalMinutes))) {
          setSyncOnIntervalMinutes(
            Math.max(1, Number(response?.data?.syncOnIntervalMinutes)),
          );
        }

        if (
          Number.isFinite(Number(response?.data?.replayLogMatchThresholdMs))
        ) {
          const nextReplayLogMatchThresholdMinutes = Math.max(
            1,
            Math.round(
              Number(response?.data?.replayLogMatchThresholdMs) / 60_000,
            ),
          );
          setReplayLogMatchThresholdMinutes(nextReplayLogMatchThresholdMinutes);
          setPendingReplayLogMatchThresholdMinutes(
            nextReplayLogMatchThresholdMinutes,
          );
        }

        if (
          typeof response?.data?.persistDashboardFiltersEnabled === 'boolean'
        ) {
          setPersistDashboardFiltersEnabled(
            response.data.persistDashboardFiltersEnabled,
          );
        }

        if (typeof response?.data?.experimentalFeaturesEnabled === 'boolean') {
          setExperimentalFeaturesEnabled(
            response.data.experimentalFeaturesEnabled,
          );
        }

        if (typeof response?.data?.liveCaptureEnabled === 'boolean') {
          setLiveCaptureEnabled(response.data.liveCaptureEnabled);
        }

        /*
          `stewardAuthorName` is deliberately not echoed back into state here.
          Every other autosaved field is a switch or a select, where the reply
          cannot arrive mid-change; this one is a text field on an 800 ms
          debounce, so writing the saved value back would delete whatever the
          steward typed while the round trip was in flight.
        */

        if (typeof response?.data?.anonymizeDriverData === 'boolean') {
          setAnonymizeDriverData(response.data.anonymizeDriverData);
        }

        if (typeof response?.data?.telemetryCacheEnabled === 'boolean') {
          setTelemetryCacheEnabled(response.data.telemetryCacheEnabled);
        }

        if (typeof response?.data?.clearCacheOnExit === 'boolean') {
          setClearCacheOnExit(response.data.clearCacheOnExit);
        }

        if (typeof response?.data?.closeLmuWhenStewardExits === 'boolean') {
          setCloseLmuWhenStewardExits(response.data.closeLmuWhenStewardExits);
        }

        if (currentSaveMode === 'auto') {
          setAutosaveStatus('saved');
          setAutosaveError('');

          if (shouldForceReplayResyncAfterSaveRef.current) {
            shouldForceReplayResyncAfterSaveRef.current = false;
            markReplayCacheResetRequired();
            setStatusTone('info');
            setStatusMessage(
              'Replay threshold updated. Replay cache will reset on the next replay sync.',
            );
          }
        } else {
          const persistedExecutablePath =
            typeof response?.data?.lmuExecutablePath === 'string' &&
            response.data.lmuExecutablePath.trim().length > 0
              ? response.data.lmuExecutablePath.trim()
              : CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH;
          const persistedReplayDirectoryPath =
            typeof response?.data?.lmuReplayDirectoryPath === 'string' &&
            response.data.lmuReplayDirectoryPath.trim().length > 0
              ? response.data.lmuReplayDirectoryPath.trim()
              : CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH;
          const persistedCloseLmuWhenStewardExits = Boolean(
            response?.data?.closeLmuWhenStewardExits ?? false,
          );

          lastManualSavedPayloadRef.current = JSON.stringify({
            lmuExecutablePath: persistedExecutablePath,
            lmuReplayDirectoryPath: persistedReplayDirectoryPath,
            closeLmuWhenStewardExits: persistedCloseLmuWhenStewardExits,
          });
          setManualSaveTone('success');
          setManualSaveMessage('Settings saved successfully.');
        }
      },
    );

    const unsubscribeClearLocalStorage = window.electron?.ipcRenderer.on(
      CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as ApiResponse;
        setIsClearingLocalStorage(false);

        if (response?.status !== 'success') {
          setStatusTone('error');
          setStatusMessage(
            response?.message || 'Unable to clear local storage.',
          );
          return;
        }

        setIsClearLocalStorageDialogOpen(false);
        setStatusTone('success');
        setStatusMessage('Local storage cleared. Default settings restored.');
        sendMessage(CONSTANTS.API.GET_USER_SETTINGS);
      },
    );

    const unsubscribeSelectExecutable = window.electron?.ipcRenderer.on(
      CONSTANTS.API.POST_SELECT_LMU_EXECUTABLE,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as ApiResponse;

        if (response?.status !== 'success') {
          setStatusTone('error');
          setStatusMessage(
            response?.message || 'Unable to select LMU executable path.',
          );
          return;
        }

        if (response?.data?.canceled) {
          return;
        }

        const selectedPath =
          typeof response?.data?.lmuExecutablePath === 'string'
            ? response.data.lmuExecutablePath.trim()
            : '';

        if (selectedPath) {
          setLmuExecutablePath(selectedPath);
        }
      },
    );

    const unsubscribeSelectReplayDirectory = window.electron?.ipcRenderer.on(
      CONSTANTS.API.POST_SELECT_LMU_REPLAY_DIRECTORY,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as ApiResponse;

        if (response?.status !== 'success') {
          setStatusTone('error');
          setStatusMessage(
            response?.message || 'Unable to select replay directory path.',
          );
          return;
        }

        if (response?.data?.canceled) {
          return;
        }

        const selectedPath =
          typeof response?.data?.lmuReplayDirectoryPath === 'string'
            ? response.data.lmuReplayDirectoryPath.trim()
            : '';

        if (selectedPath) {
          setLmuReplayDirectoryPath(selectedPath);
        }
      },
    );

    const unsubscribeLaunch = window.electron?.ipcRenderer.on(
      CONSTANTS.API.POST_LAUNCH_LMU,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as ApiResponse;
        setIsLaunching(false);

        if (response?.status !== 'success') {
          setStatusTone('error');
          setStatusMessage(response?.message || 'Unable to launch LMU.');
          return;
        }

        if (launchCooldownTimeoutRef.current) {
          clearTimeout(launchCooldownTimeoutRef.current);
        }

        setIsLaunchCooldownActive(true);
        launchCooldownTimeoutRef.current = setTimeout(() => {
          setIsLaunchCooldownActive(false);
        }, LMU_LAUNCH_COOLDOWN_MS);

        setStatusTone('info');
        setStatusMessage(
          'Launch request sent. Waiting for LMU to become available…',
        );
      },
    );

    const unsubscribeProfileInfo = window.electron?.ipcRenderer.on(
      CONSTANTS.API.GET_PROFILE_INFO,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as ApiResponse;
        setIsProfileSyncing(false);

        if (response?.status !== 'success') {
          setStatusTone('error');
          setStatusMessage(
            response?.message || 'Unable to load profile information.',
          );
          return;
        }

        const profileInfo = response?.data?.profileInfo;
        if (!profileInfo) {
          return;
        }

        setHasFetchedProfileInfo(
          Boolean(response?.data?.hasFetchedProfileInfo),
        );
        setProfileSource(response?.data?.source ?? 'none');
        setProfileName(
          String(profileInfo?.name ?? '').trim() || 'Unknown Steward',
        );
        setProfileNickname(String(profileInfo?.nick ?? '').trim() || 'N/A');
        setProfileSteamId(String(profileInfo?.steamID ?? '').trim() || 'N/A');
        setProfileNationalityCode(
          String(profileInfo?.nationality ?? '')
            .trim()
            .toUpperCase(),
        );
        setProfileLanguage(String(profileInfo?.language ?? '').trim() || '');

        if (Number.isFinite(Number(response?.data?.lastFetchedAt))) {
          setLastProfileSyncAt(Number(response?.data?.lastFetchedAt));
        }
      },
    );

    const unsubscribeRetentionPreview = window.electron?.ipcRenderer.on(
      CONSTANTS.API.GET_LIVE_RETENTION_PREVIEW,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as ApiResponse;
        setIsRetentionPreviewLoading(false);
        setRetentionPreview(
          response?.status === 'success'
            ? ((response.data as unknown as LiveRetentionPreview) ?? null)
            : null,
        );
      },
    );

    const unsubscribeLocalDataSummary = window.electron?.ipcRenderer.on(
      CONSTANTS.API.GET_LOCAL_DATA_SUMMARY,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as ApiResponse;
        setLocalDataSummary(
          response?.status === 'success'
            ? ((response.data as unknown as LocalDataSummary) ?? null)
            : null,
        );
      },
    );

    sendMessage(CONSTANTS.API.GET_USER_SETTINGS);
    sendMessage(CONSTANTS.API.GET_PROFILE_INFO);

    return () => {
      unsubscribeGetSettings?.();
      unsubscribePushSettings?.();
      unsubscribePostSettings?.();
      unsubscribeClearLocalStorage?.();
      unsubscribeSelectExecutable?.();
      unsubscribeSelectReplayDirectory?.();
      unsubscribeLaunch?.();
      unsubscribeProfileInfo?.();
      unsubscribeRetentionPreview?.();
      unsubscribeLocalDataSummary?.();

      if (launchCooldownTimeoutRef.current) {
        clearTimeout(launchCooldownTimeoutRef.current);
      }
    };
    // markReplayCacheResetRequired is a stable useCallback, so this still runs
    // only on mount.
  }, [markReplayCacheResetRequired]);

  useEffect(() => {
    if (
      !hasInitializedSettingsRef.current ||
      isLoading ||
      isSaving ||
      isLaunching
    ) {
      return undefined;
    }

    const nextAutosavePayload = JSON.stringify(autosavePayload);
    if (nextAutosavePayload === lastAutosavedPayloadRef.current) {
      return undefined;
    }

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      persistUserSettings('auto', autosavePayload);
    }, 800);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [autosavePayload, isLaunching, isLoading, isSaving]);

  useEffect(() => {
    if (!isLmuRunning) {
      return;
    }

    sendMessage(CONSTANTS.API.GET_PROFILE_INFO);
  }, [isLmuRunning]);

  const onSave = () => {
    persistUserSettings('manual', manualSavePayload);
  };

  const onReturnPathsToDefault = () => {
    setLmuExecutablePath(CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH);
    setLmuReplayDirectoryPath(CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH);
    setManualSaveTone('success');
    setManualSaveMessage(
      'Default LMU paths restored. Click Save Changes to persist.',
    );
  };

  const onSelectExecutablePath = () => {
    sendMessage(CONSTANTS.API.POST_SELECT_LMU_EXECUTABLE);
  };

  const onSelectReplayDirectoryPath = () => {
    sendMessage(CONSTANTS.API.POST_SELECT_LMU_REPLAY_DIRECTORY);
  };

  const onLaunchLmu = () => {
    setIsLaunching(true);
    setStatusMessage('');
    sendMessage(CONSTANTS.API.POST_LAUNCH_LMU);
  };

  const onSyncNow = () => {
    setStatusTone('info');
    setStatusMessage('Manual sync requested.');
    requestReplays();
  };

  const onSyncProfileNow = () => {
    setIsProfileSyncing(true);
    setStatusTone('info');
    setStatusMessage('Profile sync requested.');
    sendMessage(CONSTANTS.API.GET_PROFILE_INFO);
  };

  const onOpenClearLocalStorageDialog = () => {
    // Counted fresh each time the dialog opens: the warning has to name how
    // many decisions are about to be destroyed, and a stale number here is a
    // number the user makes an irreversible decision against.
    setLocalDataSummary(null);
    sendMessage(CONSTANTS.API.GET_LOCAL_DATA_SUMMARY);
    setIsClearLocalStorageDialogOpen(true);
  };

  /**
   * Retention is saved on its own, not through autosave.
   *
   * A longer window — or "never" — takes nothing away and is written straight
   * through. A shorter one deletes on the next write, so it is held until the
   * user has seen a summary of exactly what it would remove.
   */
  const isShorterRetention = (
    next: number | null,
    current: number | null,
  ): boolean => next !== null && (current === null || next < current);

  const saveRetentionDays = (nextValue: number | null) => {
    setLiveCaptureRetentionDays(nextValue);
    sendMessage(CONSTANTS.API.POST_USER_SETTINGS, {
      liveCaptureRetentionDays: nextValue,
    });
  };

  const onRetentionChangeRequest = (nextValue: number | null) => {
    if (nextValue === liveCaptureRetentionDays) {
      return;
    }

    if (!isShorterRetention(nextValue, liveCaptureRetentionDays)) {
      saveRetentionDays(nextValue);
      return;
    }

    setPendingRetentionDays(nextValue);
    setRetentionPreview(null);
    setIsRetentionPreviewLoading(true);
    sendMessage(CONSTANTS.API.GET_LIVE_RETENTION_PREVIEW, nextValue);
  };

  const onConfirmRetentionChange = () => {
    if (pendingRetentionDays !== undefined) {
      saveRetentionDays(pendingRetentionDays);
    }
    setPendingRetentionDays(undefined);
    setRetentionPreview(null);
  };

  const onCancelRetentionChange = () => {
    setPendingRetentionDays(undefined);
    setRetentionPreview(null);
  };

  const _onReplayLogThresholdMinutesChangeRequest = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) {
      return;
    }

    const normalizedNextValue = Math.max(1, nextValue);
    if (normalizedNextValue === replayLogMatchThresholdMinutes) {
      return;
    }

    setPendingReplayLogMatchThresholdMinutes(normalizedNextValue);
    setIsReplayThresholdDialogOpen(true);
  };

  const _onCancelReplayThresholdChange = () => {
    setPendingReplayLogMatchThresholdMinutes(replayLogMatchThresholdMinutes);
    setIsReplayThresholdDialogOpen(false);
  };

  const _onConfirmReplayThresholdChange = () => {
    setReplayLogMatchThresholdMinutes(pendingReplayLogMatchThresholdMinutes);
    shouldForceReplayResyncAfterSaveRef.current = true;
    setIsReplayThresholdDialogOpen(false);
  };

  const onOpenReplaySyncDefaultsDialog = () => {
    setIsReplaySyncDefaultsDialogOpen(true);
  };

  const onCloseReplaySyncDefaultsDialog = () => {
    setIsReplaySyncDefaultsDialogOpen(false);
  };

  const onConfirmReplaySyncDefaults = () => {
    const willChangeThreshold =
      replayLogMatchThresholdMinutes !==
      DEFAULT_REPLAY_SYNC_SETTINGS.replayLogMatchThresholdMinutes;

    setAutomaticSyncEnabled(DEFAULT_REPLAY_SYNC_SETTINGS.automaticSyncEnabled);
    setSyncOnAppLaunch(DEFAULT_REPLAY_SYNC_SETTINGS.syncOnAppLaunch);
    setQuickViewEnabled(DEFAULT_REPLAY_SYNC_SETTINGS.quickViewEnabled);
    setSyncOnIntervalMinutes(
      DEFAULT_REPLAY_SYNC_SETTINGS.syncOnIntervalMinutes,
    );
    setReplayLogMatchThresholdMinutes(
      DEFAULT_REPLAY_SYNC_SETTINGS.replayLogMatchThresholdMinutes,
    );
    setPendingReplayLogMatchThresholdMinutes(
      DEFAULT_REPLAY_SYNC_SETTINGS.replayLogMatchThresholdMinutes,
    );

    if (willChangeThreshold) {
      shouldForceReplayResyncAfterSaveRef.current = true;
    }

    setStatusTone('info');
    setStatusMessage('Replay sync defaults restored.');
    setIsReplaySyncDefaultsDialogOpen(false);
  };

  const onCloseClearLocalStorageDialog = () => {
    if (isClearingLocalStorage) {
      return;
    }

    setIsClearLocalStorageDialogOpen(false);
  };

  useEffect(() => {
    requestImportedReplays();
  }, [requestImportedReplays]);

  /*
   * Sizes are not carried on the record, so this is an estimate from the
   * replay's own size rather than a stat of each file. It is only used to give
   * the confirmation a sense of scale.
   */
  useEffect(() => {
    setImportedReplayBytes(
      (importedReplays ?? []).reduce(
        (total, replay) => total + Number(replay.size ?? 0),
        0,
      ),
    );
  }, [importedReplays]);

  const onConfirmClearLocalStorage = () => {
    setIsClearingLocalStorage(true);
    setStatusMessage('');

    /*
     * Files first, then storage. Clearing storage destroys the rows holding the
     * paths, so a failure the other way round would orphan exactly what this
     * prompt exists to prevent.
     */
    if (deleteImportedFilesOnClear && (importedReplays?.length ?? 0) > 0) {
      deleteImportedReplays(importedReplays.map((replay) => replay.hash));
    }

    sendMessage(CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE);
  };

  return (
    <>
      <ViewHeader
        breadcrumb={
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ cursor: 'pointer' }}
              onClick={() => navigate('/replays')}
            >
              Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary">
              /
            </Typography>
            <Typography variant="caption" color="primary.main" fontWeight={700}>
              User Settings
            </Typography>
          </Stack>
        }
        title="User Settings"
        subtitle="Configure your LMU Steward preferences and paths."
        onBack={() => navigate('/replays')}
      />

      <Box sx={{ mt: 3 }}>
        <Stack spacing={2}>
          <Paper
            variant="outlined"
            sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}
          >
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={700}>
                Profile Information
              </Typography>
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                marginBottom="12px !important"
              >
                <Avatar sx={{ width: 44, height: 44, fontSize: '1.25rem' }}>
                  {getProfileInitials(profileName)}
                </Avatar>
                <Typography color="text.secondary" variant="body2">
                  Profile is read-only and sourced from LMU API when available.
                </Typography>
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                <TextField
                  fullWidth
                  label="Name"
                  value={profileName}
                  InputProps={{ readOnly: true }}
                  sx={READ_ONLY_VALUE_COLOR_SX}
                />
                <TextField
                  fullWidth
                  label="Nickname"
                  value={profileNickname}
                  InputProps={{ readOnly: true }}
                  sx={READ_ONLY_VALUE_COLOR_SX}
                />
                <TextField
                  fullWidth
                  label="Steam ID"
                  value={profileSteamId}
                  InputProps={{ readOnly: true }}
                  sx={READ_ONLY_VALUE_COLOR_SX}
                />
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                <TextField
                  fullWidth
                  label="Nationality"
                  value={profileNationalityName}
                  InputProps={{
                    readOnly: true,
                    startAdornment: (
                      <InputAdornment position="start" sx={{ mr: 0.5 }}>
                        {profileNationalityFlagImageUrl ? (
                          <Box
                            component="img"
                            src={profileNationalityFlagImageUrl}
                            alt={`${profileNationalityName} flag`}
                            sx={{
                              width: 24,
                              height: 18,
                              borderRadius: '2px',
                              objectFit: 'cover',
                            }}
                          />
                        ) : (
                          <Typography
                            sx={{
                              fontFamily:
                                '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
                              lineHeight: 1,
                              mr: '12px',
                            }}
                          >
                            {profileNationalityFlag}
                          </Typography>
                        )}
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    ...READ_ONLY_VALUE_COLOR_SX,
                    minWidth: `calc(${LONGEST_COUNTRY_NAME.length}ch + 16px)`,
                  }}
                />
                <TextField
                  fullWidth
                  label="Language"
                  value={profileLanguage || 'Unknown'}
                  InputProps={{ readOnly: true }}
                  sx={READ_ONLY_VALUE_COLOR_SX}
                />
              </Stack>

              <Divider sx={{ borderColor: 'divider' }} />

              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography variant="caption" color="text.secondary">
                  {`Last profile sync: ${lastProfileSyncLabel}`}
                </Typography>
                <Tooltip
                  title={
                    isLmuRunning
                      ? 'Fetch latest profile info from LMU API.'
                      : 'Profile sync needs LMU API to be connected.'
                  }
                >
                  <span>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={onSyncProfileNow}
                      disabled={
                        isLoading ||
                        isSaving ||
                        isProfileSyncing ||
                        !isLmuRunning
                      }
                    >
                      Sync Now
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Stack>
          </Paper>

          <Paper
            variant="outlined"
            sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}
          >
            <Stack spacing={2}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography variant="h6" fontWeight={700}>
                  System Configuration
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="outlined"
                    onClick={onReturnPathsToDefault}
                    disabled={
                      isLoading ||
                      isSaving ||
                      isLaunching ||
                      isAutosaving ||
                      areSystemPathsAtDefaults
                    }
                  >
                    Return to Defaults
                  </Button>
                  <Button
                    variant="contained"
                    onClick={onSave}
                    disabled={manualSaveDisabled}
                  >
                    Save Changes
                  </Button>
                </Stack>
              </Stack>
              <Typography color="text.secondary">
                Configure LMU paths used for launching and replay discovery.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Executable path must target Le Mans Ultimate.exe inside the Le
                Mans Ultimate folder. Replay directory must include
                UserData\Replays in the same installation path.
              </Typography>

              {manualSaveMessage ? (
                <Typography
                  variant="caption"
                  color={
                    manualSaveTone === 'error' ? 'error.main' : 'success.main'
                  }
                >
                  {manualSaveMessage}
                </Typography>
              ) : null}

              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={1.5}
                alignItems="center"
              >
                <TextField
                  fullWidth
                  label="LMU Executable Path"
                  value={lmuExecutablePath}
                  onChange={(event) => setLmuExecutablePath(event.target.value)}
                  placeholder={CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH}
                  disabled={isLoading || isSaving || isLaunching}
                />
                <Button
                  variant="outlined"
                  onClick={onSelectExecutablePath}
                  disabled={isLoading || isSaving || isLaunching}
                  sx={{ minWidth: 180 }}
                >
                  Select Executable
                </Button>
              </Stack>

              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={1.5}
                alignItems="center"
              >
                <TextField
                  fullWidth
                  label="Path to LMU Replay Directory"
                  value={lmuReplayDirectoryPath}
                  onChange={(event) =>
                    setLmuReplayDirectoryPath(event.target.value)
                  }
                  placeholder={CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH}
                  disabled={isLoading || isSaving || isLaunching}
                />
                <Button
                  variant="outlined"
                  onClick={onSelectReplayDirectoryPath}
                  disabled={isLoading || isSaving || isLaunching}
                  sx={{ minWidth: 180 }}
                >
                  Select Folder
                </Button>
              </Stack>

              <Stack direction="row" spacing={1.5}>
                <Tooltip title={launchLmuTooltip}>
                  <span>
                    <Button
                      variant="outlined"
                      onClick={onLaunchLmu}
                      disabled={launchLmuDisabled}
                    >
                      Launch LMU
                    </Button>
                  </span>
                </Tooltip>
              </Stack>

              <Typography variant="caption" color="text.secondary">
                Online gameplay will be disabled if you open LMU from here.
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={closeLmuWhenStewardExits}
                    onChange={(_, checked) =>
                      setCloseLmuWhenStewardExits(checked)
                    }
                    disabled={
                      isLoading || isSaving || isLaunching || isAutosaving
                    }
                  />
                }
                label="Close LMU when LMU Steward exits"
              />

              <Typography variant="caption" color="text.secondary">
                When enabled, LMU can be closed automatically during LMU Steward
                shutdown.
              </Typography>

              <Typography variant="caption" color="text.secondary">
                {isLmuRunning
                  ? 'LMU appears to be running. Launch is disabled while connected.'
                  : 'Launch is enabled when LMU is not running.'}
              </Typography>
            </Stack>
          </Paper>

          <Paper
            variant="outlined"
            sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}
          >
            <Stack spacing={1.5}>
              <Typography variant="h6" fontWeight={700}>
                Replay Sync
              </Typography>
              <Box>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={onOpenReplaySyncDefaultsDialog}
                  disabled={
                    isLoading ||
                    isSaving ||
                    isLaunching ||
                    isAutosaving ||
                    isReplaySyncDefaultsApplied
                  }
                >
                  Return Replay Sync to Defaults
                </Button>
              </Box>
              <Typography color="text.secondary" variant="body2">
                Configure automatic sync behavior and run manual sync when
                needed.
              </Typography>

              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 2,
                }}
              >
                <Stack spacing={1.5}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        Enable Automatic Sync
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Automatically sync replay metadata while LMU Steward is
                        running.
                      </Typography>
                    </Box>
                    <Switch
                      checked={automaticSyncEnabled}
                      onChange={(_, checked) =>
                        setAutomaticSyncEnabled(checked)
                      }
                      disabled={
                        isLoading || isSaving || isLaunching || isAutosaving
                      }
                    />
                  </Stack>

                  <Divider sx={{ borderColor: 'divider' }} />

                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        Sync on App Launch
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Run an initial sync automatically when this app starts.
                      </Typography>
                    </Box>
                    <Switch
                      checked={syncOnAppLaunch}
                      onChange={(_, checked) => setSyncOnAppLaunch(checked)}
                      disabled={
                        isLoading ||
                        isSaving ||
                        isLaunching ||
                        isAutosaving ||
                        !automaticSyncEnabled
                      }
                    />
                  </Stack>

                  <Divider sx={{ borderColor: 'divider' }} />

                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        Quick View Mode
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Open replay analysis pages without loading replay
                        playback in LMU. Some replay-dependent data (such as
                        live replay controls and full API-backed details) will
                        be unavailable until you load the replay.
                      </Typography>
                    </Box>
                    <Switch
                      checked={quickViewEnabled}
                      onChange={(_, checked) => setQuickViewEnabled(checked)}
                      disabled={
                        isLoading || isSaving || isLaunching || isAutosaving
                      }
                    />
                  </Stack>

                  <Divider sx={{ borderColor: 'divider' }} />

                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', md: 'center' }}
                    spacing={1.5}
                  >
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        Sync Interval
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Choose how often background sync should run.
                      </Typography>
                    </Box>
                    <TextField
                      select
                      size="small"
                      label="Minutes"
                      value={String(syncOnIntervalMinutes)}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setSyncOnIntervalMinutes(
                          Number.isFinite(nextValue)
                            ? Math.max(1, nextValue)
                            : 5,
                        );
                      }}
                      disabled={
                        isLoading ||
                        isSaving ||
                        isLaunching ||
                        isAutosaving ||
                        !automaticSyncEnabled
                      }
                      sx={{ minWidth: 140 }}
                    >
                      {[1, 5, 10, 15, 30, 60].map((minutes) => (
                        <MenuItem key={minutes} value={String(minutes)}>
                          {minutes}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack>

                  <Divider sx={{ borderColor: 'divider' }} />

                  {/* <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', md: 'center' }}
                    spacing={1.5}
                  >
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        Log Match Window
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          Controls how far apart replay and log timestamps can be when
                          matching data.
                        </Typography>
                        <Tooltip
                          title="This setting helps resolve cases where replay details do not match the associated log details. LMU can write replay and log files at slightly different times depending on machine performance and disk behavior, so the ideal window may vary between systems. Change this only if replay information does not match log information."
                        >
                          <InfoOutlinedIcon
                            data-testid="log-match-window-info-icon"
                            fontSize="inherit"
                            sx={{
                              color: 'text.secondary',
                              cursor: 'help',
                              fontSize: '0.95rem',
                            }}
                          />
                        </Tooltip>
                      </Box>
                    </Box>
                    <TextField
                      select
                      size="small"
                      label="Minutes"
                      value={String(replayLogMatchThresholdMinutes)}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        onReplayLogThresholdMinutesChangeRequest(nextValue);
                      }}
                      disabled={
                        isLoading ||
                        isSaving ||
                        isLaunching ||
                        isAutosaving
                      }
                      sx={{ minWidth: 140 }}
                    >
                      {REPLAY_LOG_MATCH_THRESHOLD_MINUTES_OPTIONS.map((minutes) => (
                        <MenuItem key={minutes} value={String(minutes)}>
                          {minutes}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack> */}
                  {/* <Typography variant="caption" color="warning.main">
                    Changing this value clears cached replay mappings and reprocesses replay
                    log associations.
                  </Typography> */}

                  {/* <Divider sx={{ borderColor: 'divider' }} /> */}

                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography variant="caption" color="text.secondary">
                      {`Last sync: ${lastSyncLabel}`}
                    </Typography>
                    <Tooltip title={syncNowTooltip}>
                      <span>
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={syncNowDisabled}
                          onClick={onSyncNow}
                        >
                          Sync Now
                        </Button>
                      </span>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          </Paper>

          <Paper
            variant="outlined"
            sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}
          >
            <Stack spacing={1.5}>
              <Typography variant="h6" fontWeight={700}>
                Session Replays
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Configure how the session replay list behaves between visits.
              </Typography>

              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 2,
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      Remember Filters and Sorting
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Restore the filters and sort order you last used on the
                      session replay list when LMU Steward starts. When
                      disabled, the list opens unfiltered and sorted by newest
                      session.
                    </Typography>
                  </Box>
                  <Switch
                    checked={persistDashboardFiltersEnabled}
                    onChange={(_, checked) =>
                      setPersistDashboardFiltersEnabled(checked)
                    }
                    disabled={
                      isLoading || isSaving || isLaunching || isAutosaving
                    }
                  />
                </Stack>
              </Box>
            </Stack>
          </Paper>

          <Paper
            variant="outlined"
            sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}
          >
            <Stack spacing={1.5}>
              <Typography variant="h6" fontWeight={700}>
                Experimental Features
              </Typography>
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 2,
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      Enable Experimental Features
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Turn on features that are still being tested. They may
                      change, behave incorrectly on some setups, or be removed
                      in a later release. Everything already in LMU Steward
                      keeps working either way.
                    </Typography>
                  </Box>
                  <Switch
                    checked={experimentalFeaturesEnabled}
                    onChange={(_, checked) =>
                      setExperimentalFeaturesEnabled(checked)
                    }
                    disabled={
                      isLoading || isSaving || isLaunching || isAutosaving
                    }
                  />
                </Stack>
              </Box>

              {/*
                Its own switch on top of the experimental gate. The capture
                sidecar takes a machine-wide lock that wheel LED and motion
                software also use, so turning experimental features on must not
                start reading shared memory on its own.
              */}
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 2,
                  opacity: experimentalFeaturesEnabled ? 1 : 0.5,
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      Live Capture
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Reads LMU&apos;s shared memory while the game is running
                      so live stewarding can capture incidents as they happen.
                      This briefly takes a lock that wheel LED and motion
                      software also use — leave it off if you see those
                      misbehave. Needs Experimental Features on.
                    </Typography>
                  </Box>
                  <Switch
                    checked={experimentalFeaturesEnabled && liveCaptureEnabled}
                    onChange={(_, checked) => setLiveCaptureEnabled(checked)}
                    disabled={
                      !experimentalFeaturesEnabled ||
                      isLoading ||
                      isSaving ||
                      isLaunching ||
                      isAutosaving
                    }
                  />
                </Stack>

                {/*
                  Retention sits with capture because it is the cost of having
                  it on: a contact window is ~100 KB and a long race records
                  hundreds, so an install left alone grows without bound.

                  Saved on its own rather than through autosave — shortening the
                  window destroys data and has to be confirmed first.
                */}
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mt: 2 }}
                >
                  <Box sx={{ pr: 2 }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      Keep Captured Sessions
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Captured sessions and their telemetry are removed once
                      they pass this age, whether or not they are linked to a
                      replay. Steward decisions are never deleted.
                    </Typography>
                  </Box>
                  <TextField
                    select
                    size="small"
                    sx={{ minWidth: 140 }}
                    value={
                      liveCaptureRetentionDays === null
                        ? 'never'
                        : String(liveCaptureRetentionDays)
                    }
                    onChange={(changeEvent) => {
                      const { value } = changeEvent.target;
                      onRetentionChangeRequest(
                        value === 'never' ? null : Number(value),
                      );
                    }}
                    disabled={
                      !experimentalFeaturesEnabled || isLoading || isSaving
                    }
                  >
                    <MenuItem value="7">7 days</MenuItem>
                    <MenuItem value="30">30 days</MenuItem>
                    <MenuItem value="90">90 days</MenuItem>
                    <MenuItem value="never">Never delete</MenuItem>
                  </TextField>
                </Stack>
              </Box>

              {/*
                Beside capture rather than inside it, and not dimmed with it. The
                replay dossier adjudicates a capture that already exists, so a
                steward can still be making calls — and needing to be named on
                them — with the capture switch off.
              */}
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 2,
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Box sx={{ pr: 2 }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      Steward Name
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Recorded on every decision you make from now on, and
                      carried into CSV, Markdown and JSON exports, so a call can
                      be attributed on appeal. Decisions already made keep the
                      name they were made under. Left blank, new decisions are
                      recorded as &quot;{DEFAULT_STEWARD_AUTHOR}&quot;.
                    </Typography>
                  </Box>
                  <TextField
                    size="small"
                    sx={{ minWidth: 220 }}
                    value={stewardAuthorName}
                    placeholder={DEFAULT_STEWARD_AUTHOR}
                    inputProps={{ maxLength: 60, 'aria-label': 'Steward name' }}
                    onChange={(changeEvent) =>
                      setStewardAuthorName(changeEvent.target.value)
                    }
                    disabled={isLoading || isSaving || isLaunching}
                  />
                </Stack>
              </Box>

              {/*
                Rendered whether the toggle is on or off — someone deciding
                whether to enable it needs to see what they would be enabling.
              */}
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 2,
                }}
              >
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    What&apos;s experimental right now
                  </Typography>
                  {CONSTANTS.EXPERIMENTAL_FEATURES.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      No experimental features at the moment. Everything in LMU
                      Steward is fully released.
                    </Typography>
                  ) : (
                    CONSTANTS.EXPERIMENTAL_FEATURES.map((feature) => (
                      <Box key={feature.id}>
                        <Typography variant="body2" fontWeight={600}>
                          {feature.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {feature.description}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Stack>
              </Box>
            </Stack>
          </Paper>

          <Paper
            variant="outlined"
            sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}
          >
            <Stack spacing={1.5}>
              <Typography variant="h6" fontWeight={700}>
                Local Storage
              </Typography>
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 2,
                }}
              >
                <Stack spacing={1.5}>
                  <Typography variant="body2" color="text.secondary">
                    Clearing local storage removes LMU Steward data saved on
                    this device, such as replay metadata and cached app state.
                    This does not uninstall LMU.
                  </Typography>
                  <Box>
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={onOpenClearLocalStorageDialog}
                      disabled={
                        isLoading ||
                        isSaving ||
                        isLaunching ||
                        isAutosaving ||
                        isClearingLocalStorage
                      }
                    >
                      {isClearingLocalStorage
                        ? 'Clearing…'
                        : 'Clear Local Storage'}
                    </Button>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </Paper>

          <UserSettingsClearStorageDialog
            open={isClearLocalStorageDialogOpen}
            isClearingLocalStorage={isClearingLocalStorage}
            importedReplayCount={importedReplays?.length ?? 0}
            importedReplayBytes={importedReplayBytes}
            deleteImportedFiles={deleteImportedFilesOnClear}
            onDeleteImportedFilesChange={setDeleteImportedFilesOnClear}
            onClose={onCloseClearLocalStorageDialog}
            onConfirm={onConfirmClearLocalStorage}
            localDataSummary={localDataSummary}
          />

          <RetentionShorteningDialog
            open={pendingRetentionDays !== undefined}
            retentionDays={pendingRetentionDays ?? null}
            preview={retentionPreview}
            isLoading={isRetentionPreviewLoading}
            onCancel={onCancelRetentionChange}
            onConfirm={onConfirmRetentionChange}
          />

          {/* <UserSettingsReplayThresholdDialog
            open={isReplayThresholdDialogOpen}
            nextThresholdMinutes={pendingReplayLogMatchThresholdMinutes}
            onClose={onCancelReplayThresholdChange}
            onConfirm={onConfirmReplayThresholdChange}
          /> */}

          <UserSettingsReplaySyncDefaultsDialog
            open={isReplaySyncDefaultsDialogOpen}
            willResetReplayCache={
              replayLogMatchThresholdMinutes !==
              DEFAULT_REPLAY_SYNC_SETTINGS.replayLogMatchThresholdMinutes
            }
            onClose={onCloseReplaySyncDefaultsDialog}
            onConfirm={onConfirmReplaySyncDefaults}
          />

          {statusMessage ? (
            <Typography
              variant="body2"
              color={
                statusTone === 'error'
                  ? 'error.main'
                  : statusTone === 'success'
                    ? 'success.main'
                    : 'text.secondary'
              }
            >
              {statusMessage}
            </Typography>
          ) : null}
        </Stack>

        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            mt: 2,
            px: 2,
            py: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            zIndex: 2,
          }}
        >
          <UserSettingsAutosaveStatus
            autosaveStatus={autosaveStatus}
            autosaveError={autosaveError}
          />
        </Box>
      </Box>
    </>
  );
};
