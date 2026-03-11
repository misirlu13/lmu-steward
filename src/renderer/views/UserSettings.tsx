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
import { useNavigate } from 'react-router-dom';
import { ViewHeader } from '../components/Common/ViewHeader';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';
import { getProfileInitials } from '../utils/profileInitials';
import {
  LONGEST_COUNTRY_NAME,
  LMU_LAUNCH_COOLDOWN_MS,
  READ_ONLY_VALUE_COLOR_SX,
} from '../utils/userSettingsHelpers';
import { UserSettingsClearStorageDialog } from '../components/UserSettings/UserSettingsClearStorageDialog';
import { UserSettingsAutosaveStatus } from '../components/UserSettings/UserSettingsAutosaveStatus';
import { useUserSettingsDerivedState } from '../hooks/useUserSettingsDerivedState';

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
  const { isConnected, hasApiStatusResponse, lastReplaySyncAt, requestReplays } = useApi();
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
  const [profileSource, setProfileSource] = useState<'live' | 'cache' | 'none'>('none');
  const [hasFetchedProfileInfo, setHasFetchedProfileInfo] = useState(false);
  const [lastProfileSyncAt, setLastProfileSyncAt] = useState<number | null>(null);
  const [isProfileSyncing, setIsProfileSyncing] = useState(false);
  const [automaticSyncEnabled, setAutomaticSyncEnabled] = useState(true);
  const [quickViewEnabled, setQuickViewEnabled] = useState(false);
  const [syncOnAppLaunch, setSyncOnAppLaunch] = useState(true);
  const [syncOnIntervalMinutes, setSyncOnIntervalMinutes] = useState(5);
  const [anonymizeDriverData, setAnonymizeDriverData] = useState(false);
  const [telemetryCacheEnabled, setTelemetryCacheEnabled] = useState(true);
  const [clearCacheOnExit, setClearCacheOnExit] = useState(false);
  const [closeLmuWhenStewardExits, setCloseLmuWhenStewardExits] = useState(false);
  const [persistedLastReplaySyncAt, setPersistedLastReplaySyncAt] = useState<number | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [isClearingLocalStorage, setIsClearingLocalStorage] = useState(false);
  const [isClearLocalStorageDialogOpen, setIsClearLocalStorageDialogOpen] =
    useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [autosaveError, setAutosaveError] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [isLaunchCooldownActive, setIsLaunchCooldownActive] = useState(false);
  const [manualSaveTone, setManualSaveTone] = useState<'error' | 'success'>('success');
  const [manualSaveMessage, setManualSaveMessage] = useState('');
  const [statusTone, setStatusTone] = useState<'error' | 'success' | 'info'>('info');
  const [statusMessage, setStatusMessage] = useState('');
  const saveModeRef = useRef<SaveMode>('none');
  const hasInitializedSettingsRef = useRef(false);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchCooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutosavedPayloadRef = useRef('');
  const lastManualSavedPayloadRef = useRef('');
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
    hasManualUnsavedChanges,
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

  const persistUserSettings = (mode: SaveMode, payload: Record<string, unknown>) => {
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
    sendMessage(CONSTANTS.API.POST_USER_SETTINGS, payload);
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
      setAutomaticSyncEnabled(Boolean(response?.data?.automaticSyncEnabled ?? true));
      setQuickViewEnabled(Boolean(response?.data?.quickViewEnabled ?? false));
      setSyncOnAppLaunch(Boolean(response?.data?.syncOnAppLaunch ?? true));
      const resolvedSyncIntervalMinutes =
        Number.isFinite(Number(response?.data?.syncOnIntervalMinutes))
          ? Math.max(1, Number(response?.data?.syncOnIntervalMinutes))
          : 5;
      setSyncOnIntervalMinutes(
        resolvedSyncIntervalMinutes,
      );
      const resolvedAnonymizeDriverData = Boolean(
        response?.data?.anonymizeDriverData ?? false,
      );
      const resolvedTelemetryCacheEnabled = Boolean(
        response?.data?.telemetryCacheEnabled ?? true,
      );
      const resolvedClearCacheOnExit = Boolean(response?.data?.clearCacheOnExit ?? false);
      const resolvedCloseLmuWhenStewardExits = Boolean(
        response?.data?.closeLmuWhenStewardExits ?? false,
      );
      const resolvedLastReplaySyncAt = Number.isFinite(
        Number(response?.data?.lastReplaySyncAt),
      )
        ? Number(response?.data?.lastReplaySyncAt)
        : null;

      setAnonymizeDriverData(resolvedAnonymizeDriverData);
      setTelemetryCacheEnabled(resolvedTelemetryCacheEnabled);
      setClearCacheOnExit(resolvedClearCacheOnExit);
      setCloseLmuWhenStewardExits(resolvedCloseLmuWhenStewardExits);
      setPersistedLastReplaySyncAt(resolvedLastReplaySyncAt);

      lastAutosavedPayloadRef.current = JSON.stringify({
        automaticSyncEnabled: Boolean(response?.data?.automaticSyncEnabled ?? true),
        quickViewEnabled: Boolean(response?.data?.quickViewEnabled ?? false),
        syncOnAppLaunch: Boolean(response?.data?.syncOnAppLaunch ?? true),
        syncOnIntervalMinutes: resolvedSyncIntervalMinutes,
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
            setAutosaveError(response?.message || 'Unable to auto-save settings.');
          } else {
            setManualSaveTone('error');
            setManualSaveMessage(response?.message || 'Unable to save settings.');
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
          setStatusMessage(response?.message || 'Unable to clear local storage.');
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
        setStatusMessage('Launch request sent. Waiting for LMU to become available…');
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

        setHasFetchedProfileInfo(Boolean(response?.data?.hasFetchedProfileInfo));
        setProfileSource(response?.data?.source ?? 'none');
        setProfileName(String(profileInfo?.name ?? '').trim() || 'Unknown Steward');
        setProfileNickname(String(profileInfo?.nick ?? '').trim() || 'N/A');
        setProfileSteamId(String(profileInfo?.steamID ?? '').trim() || 'N/A');
        setProfileNationalityCode(String(profileInfo?.nationality ?? '').trim().toUpperCase());
        setProfileLanguage(String(profileInfo?.language ?? '').trim() || '');

        if (Number.isFinite(Number(response?.data?.lastFetchedAt))) {
          setLastProfileSyncAt(Number(response?.data?.lastFetchedAt));
        }
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

      if (launchCooldownTimeoutRef.current) {
        clearTimeout(launchCooldownTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasInitializedSettingsRef.current || isLoading || isSaving || isLaunching) {
      return;
    }

    const nextAutosavePayload = JSON.stringify(autosavePayload);
    if (nextAutosavePayload === lastAutosavedPayloadRef.current) {
      return;
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
    setManualSaveMessage('Default LMU paths restored. Click Save Changes to persist.');
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
    setIsClearLocalStorageDialogOpen(true);
  };

  const onCloseClearLocalStorageDialog = () => {
    if (isClearingLocalStorage) {
      return;
    }

    setIsClearLocalStorageDialogOpen(false);
  };

  const onConfirmClearLocalStorage = () => {
    setIsClearingLocalStorage(true);
    setStatusMessage('');
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
              onClick={() => navigate('/')}
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
        onBack={() => navigate('/')}
      />

      <Box sx={{ mt: 3 }}>
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={700}>
                Profile Information
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center" marginBottom="12px !important">
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
                            sx={{ width: 24, height: 18, borderRadius: '2px', objectFit: 'cover' }}
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

              <Stack direction="row" justifyContent="space-between" alignItems="center">
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
                      disabled={isLoading || isSaving || isProfileSyncing || !isLmuRunning}
                    >
                      Sync Now
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" fontWeight={700}>
                  System Configuration
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="outlined"
                    onClick={onReturnPathsToDefault}
                    disabled={
                      isLoading || isSaving || isLaunching || isAutosaving || areSystemPathsAtDefaults
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
                Executable path must target Le Mans Ultimate.exe inside the Le Mans Ultimate folder.
                Replay directory must include UserData\Replays in the same installation path.
              </Typography>

              {manualSaveMessage ? (
                <Typography
                  variant="caption"
                  color={manualSaveTone === 'error' ? 'error.main' : 'success.main'}
                >
                  {manualSaveMessage}
                </Typography>
              ) : null}

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="center">
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

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="center">
                <TextField
                  fullWidth
                  label="Path to LMU Replay Directory"
                  value={lmuReplayDirectoryPath}
                  onChange={(event) => setLmuReplayDirectoryPath(event.target.value)}
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

              <FormControlLabel
                control={
                  <Switch
                    checked={closeLmuWhenStewardExits}
                    onChange={(_, checked) => setCloseLmuWhenStewardExits(checked)}
                    disabled={isLoading || isSaving || isLaunching || isAutosaving}
                  />
                }
                label="Close LMU when LMU Steward exits"
              />

              <Typography variant="caption" color="text.secondary">
                When enabled, LMU can be closed automatically during LMU Steward shutdown.
              </Typography>

              <Typography variant="caption" color="text.secondary">
                {isLmuRunning
                  ? 'LMU appears to be running. Launch is disabled while connected.'
                  : 'Launch is enabled when LMU is not running.'}
              </Typography>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}>
            <Stack spacing={1.5}>
              <Typography variant="h6" fontWeight={700}>
                Replay Sync
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Configure automatic sync behavior and run manual sync when needed.
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
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        Enable Automatic Sync
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Automatically sync replay metadata while LMU Steward is running.
                      </Typography>
                    </Box>
                    <Switch
                      checked={automaticSyncEnabled}
                      onChange={(_, checked) => setAutomaticSyncEnabled(checked)}
                      disabled={isLoading || isSaving || isLaunching || isAutosaving}
                    />
                  </Stack>

                  <Divider sx={{ borderColor: 'divider' }} />

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
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

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        Quick View Mode
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Open replay analysis pages without loading replay playback in LMU. Some
                        replay-dependent data (such as live replay controls and full API-backed
                        details) will be unavailable until you load the replay.
                      </Typography>
                    </Box>
                    <Switch
                      checked={quickViewEnabled}
                      onChange={(_, checked) => setQuickViewEnabled(checked)}
                      disabled={isLoading || isSaving || isLaunching || isAutosaving}
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
                          Number.isFinite(nextValue) ? Math.max(1, nextValue) : 5,
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

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
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

          <Paper variant="outlined" sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}>
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
                    Clearing local storage removes LMU Steward data saved on this device, such as
                    replay metadata and cached app state. This does not uninstall LMU.
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
                      {isClearingLocalStorage ? 'Clearing…' : 'Clear Local Storage'}
                    </Button>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </Paper>

          <UserSettingsClearStorageDialog
            open={isClearLocalStorageDialogOpen}
            isClearingLocalStorage={isClearingLocalStorage}
            onClose={onCloseClearLocalStorageDialog}
            onConfirm={onConfirmClearLocalStorage}
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
