import React from 'react';
import '@testing-library/jest-dom';
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
  ViewHeader: ({
    title,
    subtitle,
  }: {
    title: React.ReactNode;
    subtitle: React.ReactNode;
  }) => (
    <div data-testid="user-settings-header">
      <div>{title}</div>
      <div>{subtitle}</div>
    </div>
  ),
}));

describe('UserSettingsView integration', () => {
  const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
  const sendMessageMock = sendMessage as jest.MockedFunction<
    typeof sendMessage
  >;
  let requestReplaysMock: jest.Mock;
  let markReplayCacheResetRequiredMock: jest.Mock;

  const ipcHandlers: Record<string, (...args: unknown[]) => void> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    (window as unknown as { electron?: unknown }).electron = {
      ipcRenderer: {
        on: jest.fn(
          (channel: string, callback: (...args: unknown[]) => void) => {
            ipcHandlers[channel] = callback;
            return jest.fn();
          },
        ),
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
      importedReplays: [],
      requestImportedReplays: jest.fn(),
      deleteImportedReplays: jest.fn(),
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

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.GET_USER_SETTINGS,
    );
    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.GET_PROFILE_INFO,
    );

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

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.POST_USER_SETTINGS,
      {
        lmuExecutablePath:
          'D:/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
        lmuReplayDirectoryPath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Replays',
        closeLmuWhenStewardExits: false,
      },
    );
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

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.POST_USER_SETTINGS,
      {
        automaticSyncEnabled: true,
        quickViewEnabled: true,
        syncOnAppLaunch: true,
        syncOnIntervalMinutes: 5,
        persistDashboardFiltersEnabled: false,
        experimentalFeaturesEnabled: false,
        liveCaptureEnabled: false,
        stewardAuthorName: '',
        stewardActions: null,
        anonymizeDriverData: false,
        telemetryCacheEnabled: true,
        clearCacheOnExit: false,
      },
    );
  });

  it('hydrates and autosaves the remember-filters toggle', () => {
    renderView();

    emitIpc(CONSTANTS.API.GET_USER_SETTINGS, {
      status: 'success',
      data: {
        lmuExecutablePath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
        lmuReplayDirectoryPath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Replays',
        persistDashboardFiltersEnabled: true,
      },
    });

    const toggleLabel = screen.getByText('Remember Filters and Sorting');
    const toggleRow = toggleLabel.closest('div');
    const toggle = within(toggleRow?.parentElement as HTMLElement).getByRole(
      'switch',
    );

    expect((toggle as HTMLInputElement).checked).toBe(true);

    fireEvent.click(toggle);

    act(() => {
      jest.advanceTimersByTime(800);
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.POST_USER_SETTINGS,
      expect.objectContaining({ persistDashboardFiltersEnabled: false }),
    );
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

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear Local Storage' }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Clear Local Storage' }),
    );

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE,
    );
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

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.POST_USER_SETTINGS,
      {
        automaticSyncEnabled: true,
        quickViewEnabled: false,
        syncOnAppLaunch: true,
        syncOnIntervalMinutes: 5,
        persistDashboardFiltersEnabled: false,
        experimentalFeaturesEnabled: false,
        liveCaptureEnabled: false,
        stewardAuthorName: '',
        stewardActions: null,
        anonymizeDriverData: false,
        telemetryCacheEnabled: true,
        clearCacheOnExit: false,
      },
    );
  });

  it('defaults the experimental toggle to off and lists what is experimental', () => {
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

    const toggleLabel = screen.getByText('Enable Experimental Features');
    const toggle = within(
      toggleLabel.closest('div')?.parentElement as HTMLElement,
    ).getByRole('switch');

    // Settings that predate the key must not silently opt a user in.
    expect((toggle as HTMLInputElement).checked).toBe(false);

    /*
     * Asserted against the constant rather than a hardcoded name, so graduating
     * a feature cannot leave the card advertising it as experimental, and so
     * emptying the list swaps in the empty state without this test needing to
     * be rewritten.
     */
    const expectedNames = CONSTANTS.EXPERIMENTAL_FEATURES.map(
      (feature) => feature.name,
    );
    const renderedNames = expectedNames.filter(
      (name) => screen.queryByText(name) !== null,
    );

    expect(renderedNames).toEqual(expectedNames);
    expect(
      screen.queryByText(/No experimental features at the moment/i) !== null,
    ).toBe(expectedNames.length === 0);
  });

  it('hydrates the experimental toggle from stored settings', () => {
    renderView();

    emitIpc(CONSTANTS.API.GET_USER_SETTINGS, {
      status: 'success',
      data: {
        lmuExecutablePath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
        lmuReplayDirectoryPath:
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Replays',
        experimentalFeaturesEnabled: true,
      },
    });

    const toggleLabel = screen.getByText('Enable Experimental Features');
    const toggle = within(
      toggleLabel.closest('div')?.parentElement as HTMLElement,
    ).getByRole('switch');

    expect((toggle as HTMLInputElement).checked).toBe(true);
  });

  describe('the steward name recorded on decisions', () => {
    const hydrate = (stewardAuthorName?: string) =>
      emitIpc(CONSTANTS.API.GET_USER_SETTINGS, {
        status: 'success',
        data: {
          lmuExecutablePath:
            'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
          lmuReplayDirectoryPath:
            'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Replays',
          stewardAuthorName,
        },
      });

    const nameField = () => screen.getByLabelText('Steward name');

    it('hydrates from stored settings and autosaves an edit', () => {
      renderView();
      hydrate('Bradley');

      expect((nameField() as HTMLInputElement).value).toBe('Bradley');

      fireEvent.change(nameField(), { target: { value: 'Race Control' } });

      act(() => {
        jest.advanceTimersByTime(800);
      });

      expect(sendMessageMock).toHaveBeenCalledWith(
        CONSTANTS.API.POST_USER_SETTINGS,
        expect.objectContaining({ stewardAuthorName: 'Race Control' }),
      );
    });

    /*
      Shows the fallback rather than pre-filling it, so a steward can tell "I
      have not set this" from "I have set it to Steward" — and so clearing the
      box does not read as having typed the generic name on purpose.
    */
    it('shows the generic author as a placeholder when unset', () => {
      renderView();
      hydrate(undefined);

      expect((nameField() as HTMLInputElement).value).toBe('');
      expect(nameField().getAttribute('placeholder')).toBe('Steward');
    });

    // Stored trimmed, so a stray space is not a name. The steward would get an
    // author on their record that prints as nothing.
    it('trims whitespace on the way to the store', () => {
      renderView();
      hydrate('');

      fireEvent.change(nameField(), { target: { value: '  Bradley  ' } });

      act(() => {
        jest.advanceTimersByTime(800);
      });

      expect(sendMessageMock).toHaveBeenCalledWith(
        CONSTANTS.API.POST_USER_SETTINGS,
        expect.objectContaining({ stewardAuthorName: 'Bradley' }),
      );
    });
  });

  describe('the actions a dossier offers', () => {
    const hydrate = (stewardActions?: unknown) =>
      emitIpc(CONSTANTS.API.GET_USER_SETTINGS, {
        status: 'success',
        data: {
          lmuExecutablePath:
            'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
          lmuReplayDirectoryPath:
            'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Replays',
          stewardActions,
        },
      });

    const labelField = (position: number) =>
      screen.getByLabelText(`Action ${position} label`) as HTMLInputElement;

    const settle = () =>
      act(() => {
        jest.advanceTimersByTime(800);
      });

    const lastPostedActions = () => {
      const posts = sendMessageMock.mock.calls.filter(
        ([channel]) => channel === CONSTANTS.API.POST_USER_SETTINGS,
      );

      return (posts[posts.length - 1]?.[1] as { stewardActions?: unknown })
        ?.stewardActions;
    };

    it('shows the shipped tariff when nothing is stored', () => {
      renderView();
      hydrate(undefined);

      expect(labelField(1).value).toBe('5s Penalty');
      expect(labelField(5).value).toBe('Note Only');
    });

    it('hydrates a stored tariff instead', () => {
      renderView();
      hydrate([
        { id: 'a', label: 'DT', driverScoped: true },
        { id: 'b', label: 'Racing Incident', driverScoped: false },
      ]);

      expect(labelField(1).value).toBe('DT');
      expect(labelField(2).value).toBe('Racing Incident');
      expect(screen.queryByLabelText('Action 3 label')).toBeNull();
    });

    /*
      Nothing should be written on load. The value hydrates through the same
      reduction the payload goes through, so the baseline and the first computed
      payload are the same string — get that wrong and every visit to this view
      writes settings once.
    */
    it('autosaves nothing on load', () => {
      renderView();
      hydrate([{ id: 'a', label: 'DT', driverScoped: true }]);

      settle();

      expect(sendMessageMock).not.toHaveBeenCalledWith(
        CONSTANTS.API.POST_USER_SETTINGS,
        expect.anything(),
      );
    });

    it('autosaves an edited label', () => {
      renderView();
      hydrate(undefined);

      fireEvent.change(labelField(1), { target: { value: '5 Second' } });
      settle();

      expect(lastPostedActions()).toEqual([
        expect.objectContaining({ label: '5 Second', driverScoped: true }),
        expect.objectContaining({ label: '10s Penalty' }),
        expect.objectContaining({ label: 'Drive-Through' }),
        expect.objectContaining({ label: 'No Action' }),
        expect.objectContaining({ label: 'Note Only' }),
      ]);
    });

    it('autosaves a driver-scope change', () => {
      renderView();
      hydrate(undefined);

      fireEvent.click(
        screen.getByLabelText('Action 4 applies to one driver') as HTMLElement,
      );
      settle();

      expect(lastPostedActions()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'No Action', driverScoped: true }),
        ]),
      );
    });

    it('adds an action', () => {
      renderView();
      hydrate(undefined);

      fireEvent.click(screen.getByRole('button', { name: 'Add action' }));
      fireEvent.change(labelField(6), { target: { value: 'DSQ' } });
      settle();

      expect(lastPostedActions()).toHaveLength(6);
      expect(lastPostedActions()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'DSQ', driverScoped: true }),
        ]),
      );
    });

    /*
      A half-typed label is not stored, and neither is a row that duplicates one.
      The person is told which row is at fault rather than having it silently
      dropped without explanation.
    */
    it('flags a blank label and keeps it out of the store', () => {
      renderView();
      hydrate(undefined);

      fireEvent.change(labelField(2), { target: { value: '' } });
      settle();

      expect(screen.getByText(/label is needed/i)).toBeInTheDocument();
      expect(lastPostedActions()).toHaveLength(4);
    });

    it('flags a duplicate label', () => {
      renderView();
      hydrate(undefined);

      fireEvent.change(labelField(2), { target: { value: '5s Penalty' } });
      settle();

      expect(screen.getByText(/already uses this label/i)).toBeInTheDocument();
    });

    // Deleting the last row would leave the dossier with nothing to press, and
    // falling back to the shipped set instead would look like a failed delete.
    it('refuses to remove the only remaining action', () => {
      renderView();
      hydrate([{ id: 'a', label: 'DT', driverScoped: true }]);

      expect(screen.getByLabelText('Remove action 1')).toBeDisabled();
    });

    it('reorders an action, moving its shortcut with it', () => {
      renderView();
      hydrate(undefined);

      fireEvent.click(screen.getByLabelText('Move action 2 up'));
      settle();

      expect(labelField(1).value).toBe('10s Penalty');
      expect(lastPostedActions()).toEqual([
        expect.objectContaining({ label: '10s Penalty' }),
        expect.objectContaining({ label: '5s Penalty' }),
        expect.objectContaining({ label: 'Drive-Through' }),
        expect.objectContaining({ label: 'No Action' }),
        expect.objectContaining({ label: 'Note Only' }),
      ]);
    });

    /*
      Revert stores nothing rather than a copy of the defaults. That is what lets
      a later change to the shipped set reach anyone who has ever pressed it — a
      written-out copy would freeze the current five into the install forever.
    */
    it('reverts by storing nothing at all', () => {
      renderView();
      hydrate([{ id: 'a', label: 'DT', driverScoped: true }]);

      fireEvent.click(
        screen.getByRole('button', { name: /Revert to default/ }),
      );
      settle();

      expect(labelField(1).value).toBe('5s Penalty');
      expect(lastPostedActions()).toBeNull();
    });

    it('offers no revert while already on the shipped tariff', () => {
      renderView();
      hydrate(undefined);

      expect(
        screen.getByRole('button', { name: /Revert to default/ }),
      ).toBeDisabled();
    });

    // Editing back to the shipped wording is the same thing as never having
    // customised, so it stores nothing too.
    it('stores nothing once an edit lands back on the shipped tariff', () => {
      renderView();
      hydrate(undefined);

      fireEvent.change(labelField(1), { target: { value: 'DT' } });
      settle();
      expect(lastPostedActions()).not.toBeNull();

      fireEvent.change(labelField(1), { target: { value: '5s Penalty' } });
      settle();

      expect(lastPostedActions()).toBeNull();
    });
  });
});
