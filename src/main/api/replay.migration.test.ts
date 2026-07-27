describe('main/replay startup schema enforcement', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('clears replay cache and updates schema version when schema mismatches', async () => {
    const setMock = jest.fn();

    jest.doMock('../storage/local-data-store', () => ({
      getMainPersistentStore: () => ({
        get: (key: string) => {
          if (key === 'replayCacheSchemaVersion') {
            return 0;
          }

          return undefined;
        },
        set: setMock,
      }),
    }));

    await import('./replay');

    expect(setMock).toHaveBeenCalledWith('replays', {});
    expect(setMock).toHaveBeenCalledWith('replayCacheSchemaVersion', 1);
  });

  it('does not clear replay cache when schema already matches', async () => {
    const setMock = jest.fn();

    jest.doMock('../storage/local-data-store', () => ({
      getMainPersistentStore: () => ({
        get: (key: string) => {
          if (key === 'replayCacheSchemaVersion') {
            return 1;
          }

          return undefined;
        },
        set: setMock,
      }),
    }));

    await import('./replay');

    expect(setMock).not.toHaveBeenCalled();
  });
});
