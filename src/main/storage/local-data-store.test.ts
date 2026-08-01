import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import os from 'os';
import path from 'path';

/**
 * electron-store replacement that persists to the real JSON file, so a simulated
 * fallback session leaves behind the same on-disk state the app would.
 */
const createFileBackedStoreMock = (tempDir: string) => ({
  __esModule: true,
  default: class MockStore {
    path: string;

    constructor(options: { name: string }) {
      this.path = path.join(tempDir, `${options.name}.json`);
    }

    private read(): Record<string, unknown> {
      if (!existsSync(this.path)) {
        return {};
      }

      return JSON.parse(readFileSync(this.path, 'utf-8'));
    }

    private write(data: Record<string, unknown>) {
      mkdirSync(path.dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(data), 'utf-8');
    }

    get(key: string) {
      return this.read()[key];
    }

    set(key: string, value: unknown) {
      const data = this.read();
      data[key] = value;
      this.write(data);
    }

    clear() {
      this.write({});
    }
  },
});

const loadStorageOnLegacyBackend = async (tempDir: string) => {
  jest.resetModules();
  jest.doMock('electron', () => ({ app: { getPath: () => tempDir } }));
  jest.doMock('better-sqlite3', () => {
    throw new Error('sqlite unavailable');
  });
  jest.doMock('electron-store', () => createFileBackedStoreMock(tempDir));

  return import('./local-data-store.js');
};

const loadStorageOnSqliteBackend = async (tempDir: string) => {
  jest.resetModules();
  // Explicit passthrough rather than jest.dontMock: a throwing doMock from an
  // earlier fallback phase stays registered across resetModules().
  jest.doMock('better-sqlite3', () => jest.requireActual('better-sqlite3'));
  jest.doMock('electron', () => ({ app: { getPath: () => tempDir } }));
  jest.doMock('electron-store', () => createFileBackedStoreMock(tempDir));

  return import('./local-data-store.js');
};

describe('main/storage local data store', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('migrates legacy Electron Store JSON data into SQLite on first access', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'lmu-steward-storage-'));

    try {
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(
        path.join(tempDir, 'lmu-steward-store.json'),
        JSON.stringify({
          userSettings: {
            quickViewEnabled: true,
          },
          replayCacheSchemaVersion: 3,
          replays: {
            abc123: {
              hash: 'abc123',
              metadata: {
                sceneDesc: 'SEBRINGWEC',
                session: 'RACE',
              },
              replayDirectory: 'C:/replays',
              replayName: 'Sebring R1 1',
              size: 42,
              timestamp: 1000,
              logData: {},
              logDataDirectory: 'C:/logs',
              logDataFileName: 'sebring.xml',
            },
          },
        }),
      );
      writeFileSync(
        path.join(tempDir, 'lmu-steward-profile-cache.json'),
        JSON.stringify({
          profileInfo: {
            language: 'english',
            name: 'Bradley Drake',
            nationality: 'US',
            nick: 'Bradley Drake',
            steamID: '7656119',
          },
          hasFetchedProfileInfo: true,
          lastFetchedAt: 12345,
        }),
      );

      jest.doMock('electron', () => ({
        app: {
          getPath: () => tempDir,
        },
      }));

      const storage = await import('./local-data-store.js');
      const mainStore = storage.getMainPersistentStore();
      const profileStore = storage.getProfilePersistentStore();

      expect(mainStore.backend).toBe('sqlite');
      expect(mainStore.path).toBe(path.join(tempDir, 'lmu-steward.sqlite'));
      expect(mainStore.get('userSettings')).toEqual({ quickViewEnabled: true });
      expect(mainStore.get('replayCacheSchemaVersion')).toBe(3);
      expect(mainStore.get('replays')).toEqual(
        expect.objectContaining({
          abc123: expect.objectContaining({ replayName: 'Sebring R1 1' }),
        }),
      );
      expect(profileStore.get('hasFetchedProfileInfo')).toBe(true);
      expect(profileStore.get('lastFetchedAt')).toBe(12345);
    } finally {
      const storage = await import('./local-data-store.js');
      storage.resetLocalDataStoreForTests();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('falls back to legacy Electron Store when SQLite initialization fails', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'lmu-steward-storage-'));

    try {
      const legacyMainData: Record<string, unknown> = {
        userSettings: { quickViewEnabled: false },
      };
      const legacyProfileData: Record<string, unknown> = {
        hasFetchedProfileInfo: false,
      };

      jest.doMock('electron', () => ({
        app: {
          getPath: () => tempDir,
        },
      }));
      jest.doMock('better-sqlite3', () => {
        throw new Error('sqlite unavailable');
      });
      jest.doMock('electron-store', () => ({
        __esModule: true,
        default: class MockStore {
          path: string;

          private readonly data: Record<string, unknown>;

          constructor(options: { name: string }) {
            this.path = path.join(tempDir, `${options.name}.json`);
            this.data =
              options.name === 'lmu-steward-store'
                ? legacyMainData
                : legacyProfileData;
          }

          get(key: string) {
            return this.data[key];
          }

          set(key: string, value: unknown) {
            this.data[key] = value;
          }

          clear() {
            Object.keys(this.data).forEach((key) => {
              delete this.data[key];
            });
          }
        },
      }));

      const storage = await import('./local-data-store.js');
      const mainStore = storage.getMainPersistentStore();
      const profileStore = storage.getProfilePersistentStore();

      expect(mainStore.backend).toBe('legacy');
      expect(mainStore.get('userSettings')).toEqual({
        quickViewEnabled: false,
      });
      expect(profileStore.backend).toBe('legacy');
      expect(profileStore.get('hasFetchedProfileInfo')).toBe(false);
    } finally {
      const storage = await import('./local-data-store.js');
      storage.resetLocalDataStoreForTests();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reconciles writes made during a legacy fallback session into SQLite on the next successful start', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'lmu-steward-storage-'));

    try {
      // Establish SQLite as the backend and seed data the fallback session
      // never sees.
      const firstRun = await loadStorageOnSqliteBackend(tempDir);
      firstRun.getMainPersistentStore().set('replayCacheSchemaVersion', 3);
      firstRun.getMainPersistentStore().set('replays', {
        keep1: { hash: 'keep1', replayName: 'Sebring R1', timestamp: 1000 },
      });
      firstRun.resetLocalDataStoreForTests();

      // SQLite unreachable: the session writes to legacy JSON instead.
      const fallbackRun = await loadStorageOnLegacyBackend(tempDir);
      expect(fallbackRun.getMainPersistentStore().backend).toBe('legacy');
      fallbackRun
        .getMainPersistentStore()
        .set('userSettings', { quickViewEnabled: true });
      fallbackRun.getMainPersistentStore().set('replays', {
        added1: { hash: 'added1', replayName: 'Spa R2', timestamp: 2000 },
      });
      fallbackRun
        .getProfilePersistentStore()
        .set('hasFetchedProfileInfo', true);
      fallbackRun.resetLocalDataStoreForTests();

      // SQLite reachable again: the fallback session's writes are folded in.
      const recoveredRun = await loadStorageOnSqliteBackend(tempDir);
      const mainStore = recoveredRun.getMainPersistentStore();

      expect(mainStore.backend).toBe('sqlite');
      expect(mainStore.get('userSettings')).toEqual({ quickViewEnabled: true });
      expect(
        recoveredRun.getProfilePersistentStore().get('hasFetchedProfileInfo'),
      ).toBe(true);

      // Untouched keys survive, and replays merge per hash rather than the
      // fallback session's partial collection replacing everything.
      expect(mainStore.get('replayCacheSchemaVersion')).toBe(3);
      expect(Object.keys(mainStore.get('replays') as object).sort()).toEqual([
        'added1',
        'keep1',
      ]);
    } finally {
      const storage = await import('./local-data-store.js');
      storage.resetLocalDataStoreForTests();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps newer SQLite values when a stale legacy store is still on disk', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'lmu-steward-storage-'));

    try {
      const firstRun = await loadStorageOnSqliteBackend(tempDir);
      firstRun
        .getMainPersistentStore()
        .set('userSettings', { quickViewEnabled: true });
      firstRun.resetLocalDataStoreForTests();

      // An old, unstamped legacy file left over from before SQLite took over.
      const legacyMainPath = path.join(tempDir, 'lmu-steward-store.json');
      writeFileSync(
        legacyMainPath,
        JSON.stringify({ userSettings: { quickViewEnabled: false } }),
      );
      const longAgo = new Date('2020-01-01T00:00:00Z');
      utimesSync(legacyMainPath, longAgo, longAgo);

      const secondRun = await loadStorageOnSqliteBackend(tempDir);

      expect(secondRun.getMainPersistentStore().get('userSettings')).toEqual({
        quickViewEnabled: true,
      });
    } finally {
      const storage = await import('./local-data-store.js');
      storage.resetLocalDataStoreForTests();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('applies a clear requested during a legacy fallback session to SQLite on the next start', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'lmu-steward-storage-'));

    try {
      const firstRun = await loadStorageOnSqliteBackend(tempDir);
      firstRun
        .getMainPersistentStore()
        .set('userSettings', { quickViewEnabled: true });
      firstRun.getMainPersistentStore().set('replays', {
        abc123: { hash: 'abc123', replayName: 'Sebring R1', timestamp: 1000 },
      });
      firstRun.resetLocalDataStoreForTests();

      const fallbackRun = await loadStorageOnLegacyBackend(tempDir);
      expect(fallbackRun.getMainPersistentStore().backend).toBe('legacy');
      fallbackRun.clearPersistentStorage();
      fallbackRun.resetLocalDataStoreForTests();

      const recoveredRun = await loadStorageOnSqliteBackend(tempDir);
      const mainStore = recoveredRun.getMainPersistentStore();

      expect(mainStore.get('userSettings')).toBeUndefined();
      expect(mainStore.get('replays')).toEqual({});
      expect(
        existsSync(path.join(tempDir, 'lmu-steward-pending-clear.json')),
      ).toBe(false);
    } finally {
      const storage = await import('./local-data-store.js');
      storage.resetLocalDataStoreForTests();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('removes legacy stores and empties SQLite when clearing on the SQLite backend', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'lmu-steward-storage-'));

    try {
      writeFileSync(
        path.join(tempDir, 'lmu-steward-store.json'),
        JSON.stringify({ userSettings: { quickViewEnabled: true } }),
      );

      const storage = await loadStorageOnSqliteBackend(tempDir);
      expect(storage.getMainPersistentStore().get('userSettings')).toEqual({
        quickViewEnabled: true,
      });

      storage.clearPersistentStorage();

      expect(
        storage.getMainPersistentStore().get('userSettings'),
      ).toBeUndefined();
      expect(existsSync(path.join(tempDir, 'lmu-steward-store.json'))).toBe(
        false,
      );

      // The removed legacy file must not come back on the next start.
      storage.resetLocalDataStoreForTests();
      const nextRun = await loadStorageOnSqliteBackend(tempDir);
      expect(
        nextRun.getMainPersistentStore().get('userSettings'),
      ).toBeUndefined();
    } finally {
      const storage = await import('./local-data-store.js');
      storage.resetLocalDataStoreForTests();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
