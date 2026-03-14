import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CONSTANTS } from '@constants';
import { UserSettingsView } from './UserSettings';
import { useApi } from '../providers/ApiContext';
import { sendMessage } from '../utils/postMessage';

jest.mock('../providers/ApiContext', () => ({
  useApi: jest.fn(),
}));

jest.mock('../utils/postMessage', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../components/Common/ViewHeader', () => ({
  ViewHeader: ({ title, subtitle }: { title: React.ReactNode; subtitle: React.ReactNode }) => (
    <div data-testid="user-settings-header">
      <div>{title}</div>
      <div>{subtitle}</div>
    </div>
  ),
}));

describe('UserSettingsView integration', () => {
  const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
  const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;
  let requestReplaysMock: jest.Mock;
  let markReplayCacheResetRequiredMock: jest.Mock;

  const ipcHandlers: Record<string, (...args: unknown[]) => void> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    (window as unknown as { electron?: unknown }).electron = {
      ipcRenderer: {
        on: jest.fn((channel: string, callback: (...args: unknown[]) => void) => {
          ipcHandlers[channel] = callback;
          return jest.fn();
        }),
      },
    };

    requestReplaysMock = jest.fn();
    markReplayCacheResetRequiredMock = jest.fn();

    useApiMock.mockReturnValue({
      isConnected: true,
      hasApiStatusResponse: true,
      lastReplaySyncAt: null,
      requestReplays: requestReplaysMock,
      markReplayCacheResetRequired: markReplayCacheResetRequiredMock,
    } as unknown as ReturnType<typeof useApi>);
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  const renderView = () => {
    render(
      <MemoryRouter>
        <UserSettingsView />
      </MemoryRouter>,
    );
  };

  const emitIpc = (channel: string, payload: unknown) => {
    act(() => {
      ipcHandlers[channel]?.(payload);
    });
  };

  it('requests initial settings/profile and posts manual save payload', () => {
    renderView();

    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.GET_USER_SETTINGS);
    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.GET_PROFILE_INFO);

    emitIpc(CONSTANTS.API.GET_USER_SETTINGS, {
      status: 'success',
      data: {
        lmuExecutablePath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
        lmuReplayDirectoryPath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Replays',
        automaticSyncEnabled: true,
        quickViewEnabled: false,
        syncOnAppLaunch: true,
        syncOnIntervalMinutes: 5,
        closeLmuWhenStewardExits: false,
      },
    });

    fireEvent.change(screen.getByLabelText('LMU Executable Path'), {
      target: {
        value:
          'D:/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.POST_USER_SETTINGS, {
      lmuExecutablePath:
        'D:/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
      lmuReplayDirectoryPath:
        'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Replays',
      closeLmuWhenStewardExits: false,
    });
  });

  it('autosaves toggle settings after debounce', () => {
    renderView();

    emitIpc(CONSTANTS.API.GET_USER_SETTINGS, {
      status: 'success',
      data: {
        lmuExecutablePath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
        lmuReplayDirectoryPath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Replays',
        automaticSyncEnabled: true,
        quickViewEnabled: false,
        syncOnAppLaunch: true,
        syncOnIntervalMinutes: 5,
      },
    });

    const quickViewLabel = screen.getByText('Quick View Mode');
    const quickViewRow = quickViewLabel.closest('div');
    const quickViewSwitch = quickViewRow
      ? within(quickViewRow.parentElement as HTMLElement).getByRole('switch')
      : screen.getAllByRole('switch')[3];

    fireEvent.click(quickViewSwitch);

    act(() => {
      jest.advanceTimersByTime(800);
    });

    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.POST_USER_SETTINGS, {
      automaticSyncEnabled: true,
      quickViewEnabled: true,
      syncOnAppLaunch: true,
      syncOnIntervalMinutes: 5,
      anonymizeDriverData: false,
      telemetryCacheEnabled: true,
      clearCacheOnExit: false,
    });
  });

  it('opens clear-local-storage dialog and sends confirmation action', () => {
    renderView();

    emitIpc(CONSTANTS.API.GET_USER_SETTINGS, {
      status: 'success',
      data: {
        lmuExecutablePath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
        lmuReplayDirectoryPath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Replays',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear Local Storage' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear Local Storage' }));

    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE);
  });

  // Removed threshold-related tests

  it('resets replay sync settings to defaults through confirmation dialog', () => {
    renderView();

    emitIpc(CONSTANTS.API.GET_USER_SETTINGS, {
      status: 'success',
      data: {
        lmuExecutablePath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
        lmuReplayDirectoryPath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Replays',
        automaticSyncEnabled: false,
        quickViewEnabled: true,
        syncOnAppLaunch: false,
        syncOnIntervalMinutes: 10,
      },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Return Replay Sync to Defaults' }),
    );

    expect(
      screen.getByText('Return Replay Sync Settings to Defaults?'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Defaults' }));

    act(() => {
      jest.advanceTimersByTime(800);
    });

    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.POST_USER_SETTINGS, {
      automaticSyncEnabled: true,
      quickViewEnabled: false,
      syncOnAppLaunch: true,
      syncOnIntervalMinutes: 5,
      anonymizeDriverData: false,
      telemetryCacheEnabled: true,
      clearCacheOnExit: false,
    });
  });
});
