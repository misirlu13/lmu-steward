import { useMemo } from 'react';
import { CONSTANTS } from '@constants';
import { StewardAction } from '../utils/stewardActions';
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
  persistDashboardFiltersEnabled: boolean;
  experimentalFeaturesEnabled: boolean;
  liveCaptureEnabled: boolean;
  stewardAuthorName: string;
  /**
   * The league's tariff, already reduced to what belongs in the store — `null`
   * when it is the shipped set. See `toStoredStewardActions`.
   */
  storedStewardActions: StewardAction[] | null;
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
  persistDashboardFiltersEnabled,
  experimentalFeaturesEnabled,
  liveCaptureEnabled,
  stewardAuthorName,
  storedStewardActions,
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
    isLoading ||
    isSaving ||
    isLaunching ||
    isLaunchCooldownActive ||
    isLmuRunning;

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
  const profileNationalityFlag = getFlagEmojiFromCountryCode(
    profileNationalityCode,
  );
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
      persistDashboardFiltersEnabled,
      experimentalFeaturesEnabled,
      liveCaptureEnabled,
      /*
        Trimmed on the way to the store so " " and "" are the same stored value
        — otherwise a stray space is a name, and the record gets an author that
        prints as nothing.
      */
      stewardAuthorName: stewardAuthorName.trim(),
      /*
        Already normalised by the caller, and `null` where the user is on the
        shipped tariff — storing a copy of the defaults would freeze them into
        this install, so "revert" and "never customised" have to be the same
        stored value.
      */
      stewardActions: storedStewardActions,
      anonymizeDriverData,
      telemetryCacheEnabled,
      clearCacheOnExit,
    }),
    [
      automaticSyncEnabled,
      quickViewEnabled,
      syncOnAppLaunch,
      syncOnIntervalMinutes,
      persistDashboardFiltersEnabled,
      experimentalFeaturesEnabled,
      liveCaptureEnabled,
      stewardAuthorName,
      storedStewardActions,
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
    lmuReplayDirectoryPath.trim() ===
      CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH;

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
