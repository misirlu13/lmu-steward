import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

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

      const storage = await import('./local-data-store');
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
      const storage = await import('./local-data-store');
      storage.resetLocalDataStoreForTests();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('falls back to legacy Electron Store when SQLite initialization fails', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'lmu-steward-storage-'));

    try {
      const legacyMainData: Record<string, unknown> = { userSettings: { quickViewEnabled: false } };
      const legacyProfileData: Record<string, unknown> = { hasFetchedProfileInfo: false };

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

      const storage = await import('./local-data-store');
      const mainStore = storage.getMainPersistentStore();
      const profileStore = storage.getProfilePersistentStore();

      expect(mainStore.backend).toBe('legacy');
      expect(mainStore.get('userSettings')).toEqual({ quickViewEnabled: false });
      expect(profileStore.backend).toBe('legacy');
      expect(profileStore.get('hasFetchedProfileInfo')).toBe(false);
    } finally {
      const storage = await import('./local-data-store');
      storage.resetLocalDataStoreForTests();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
