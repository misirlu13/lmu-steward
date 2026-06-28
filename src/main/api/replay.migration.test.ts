describe('main/replay store migrations', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const loadReplayStoreOptions = async () => {
    let capturedOptions: any;

    jest.doMock('electron-store', () => ({
      __esModule: true,
      default: class MockStore {
        constructor(options: any) {
          capturedOptions = options;
        }

        get() {
          return undefined;
        }

        set() {
          return undefined;
        }
      },
    }));

    await import('./replay');

    await new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();

      const checkReady = () => {
        if (capturedOptions) {
          resolve();
          return;
        }

        if (Date.now() - startedAt > 1000) {
          reject(new Error('Timed out waiting for replay store initialization'));
          return;
        }

        setTimeout(checkReady, 0);
      };

      checkReady();
    });

    return capturedOptions;
  };

  it('clears replay cache and updates schema version when schema mismatches', async () => {
    const storeOptions = await loadReplayStoreOptions();
    const migrationHandler = storeOptions.migrations['>=0.0.0'];
    const replayCacheSchemaVersion = storeOptions.defaults.replayCacheSchemaVersion;
    const setMock = jest.fn();

    migrationHandler({
      get: () => replayCacheSchemaVersion - 1,
      set: setMock,
    });

    expect(setMock).toHaveBeenCalledWith('replays', {});
    expect(setMock).toHaveBeenCalledWith(
      'replayCacheSchemaVersion',
      replayCacheSchemaVersion,
    );
  });

  it('does not clear replay cache when schema already matches', async () => {
    const storeOptions = await loadReplayStoreOptions();
    const migrationHandler = storeOptions.migrations['>=0.0.0'];
    const replayCacheSchemaVersion = storeOptions.defaults.replayCacheSchemaVersion;
    const setMock = jest.fn();

    migrationHandler({
      get: () => replayCacheSchemaVersion,
      set: setMock,
    });

    expect(setMock).not.toHaveBeenCalled();
  });

  it('stores from/to app versions during migration steps', async () => {
    const storeOptions = await loadReplayStoreOptions();
    const beforeEachMigration = storeOptions.beforeEachMigration;
    const setMock = jest.fn();

    beforeEachMigration(
      {
        set: setMock,
      },
      {
        fromVersion: '1.1.0',
        toVersion: '1.2.0',
        finalVersion: '1.2.0',
        versions: ['1.2.0'],
      },
    );

    expect(setMock).toHaveBeenCalledWith(
      'replayCacheMigratedFromAppVersion',
      '1.1.0',
    );
    expect(setMock).toHaveBeenCalledWith(
      'replayCacheMigratedToAppVersion',
      '1.2.0',
    );
  });
});
