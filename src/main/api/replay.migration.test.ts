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

    const { REPLAY_CACHE_SCHEMA_VERSION } = await import('./replay.js');

    expect(setMock).toHaveBeenCalledWith('replays', {});
    expect(setMock).toHaveBeenCalledWith(
      'replayCacheSchemaVersion',
      REPLAY_CACHE_SCHEMA_VERSION,
    );
  });

  it('leaves archived replays untouched when the replay cache is cleared', async () => {
    const setMock = jest.fn();
    const archivedReplays = {
      'replay-hash': {
        hash: 'replay-hash',
        identityKey: 'sebringwec|race|sebring r1 1|1000|c:/replays',
        archivedAt: 42,
      },
    };

    jest.doMock('../storage/local-data-store', () => ({
      getMainPersistentStore: () => ({
        get: (key: string) => {
          if (key === 'replayCacheSchemaVersion') {
            return 0;
          }

          if (key === 'archivedReplays') {
            return archivedReplays;
          }

          return undefined;
        },
        set: setMock,
      }),
    }));

    const { applyArchiveState } = await import('./replay.js');

    // A schema bump wipes the rebuildable cache; the user's archive decisions
    // live outside it and must survive.
    expect(setMock).toHaveBeenCalledWith('replays', {});
    expect(setMock).not.toHaveBeenCalledWith(
      'archivedReplays',
      expect.anything(),
    );

    const [decorated] = applyArchiveState(
      [{ hash: 'replay-hash' }],
      archivedReplays,
    );
    expect(decorated.archived).toBe(true);
  });

  /*
   * Reads the version through the module rather than hardcoding it, so bumping
   * the schema does not require editing this test — the point is that a
   * matching version is left alone, not what the number happens to be.
   */
  it('does not clear replay cache when schema already matches', async () => {
    const setMock = jest.fn();
    const { REPLAY_CACHE_SCHEMA_VERSION } = await import('./replay.js');

    jest.resetModules();

    jest.doMock('../storage/local-data-store', () => ({
      getMainPersistentStore: () => ({
        get: (key: string) => {
          if (key === 'replayCacheSchemaVersion') {
            return REPLAY_CACHE_SCHEMA_VERSION;
          }

          return undefined;
        },
        set: setMock,
      }),
    }));

    await import('./replay.js');

    expect(setMock).not.toHaveBeenCalled();
  });
});
