import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { LMUReplay, ProfileCacheStore } from '@types';

type SqliteDatabase = import('better-sqlite3').Database;

type StoreNamespace = 'main' | 'profile';
type BackendName = 'sqlite' | 'legacy';

export interface PersistentStore {
  backend: BackendName;
  path: string;
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  clear: () => void;
}

interface StorageManager {
  backend: BackendName;
  mainStore: PersistentStore;
  profileStore: PersistentStore;
  primaryPath: string;
  legacyMainPath: string;
  legacyProfilePath: string;
  initializationError: string | null;
  clearAll: () => void;
  dispose: () => void;
}

const SQLITE_DB_FILE_NAME = 'lmu-steward.sqlite';
const LEGACY_MAIN_STORE_FILE_NAME = 'lmu-steward-store.json';
const LEGACY_PROFILE_STORE_FILE_NAME = 'lmu-steward-profile-cache.json';
const META_LEGACY_MIGRATION_COMPLETED = 'legacyMigrationCompleted';

let storageManager: StorageManager | null = null;

const resolveUserDataPath = (): string => {
  try {
    return app.getPath('userData');
  } catch {
    const roamingPath = process.env.APPDATA;
    if (roamingPath) {
      return path.join(roamingPath, 'lmu-steward');
    }

    return path.join(process.cwd(), '.lmu-steward');
  }
};

const deserializeValue = (value: string | undefined): unknown => {
  if (typeof value !== 'string') {
    return undefined;
  }

  return JSON.parse(value);
};

const serializeValue = (value: unknown): string => JSON.stringify(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const safeReadJsonFile = (filePath: string): Record<string, unknown> | null => {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const contents = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(contents);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

class SqliteNamespaceStore implements PersistentStore {
  backend: BackendName = 'sqlite';

  constructor(
    private readonly db: SqliteDatabase,
    private readonly namespace: StoreNamespace,
    public readonly path: string,
  ) {}

  get(key: string): unknown {
    if (this.namespace === 'main' && key === 'replays') {
      const rows = this.db
        .prepare('SELECT hash, payload FROM replay_cache ORDER BY timestamp DESC')
        .all() as Array<{ hash: string; payload: string }>;
      const replays: Record<string, LMUReplay> = {};

      for (const row of rows) {
        const replay = deserializeValue(row.payload);
        if (replay !== undefined) {
          replays[row.hash] = replay as LMUReplay;
        }
      }

      return replays;
    }

    const row = this.db
      .prepare(
        'SELECT value FROM kv_store WHERE namespace = ? AND key = ? LIMIT 1',
      )
      .get(this.namespace, key) as { value: string } | undefined;

    return deserializeValue(row?.value);
  }

  set(key: string, value: unknown): void {
    if (this.namespace === 'main' && key === 'replays') {
      const replayEntries = Object.entries(
        isRecord(value) ? value : {},
      ) as Array<[string, LMUReplay]>;

      const replaceReplayCache = this.db.transaction(
        (entries: Array<[string, LMUReplay]>) => {
          this.db.prepare('DELETE FROM replay_cache').run();

          const statement = this.db.prepare(`
            INSERT INTO replay_cache (
              hash,
              replay_name,
              scene_desc,
              session,
              timestamp,
              payload,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          const updatedAt = Date.now();

          for (const [hash, replay] of entries) {
            statement.run(
              hash,
              replay?.replayName ?? null,
              replay?.metadata?.sceneDesc ?? null,
              replay?.metadata?.session ?? null,
              Number(replay?.timestamp ?? 0),
              serializeValue(replay),
              updatedAt,
            );
          }
        },
      );

      replaceReplayCache(replayEntries);
      return;
    }

    this.db
      .prepare(
        `
          INSERT INTO kv_store (namespace, key, value)
          VALUES (?, ?, ?)
          ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value
        `,
      )
      .run(this.namespace, key, serializeValue(value));
  }

  clear(): void {
    this.db.prepare('DELETE FROM kv_store WHERE namespace = ?').run(this.namespace);

    if (this.namespace === 'main') {
      this.db.prepare('DELETE FROM replay_cache').run();
    }
  }
}

class LegacyElectronStoreAdapter implements PersistentStore {
  backend: BackendName = 'legacy';

  constructor(
    private readonly store: {
      get: (key: string) => unknown;
      set: (key: string, value: unknown) => void;
      clear: () => void;
      path?: string;
    },
    public readonly path: string,
  ) {}

  get(key: string): unknown {
    return this.store.get(key);
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  clear(): void {
    this.store.clear();
  }
}

const initializeSqliteSchema = (db: SqliteDatabase) => {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS kv_store (
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (namespace, key)
    );

    CREATE TABLE IF NOT EXISTS replay_cache (
      hash TEXT PRIMARY KEY,
      replay_name TEXT,
      scene_desc TEXT,
      session TEXT,
      timestamp INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_cache_timestamp
      ON replay_cache(timestamp DESC);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
};

const getMeta = (db: SqliteDatabase, key: string): string | undefined => {
  const row = db
    .prepare('SELECT value FROM meta WHERE key = ? LIMIT 1')
    .get(key) as { value: string } | undefined;

  return row?.value;
};

const setMeta = (db: SqliteDatabase, key: string, value: string) => {
  db.prepare(
    `
      INSERT INTO meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
  ).run(key, value);
};

const importLegacyMainStore = (
  db: SqliteDatabase,
  legacyMainStore: Record<string, unknown>,
) => {
  const kvStatement = db.prepare(
    `
      INSERT INTO kv_store (namespace, key, value)
      VALUES (?, ?, ?)
      ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value
    `,
  );
  const replayStatement = db.prepare(`
    INSERT INTO replay_cache (
      hash,
      replay_name,
      scene_desc,
      session,
      timestamp,
      payload,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(hash) DO UPDATE SET
      replay_name = excluded.replay_name,
      scene_desc = excluded.scene_desc,
      session = excluded.session,
      timestamp = excluded.timestamp,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `);

  for (const [key, value] of Object.entries(legacyMainStore)) {
    if (key === '__internal__') {
      continue;
    }

    if (key === 'replays') {
      const replayEntries = Object.entries(
        isRecord(value) ? value : {},
      ) as Array<[string, LMUReplay]>;
      const updatedAt = Date.now();

      for (const [hash, replay] of replayEntries) {
        replayStatement.run(
          hash,
          replay?.replayName ?? null,
          replay?.metadata?.sceneDesc ?? null,
          replay?.metadata?.session ?? null,
          Number(replay?.timestamp ?? 0),
          serializeValue(replay),
          updatedAt,
        );
      }

      continue;
    }

    kvStatement.run('main', key, serializeValue(value));
  }
};

const importLegacyProfileStore = (
  db: SqliteDatabase,
  legacyProfileStore: Record<string, unknown>,
) => {
  const statement = db.prepare(
    `
      INSERT INTO kv_store (namespace, key, value)
      VALUES (?, ?, ?)
      ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value
    `,
  );

  for (const [key, value] of Object.entries(legacyProfileStore)) {
    statement.run('profile', key, serializeValue(value));
  }
};

const migrateLegacyStoresIntoSqlite = (
  db: SqliteDatabase,
  legacyMainPath: string,
  legacyProfilePath: string,
) => {
  if (getMeta(db, META_LEGACY_MIGRATION_COMPLETED) === '1') {
    return;
  }

  const legacyMainStore = safeReadJsonFile(legacyMainPath);
  const legacyProfileStore = safeReadJsonFile(legacyProfilePath);

  const migrate = db.transaction(() => {
    if (legacyMainStore) {
      importLegacyMainStore(db, legacyMainStore);
    }

    if (legacyProfileStore) {
      importLegacyProfileStore(db, legacyProfileStore);
    }

    setMeta(db, META_LEGACY_MIGRATION_COMPLETED, '1');
  });

  migrate();
};

const createSqliteStorageManager = (
  userDataPath: string,
  legacyMainPath: string,
  legacyProfilePath: string,
): StorageManager => {
  mkdirSync(userDataPath, { recursive: true });

  const sqlitePath = path.join(userDataPath, SQLITE_DB_FILE_NAME);
  const BetterSqlite3 = require('better-sqlite3') as new (
    fileName: string,
  ) => SqliteDatabase;
  const db = new BetterSqlite3(sqlitePath);

  initializeSqliteSchema(db);
  migrateLegacyStoresIntoSqlite(db, legacyMainPath, legacyProfilePath);

  const mainStore = new SqliteNamespaceStore(db, 'main', sqlitePath);
  const profileStore = new SqliteNamespaceStore(db, 'profile', sqlitePath);

  return {
    backend: 'sqlite',
    mainStore,
    profileStore,
    primaryPath: sqlitePath,
    legacyMainPath,
    legacyProfilePath,
    initializationError: null,
    clearAll: () => {
      mainStore.clear();
      profileStore.clear();
      db.prepare('DELETE FROM meta').run();

      if (existsSync(legacyMainPath)) {
        rmSync(legacyMainPath, { force: true });
      }

      if (existsSync(legacyProfilePath)) {
        rmSync(legacyProfilePath, { force: true });
      }
    },
    dispose: () => {
      db.close();
    },
  };
};

const createLegacyStorageManager = (
  legacyMainPath: string,
  legacyProfilePath: string,
  initializationError: string | null,
): StorageManager => {
  const Store = require('electron-store').default;
  const mainStoreInstance = new Store({
    name: 'lmu-steward-store',
  }) as {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
    clear: () => void;
    path?: string;
  };
  const profileStoreInstance = new Store({
    name: 'lmu-steward-profile-cache',
  }) as {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
    clear: () => void;
    path?: string;
  };

  const mainStore = new LegacyElectronStoreAdapter(
    mainStoreInstance,
    mainStoreInstance.path ?? legacyMainPath,
  );
  const profileStore = new LegacyElectronStoreAdapter(
    profileStoreInstance,
    profileStoreInstance.path ?? legacyProfilePath,
  );

  return {
    backend: 'legacy',
    mainStore,
    profileStore,
    primaryPath: mainStore.path,
    legacyMainPath,
    legacyProfilePath,
    initializationError,
    clearAll: () => {
      mainStore.clear();
      profileStore.clear();
    },
    dispose: () => {},
  };
};

const getStorageManager = (): StorageManager => {
  if (storageManager) {
    return storageManager;
  }

  const userDataPath = resolveUserDataPath();
  const legacyMainPath = path.join(userDataPath, LEGACY_MAIN_STORE_FILE_NAME);
  const legacyProfilePath = path.join(
    userDataPath,
    LEGACY_PROFILE_STORE_FILE_NAME,
  );

  try {
    storageManager = createSqliteStorageManager(
      userDataPath,
      legacyMainPath,
      legacyProfilePath,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    storageManager = createLegacyStorageManager(
      legacyMainPath,
      legacyProfilePath,
      message,
    );
  }

  return storageManager;
};

export const getMainPersistentStore = (): PersistentStore =>
  getStorageManager().mainStore;

export const getProfilePersistentStore = (): PersistentStore =>
  getStorageManager().profileStore;

export const clearPersistentStorage = (): void => {
  getStorageManager().clearAll();
};

export const getPrimaryLocalDataPath = (): string =>
  getStorageManager().primaryPath;

export const getLegacyLocalDataPaths = (): {
  main: string;
  profile: string;
} => {
  const manager = getStorageManager();

  return {
    main: manager.legacyMainPath,
    profile: manager.legacyProfilePath,
  };
};

export const getLocalDataDebugInfo = (): {
  backend: BackendName;
  primaryPath: string;
  legacyMainPath: string;
  legacyProfilePath: string;
  initializationError: string | null;
} => {
  const manager = getStorageManager();

  return {
    backend: manager.backend,
    primaryPath: manager.primaryPath,
    legacyMainPath: manager.legacyMainPath,
    legacyProfilePath: manager.legacyProfilePath,
    initializationError: manager.initializationError,
  };
};

export const resetLocalDataStoreForTests = (): void => {
  storageManager?.dispose();
  storageManager = null;
};

export const readProfileCache = (): ProfileCacheStore => {
  const store = getProfilePersistentStore();

  return {
    profileInfo: (store.get('profileInfo') as ProfileCacheStore['profileInfo']) ?? null,
    hasFetchedProfileInfo: Boolean(store.get('hasFetchedProfileInfo')),
    lastFetchedAt: (store.get('lastFetchedAt') as number | null) ?? null,
  };
};
