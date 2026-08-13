import { CONSTANTS } from '@constants';
import {
  DEFAULT_USER_SETTINGS,
  getLmuExecutablePathValidationError,
  getLmuReplayDirectoryPathValidationError,
  getStewardActionsValidationError,
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

/*
  Structural only. Whether a tariff is *usable* — labels present, labels unique,
  at least one action — is decided once, in the renderer's stewardActions.ts, and
  a second copy of those rules here is the drift the setting exists to remove.
  What main protects is the store: either absent, or a list of entries carrying
  labels.
*/
describe('main/user-settings steward actions validation', () => {
  it.each([
    ['never set', undefined],
    ['explicitly cleared', null],
  ])('accepts %s, which means the shipped tariff', (_case, candidate) => {
    expect(getStewardActionsValidationError(candidate)).toBeNull();
  });

  it('accepts a list of labelled entries', () => {
    expect(
      getStewardActionsValidationError([
        { id: 'a', label: 'DT', driverScoped: true },
      ]),
    ).toBeNull();
  });

  // An empty list is a usability question, not a structural one — the renderer
  // reads it back as "use the shipped tariff".
  it('accepts an empty list', () => {
    expect(getStewardActionsValidationError([])).toBeNull();
  });

  it('rejects a value that is not a list', () => {
    expect(getStewardActionsValidationError('penalty-5s')).toBe(
      'Steward actions must be a list.',
    );
  });

  it.each([
    ['a non-object entry', ['DT']],
    ['an entry with no label', [{ id: 'a', driverScoped: true }]],
    ['an entry whose label is not a string', [{ id: 'a', label: 5 }]],
  ])('rejects %s', (_case, candidate) => {
    expect(getStewardActionsValidationError(candidate)).toBe(
      'Every steward action needs a label.',
    );
  });

  // Nothing is stored until the user departs from the shipped tariff.
  it('ships with nothing stored', () => {
    expect(DEFAULT_USER_SETTINGS.stewardActions).toBeNull();
  });
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
