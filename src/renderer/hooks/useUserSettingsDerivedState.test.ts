import { renderHook } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { useUserSettingsDerivedState } from './useUserSettingsDerivedState';

describe('useUserSettingsDerivedState', () => {
  const baseArgs = {
    hasApiStatusResponse: true,
    isConnected: true,
    isLoading: false,
    isSaving: false,
    isLaunching: false,
    isLaunchCooldownActive: false,
    lastReplaySyncAt: 1_700_000_000_000,
    persistedLastReplaySyncAt: 1_700_000_010_000,
    lastProfileSyncAt: 1_700_000_020_000,
    profileNationalityCode: 'US',
    automaticSyncEnabled: true,
    quickViewEnabled: false,
    syncOnAppLaunch: true,
    syncOnIntervalMinutes: 5,
    replayLogMatchThresholdMinutes: 2,
    anonymizeDriverData: false,
    telemetryCacheEnabled: true,
    clearCacheOnExit: false,
    lmuExecutablePath: CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH,
    lmuReplayDirectoryPath: CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH,
    closeLmuWhenStewardExits: false,
    hasInitializedSettings: true,
    lastManualSavedPayload: JSON.stringify({
      lmuExecutablePath: 'DIFFERENT',
      lmuReplayDirectoryPath: CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH,
      closeLmuWhenStewardExits: false,
    }),
    isAutosaving: false,
  };

  it('derives running/connectivity controls and labels', () => {
    const { result } = renderHook(() => useUserSettingsDerivedState(baseArgs));

    expect(result.current.isLmuRunning).toBe(true);
    expect(result.current.launchLmuDisabled).toBe(true);
    expect(result.current.syncNowDisabled).toBe(false);
    expect(result.current.syncNowTooltip).toContain('connected to LMU API');
    expect(result.current.lastSyncLabel).not.toBe('Waiting for first sync...');
    expect(result.current.lastProfileSyncLabel).not.toBe(
      'Waiting for first profile sync...',
    );
    expect(result.current.profileNationalityName).toBeTruthy();
    expect(result.current.profileNationalityFlag).toBeTruthy();
    expect(result.current.profileNationalityFlagImageUrl).toContain('/us.png');
  });

  it('derives save payloads and enables manual save when payload changed', () => {
    const { result } = renderHook(() => useUserSettingsDerivedState(baseArgs));

    expect(result.current.autosavePayload).toEqual({
      automaticSyncEnabled: true,
      quickViewEnabled: false,
      syncOnAppLaunch: true,
      syncOnIntervalMinutes: 5,
      replayLogMatchThresholdMinutes: 2,
      anonymizeDriverData: false,
      telemetryCacheEnabled: true,
      clearCacheOnExit: false,
    });

    expect(result.current.manualSavePayload).toEqual({
      lmuExecutablePath: CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH,
      lmuReplayDirectoryPath: CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH,
      closeLmuWhenStewardExits: false,
    });

    expect(result.current.hasManualUnsavedChanges).toBe(true);
    expect(result.current.manualSaveDisabled).toBe(false);
    expect(result.current.areSystemPathsAtDefaults).toBe(true);
  });

  it('disables sync and manual save when disconnected and invalid', () => {
    const { result } = renderHook(() =>
      useUserSettingsDerivedState({
        ...baseArgs,
        hasApiStatusResponse: false,
        isConnected: false,
        lmuExecutablePath: ' ',
        hasInitializedSettings: false,
        lastManualSavedPayload: JSON.stringify({
          lmuExecutablePath: ' ',
          lmuReplayDirectoryPath: ' ',
          closeLmuWhenStewardExits: false,
        }),
      }),
    );

    expect(result.current.isLmuRunning).toBe(false);
    expect(result.current.syncNowDisabled).toBe(true);
    expect(result.current.syncNowTooltip).toContain('not connected');
    expect(result.current.hasManualUnsavedChanges).toBe(false);
    expect(result.current.manualSaveDisabled).toBe(true);
  });
});
