import { CONSTANTS } from '@constants';
import {
  DEFAULT_USER_SETTINGS,
  getLmuExecutablePathValidationError,
  getLmuReplayDirectoryPathValidationError,
  postDashboardView,
  readUserSettings,
  writeUserSettings,
} from './user-settings';

const settingsStoreData: Record<string, unknown> = {};

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({
    get(key: string) {
      return settingsStoreData[key];
    },
    set(key: string, value: unknown) {
      settingsStoreData[key] = value;
    },
    clear() {
      Object.keys(settingsStoreData).forEach((key) => {
        delete settingsStoreData[key];
      });
    },
  }),
  clearPersistentStorage: jest.fn(),
}));

describe('main/user-settings path validation', () => {
  describe('getLmuExecutablePathValidationError', () => {
    it('requires a value', () => {
      expect(getLmuExecutablePathValidationError('')).toBe(
        'LMU executable path is required.',
      );
    });

    it('requires Le Mans Ultimate executable filename', () => {
      expect(
        getLmuExecutablePathValidationError(
          'C:\\Games\\Le Mans Ultimate\\LMU.exe',
        ),
      ).toBe('LMU executable path must point to "Le Mans Ultimate.exe".');
    });

    it('requires Le Mans Ultimate folder segment', () => {
      expect(
        getLmuExecutablePathValidationError(
          'C:\\Games\\Other\\Le Mans Ultimate.exe',
        ),
      ).toBe(
        'LMU executable path must include the "Le Mans Ultimate" installation folder.',
      );
    });

    it('accepts valid path with mixed separators and casing', () => {
      expect(
        getLmuExecutablePathValidationError(
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
        ),
      ).toBeNull();
    });
  });

  describe('getLmuReplayDirectoryPathValidationError', () => {
    it('requires a value', () => {
      expect(getLmuReplayDirectoryPathValidationError('')).toBe(
        'LMU replay directory path is required.',
      );
    });

    it('requires Le Mans Ultimate folder segment', () => {
      expect(
        getLmuReplayDirectoryPathValidationError(
          'C:\\Games\\Other\\UserData\\Replays',
        ),
      ).toBe('Replay directory must include the "Le Mans Ultimate" folder.');
    });

    it('requires UserData\\Replays trailing segment', () => {
      expect(
        getLmuReplayDirectoryPathValidationError(
          'C:\\Games\\Le Mans Ultimate\\UserData\\Logs',
        ),
      ).toBe('Replay directory must include "UserData\\Replays".');
    });

    it('accepts valid replay directory path', () => {
      expect(
        getLmuReplayDirectoryPathValidationError(
          'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays',
        ),
      ).toBeNull();
    });
  });

  // Removed getReplayLogMatchThresholdValidationError tests
});

describe('main/user-settings dashboard view', () => {
  const createEvent = () =>
    ({ reply: jest.fn() }) as unknown as Electron.IpcMainEvent & {
      reply: jest.Mock;
    };

  beforeEach(() => {
    Object.keys(settingsStoreData).forEach((key) => {
      delete settingsStoreData[key];
    });
  });

  it('defaults to filter persistence disabled with nothing stored', async () => {
    expect(DEFAULT_USER_SETTINGS.persistDashboardFiltersEnabled).toBe(false);
    expect(DEFAULT_USER_SETTINGS.dashboardView).toBeNull();

    const settings = await readUserSettings();

    expect(settings.persistDashboardFiltersEnabled).toBe(false);
    expect(settings.dashboardView).toBeNull();
  });

  it('persists the dashboard view and replies with merged settings', async () => {
    const event = createEvent();
    const dashboardView = {
      filters: { track: 'PORTIMAOELMS' },
      sortBy: 'track',
      sortDirection: 'asc',
    };

    await postDashboardView(event, dashboardView);

    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_DASHBOARD_VIEW,
      expect.objectContaining({ status: 'success' }),
    );

    const settings = await readUserSettings();
    expect(settings.dashboardView).toEqual(dashboardView);
  });

  it('leaves unrelated settings untouched', async () => {
    await writeUserSettings({ syncOnIntervalMinutes: 30 });

    await postDashboardView(createEvent(), { sortBy: 'incidents' });

    const settings = await readUserSettings();
    expect(settings.syncOnIntervalMinutes).toBe(30);
    expect(settings.dashboardView).toEqual({ sortBy: 'incidents' });
  });

  it('stores null when the renderer clears the view', async () => {
    await postDashboardView(createEvent(), { sortBy: 'track' });
    await postDashboardView(createEvent(), null);

    const settings = await readUserSettings();
    expect(settings.dashboardView).toBeNull();
  });
});
