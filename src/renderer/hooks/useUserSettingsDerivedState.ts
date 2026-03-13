import { useMemo } from 'react';
import { CONSTANTS } from '@constants';
import {
  getCountryNameFromCode,
  getFlagEmojiFromCountryCode,
  getFlagImageUrlFromCountryCode,
} from '../utils/userSettingsHelpers';

interface UseUserSettingsDerivedStateArgs {
  hasApiStatusResponse: boolean;
  isConnected: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isLaunching: boolean;
  isLaunchCooldownActive: boolean;
  lastReplaySyncAt: number | null | undefined;
  persistedLastReplaySyncAt: number | null;
  lastProfileSyncAt: number | null;
  profileNationalityCode: string;
  automaticSyncEnabled: boolean;
  quickViewEnabled: boolean;
  syncOnAppLaunch: boolean;
  syncOnIntervalMinutes: number;
  anonymizeDriverData: boolean;
  telemetryCacheEnabled: boolean;
  clearCacheOnExit: boolean;
  lmuExecutablePath: string;
  lmuReplayDirectoryPath: string;
  closeLmuWhenStewardExits: boolean;
  hasInitializedSettings: boolean;
  lastManualSavedPayload: string;
  isAutosaving: boolean;
}

export const useUserSettingsDerivedState = ({
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
  hasInitializedSettings,
  lastManualSavedPayload,
  isAutosaving,
}: UseUserSettingsDerivedStateArgs) => {
  const isLmuRunning = hasApiStatusResponse && isConnected;

  const launchLmuDisabled =
    isLoading || isSaving || isLaunching || isLaunchCooldownActive || isLmuRunning;

  const launchLmuTooltip = isLmuRunning
    ? 'Launch is disabled because LMU is already running.'
    : isLaunchCooldownActive
      ? 'Launch is temporarily disabled while LMU boots up.'
      : 'Launch is available when LMU is not running.';

  const syncNowDisabled = isLoading || isSaving || isLaunching || !isLmuRunning;

  const syncNowTooltip = !isLmuRunning
    ? 'Sync is disabled because LMU API is not connected.'
    : 'Sync now is available while connected to LMU API.';

  const profileNationalityName = getCountryNameFromCode(profileNationalityCode);
  const profileNationalityFlag = getFlagEmojiFromCountryCode(profileNationalityCode);
  const profileNationalityFlagImageUrl = getFlagImageUrlFromCountryCode(
    profileNationalityCode,
  );

  const resolvedLastReplaySyncAt =
    lastReplaySyncAt && persistedLastReplaySyncAt
      ? Math.max(lastReplaySyncAt, persistedLastReplaySyncAt)
      : (lastReplaySyncAt ?? persistedLastReplaySyncAt);

  const lastSyncLabel = useMemo(() => {
    if (!resolvedLastReplaySyncAt) {
      return 'Waiting for first sync...';
    }

    return new Date(resolvedLastReplaySyncAt).toLocaleString();
  }, [resolvedLastReplaySyncAt]);

  const lastProfileSyncLabel = useMemo(() => {
    if (!lastProfileSyncAt) {
      return 'Waiting for first profile sync...';
    }

    return new Date(lastProfileSyncAt).toLocaleString();
  }, [lastProfileSyncAt]);

  const autosavePayload = useMemo(
    () => ({
      automaticSyncEnabled,
      quickViewEnabled,
      syncOnAppLaunch,
      syncOnIntervalMinutes,
      anonymizeDriverData,
      telemetryCacheEnabled,
      clearCacheOnExit,
    }),
    [
      automaticSyncEnabled,
      quickViewEnabled,
      syncOnAppLaunch,
      syncOnIntervalMinutes,
      anonymizeDriverData,
      telemetryCacheEnabled,
      clearCacheOnExit,
    ],
  );

  const manualSavePayload = useMemo(
    () => ({
      lmuExecutablePath,
      lmuReplayDirectoryPath,
      closeLmuWhenStewardExits,
    }),
    [lmuExecutablePath, lmuReplayDirectoryPath, closeLmuWhenStewardExits],
  );

  const hasManualUnsavedChanges =
    hasInitializedSettings &&
    JSON.stringify(manualSavePayload) !== lastManualSavedPayload;

  const manualSaveDisabled =
    isLoading ||
    isSaving ||
    isLaunching ||
    isAutosaving ||
    !hasManualUnsavedChanges ||
    !lmuExecutablePath.trim() ||
    !lmuReplayDirectoryPath.trim();

  const areSystemPathsAtDefaults =
    lmuExecutablePath.trim() === CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH &&
    lmuReplayDirectoryPath.trim() === CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH;

  return {
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
  };
};
