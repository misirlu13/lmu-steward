import { app } from 'electron';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import nodePath from 'path';
import { ImportedReplayRecord, LMUReplay, ProfileCacheStore } from '@types';

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
const PENDING_CLEAR_FILE_NAME = 'lmu-steward-pending-clear.json';
const META_LEGACY_MIGRATION_COMPLETED = 'legacyMigrationCompleted';
const META_LEGACY_SYNCED_MTIME_PREFIX = 'legacySyncedMtime:';

/**
 * Reserved key inside the legacy JSON stores holding a `key -> epoch ms` map of
 * when each key was last written. Sessions that fall back to the legacy backend
 * use it to tell SQLite which keys they actually changed.
 */
const LEGACY_SYNC_STAMPS_KEY = '__syncStamps__';

/**
 * Backed by the imported_replays table rather than kv_store. Kept as a store
 * key so callers use the same get/set interface, and so the legacy JSON backend
 * carries it without a second code path.
 */
const IMPORTED_REPLAYS_KEY = 'importedReplays';
const RESERVED_LEGACY_KEYS = new Set(['__internal__', LEGACY_SYNC_STAMPS_KEY]);

const SQLITE_OPEN_ATTEMPTS = 3;
const SQLITE_OPEN_RETRY_DELAY_MS = 250;

let storageManager: StorageManager | null = null;

const resolveUserDataPath = (): string => {
  try {
    return app.getPath('userData');
  } catch {
    const roamingPath = process.env.APPDATA;
    if (roamingPath) {
      return nodePath.join(roamingPath, 'lmu-steward');
    }

    return nodePath.join(process.cwd(), '.lmu-steward');
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

const safeFileMtimeMs = (filePath: string): number => {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
};

const removeFileIfExists = (filePath: string): void => {
  if (existsSync(filePath)) {
    rmSync(filePath, { force: true });
  }
};

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
        .prepare(
          'SELECT hash, payload FROM replay_cache ORDER BY timestamp DESC',
        )
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

    if (this.namespace === 'main' && key === IMPORTED_REPLAYS_KEY) {
      const rows = this.db
        .prepare(
          'SELECT hash, payload FROM imported_replays ORDER BY timestamp DESC',
        )
        .all() as Array<{ hash: string; payload: string }>;
      const imported: Record<string, ImportedReplayRecord> = {};

      for (const row of rows) {
        const record = deserializeValue(row.payload);
        if (record !== undefined) {
          imported[row.hash] = record as ImportedReplayRecord;
        }
      }

      return imported;
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

    if (this.namespace === 'main' && key === IMPORTED_REPLAYS_KEY) {
      const importedEntries = Object.entries(
        isRecord(value) ? value : {},
      ) as Array<[string, ImportedReplayRecord]>;

      const replaceImported = this.db.transaction(
        (entries: Array<[string, ImportedReplayRecord]>) => {
          this.db.prepare('DELETE FROM imported_replays').run();

          const statement = this.db.prepare(`
            INSERT INTO imported_replays (
              hash,
              replay_name,
              scene_desc,
              session,
              timestamp,
              vcr_file_name,
              vcr_path,
              log_file_name,
              log_path,
              imported_at,
              payload,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const updatedAt = Date.now();

          for (const [hash, record] of entries) {
            statement.run(
              hash,
              record?.replayName ?? null,
              record?.sceneDesc ?? null,
              record?.session ?? null,
              Number(record?.timestamp ?? 0),
              record?.vcrFileName ?? '',
              record?.vcrPath ?? '',
              record?.logFileName ?? null,
              record?.logPath ?? null,
              Number(record?.importedAt ?? 0),
              serializeValue(record),
              updatedAt,
            );
          }
        },
      );

      replaceImported(importedEntries);
      return;
    }

    this.db
      .prepare(
        `
          INSERT INTO kv_store (namespace, key, value, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(namespace, key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `,
      )
      .run(this.namespace, key, serializeValue(value), Date.now());
  }

  clear(): void {
    this.db
      .prepare('DELETE FROM kv_store WHERE namespace = ?')
      .run(this.namespace);

    if (this.namespace === 'main') {
      this.db.prepare('DELETE FROM replay_cache').run();
      this.db.prepare('DELETE FROM imported_replays').run();
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
    this.recordWriteStamp(key);
  }

  clear(): void {
    this.store.clear();
  }

  /**
   * Records when this key was written so the next successful SQLite start can
   * merge only the keys this session actually changed. Best effort: a failure
   * here must never fail the write itself.
   */
  private recordWriteStamp(key: string): void {
    try {
      const existing = this.store.get(LEGACY_SYNC_STAMPS_KEY);
      const stamps = isRecord(existing) ? { ...existing } : {};

      stamps[key] = Date.now();
      this.store.set(LEGACY_SYNC_STAMPS_KEY, stamps);
    } catch {
      // A missing stamp only costs us precision during reconciliation, where the
      // file mtime is used instead.
    }
  }
}

/**
 * Adds kv_store.updated_at to databases created before write stamping existed.
 * Existing rows are stamped as of the upgrade rather than 0 so that a stale
 * legacy JSON file can never win a reconciliation against data SQLite already
 * owns.
 */
const ensureKvUpdatedAtColumn = (db: SqliteDatabase) => {
  const columns = db.prepare('PRAGMA table_info(kv_store)').all() as Array<{
    name: string;
  }>;

  if (columns.some((column) => column.name === 'updated_at')) {
    return;
  }

  db.exec(
    'ALTER TABLE kv_store ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0',
  );
  db.prepare('UPDATE kv_store SET updated_at = ?').run(Date.now());
};

const initializeSqliteSchema = (db: SqliteDatabase) => {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS kv_store (
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0,
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

    /*
      Replays LMU Steward copied into the LMU installation. Deliberately not in
      replay_cache: that table is emptied on every write, on schema bumps and on
      forced resets, and losing these rows would strand the files on disk with
      nothing able to find or delete them.
    */
    CREATE TABLE IF NOT EXISTS imported_replays (
      hash TEXT PRIMARY KEY,
      replay_name TEXT,
      scene_desc TEXT,
      session TEXT,
      timestamp INTEGER NOT NULL DEFAULT 0,
      vcr_file_name TEXT NOT NULL,
      vcr_path TEXT NOT NULL,
      log_file_name TEXT,
      log_path TEXT,
      imported_at INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_imported_replays_timestamp
      ON imported_replays(timestamp DESC);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  ensureKvUpdatedAtColumn(db);
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

interface LegacySnapshot {
  data: Record<string, unknown>;
  stamps: Record<string, number>;
  fallbackStamp: number;
}

/**
 * Reads a legacy store file together with the per-key write stamps recorded by
 * LegacyElectronStoreAdapter. Files written before stamping existed have no
 * stamps, so the file mtime stands in as the best available write time.
 */
const readLegacySnapshot = (filePath: string): LegacySnapshot | null => {
  const data = safeReadJsonFile(filePath);

  if (!data) {
    return null;
  }

  const rawStamps = data[LEGACY_SYNC_STAMPS_KEY];
  const stamps: Record<string, number> = {};

  if (isRecord(rawStamps)) {
    for (const [key, value] of Object.entries(rawStamps)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        stamps[key] = value;
      }
    }
  }

  return { data, stamps, fallbackStamp: safeFileMtimeMs(filePath) };
};

const stampFor = (snapshot: LegacySnapshot, key: string): number =>
  snapshot.stamps[key] ?? snapshot.fallbackStamp;

const readKvStamps = (
  db: SqliteDatabase,
  namespace: StoreNamespace,
): Map<string, number> => {
  const rows = db
    .prepare('SELECT key, updated_at FROM kv_store WHERE namespace = ?')
    .all(namespace) as Array<{ key: string; updated_at: number }>;

  return new Map(rows.map((row) => [row.key, row.updated_at]));
};

const readReplayStamps = (db: SqliteDatabase): Map<string, number> => {
  const rows = db
    .prepare('SELECT hash, updated_at FROM replay_cache')
    .all() as Array<{ hash: string; updated_at: number }>;

  return new Map(rows.map((row) => [row.hash, row.updated_at]));
};

const readImportedStamps = (db: SqliteDatabase): Map<string, number> => {
  const rows = db
    .prepare('SELECT hash, updated_at FROM imported_replays')
    .all() as Array<{ hash: string; updated_at: number }>;

  return new Map(rows.map((row) => [row.hash, row.updated_at]));
};

/**
 * Merges a legacy main-store snapshot into SQLite, keeping whichever copy of
 * each key was written last. Replays merge per hash rather than replacing the
 * collection, so a fallback session that only saw a subset of replays can't
 * delete the rest.
 */
const reconcileLegacyMainStore = (
  db: SqliteDatabase,
  snapshot: LegacySnapshot,
) => {
  const kvStamps = readKvStamps(db, 'main');
  const replayStamps = readReplayStamps(db);
  const importedStamps = readImportedStamps(db);
  const importedStatement = db.prepare(`
    INSERT INTO imported_replays (
      hash,
      replay_name,
      scene_desc,
      session,
      timestamp,
      vcr_file_name,
      vcr_path,
      log_file_name,
      log_path,
      imported_at,
      payload,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(hash) DO UPDATE SET
      replay_name = excluded.replay_name,
      scene_desc = excluded.scene_desc,
      session = excluded.session,
      timestamp = excluded.timestamp,
      vcr_file_name = excluded.vcr_file_name,
      vcr_path = excluded.vcr_path,
      log_file_name = excluded.log_file_name,
      log_path = excluded.log_path,
      imported_at = excluded.imported_at,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `);
  const kvStatement = db.prepare(
    `
      INSERT INTO kv_store (namespace, key, value, updated_at)
      VALUES ('main', ?, ?, ?)
      ON CONFLICT(namespace, key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
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

  for (const [key, value] of Object.entries(snapshot.data)) {
    if (RESERVED_LEGACY_KEYS.has(key)) {
      continue;
    }

    const stamp = stampFor(snapshot, key);

    if (key === 'replays') {
      const replayEntries = Object.entries(
        isRecord(value) ? value : {},
      ) as Array<[string, LMUReplay]>;

      for (const [hash, replay] of replayEntries) {
        if ((replayStamps.get(hash) ?? -1) >= stamp) {
          continue;
        }

        replayStatement.run(
          hash,
          replay?.replayName ?? null,
          replay?.metadata?.sceneDesc ?? null,
          replay?.metadata?.session ?? null,
          Number(replay?.timestamp ?? 0),
          serializeValue(replay),
          stamp,
        );
      }

      continue;
    }

    /*
      Imported replays merge per hash for the same reason replays do: a session
      that fell back to the legacy backend may have seen only some of them, and
      replacing the collection would drop rows describing files that are still
      sitting in the LMU installation.
    */
    if (key === IMPORTED_REPLAYS_KEY) {
      const importedEntries = Object.entries(
        isRecord(value) ? value : {},
      ) as Array<[string, ImportedReplayRecord]>;

      for (const [hash, record] of importedEntries) {
        if ((importedStamps.get(hash) ?? -1) >= stamp) {
          continue;
        }

        importedStatement.run(
          hash,
          record?.replayName ?? null,
          record?.sceneDesc ?? null,
          record?.session ?? null,
          Number(record?.timestamp ?? 0),
          record?.vcrFileName ?? '',
          record?.vcrPath ?? '',
          record?.logFileName ?? null,
          record?.logPath ?? null,
          Number(record?.importedAt ?? 0),
          serializeValue(record),
          stamp,
        );
      }

      continue;
    }

    if ((kvStamps.get(key) ?? -1) >= stamp) {
      continue;
    }

    kvStatement.run(key, serializeValue(value), stamp);
  }
};

const reconcileLegacyProfileStore = (
  db: SqliteDatabase,
  snapshot: LegacySnapshot,
) => {
  const kvStamps = readKvStamps(db, 'profile');
  const statement = db.prepare(
    `
      INSERT INTO kv_store (namespace, key, value, updated_at)
      VALUES ('profile', ?, ?, ?)
      ON CONFLICT(namespace, key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
  );

  for (const [key, value] of Object.entries(snapshot.data)) {
    if (RESERVED_LEGACY_KEYS.has(key)) {
      continue;
    }

    const stamp = stampFor(snapshot, key);

    if ((kvStamps.get(key) ?? -1) >= stamp) {
      continue;
    }

    statement.run(key, serializeValue(value), stamp);
  }
};

const reconcileLegacyStore = (
  db: SqliteDatabase,
  namespace: StoreNamespace,
  filePath: string,
) => {
  const metaKey = `${META_LEGACY_SYNCED_MTIME_PREFIX}${namespace}`;
  const mtimeMs = safeFileMtimeMs(filePath);
  const syncedMtimeMs = Number(getMeta(db, metaKey) ?? '-1');

  // Nothing on disk, or nothing has been written to it since the last merge.
  if (mtimeMs === 0 || mtimeMs <= syncedMtimeMs) {
    return;
  }

  const snapshot = readLegacySnapshot(filePath);

  if (!snapshot) {
    return;
  }

  const reconcile = db.transaction(() => {
    if (namespace === 'main') {
      reconcileLegacyMainStore(db, snapshot);
    } else {
      reconcileLegacyProfileStore(db, snapshot);
    }

    setMeta(db, metaKey, String(mtimeMs));
  });

  reconcile();
};

/**
 * Folds the legacy JSON stores into SQLite on every successful start. This
 * covers both the original one-shot migration and any session that had to fall
 * back to the legacy backend because SQLite was unreachable — without it, those
 * sessions' writes are stranded in JSON that nothing ever reads again.
 */
const reconcileLegacyStores = (
  db: SqliteDatabase,
  legacyMainPath: string,
  legacyProfilePath: string,
) => {
  reconcileLegacyStore(db, 'main', legacyMainPath);
  reconcileLegacyStore(db, 'profile', legacyProfilePath);

  // Older builds gate their one-shot migration on this flag. Keep setting it so
  // rolling back doesn't re-import legacy JSON over newer SQLite data.
  if (getMeta(db, META_LEGACY_MIGRATION_COMPLETED) !== '1') {
    setMeta(db, META_LEGACY_MIGRATION_COMPLETED, '1');
  }
};

const clearSqliteContents = (db: SqliteDatabase) => {
  const clear = db.transaction(() => {
    db.prepare('DELETE FROM kv_store').run();
    db.prepare('DELETE FROM replay_cache').run();
    db.prepare('DELETE FROM imported_replays').run();
    db.prepare('DELETE FROM meta').run();
  });

  clear();
};

/**
 * Applies a clear that was requested while the app was running on the legacy
 * backend. That session couldn't reach SQLite, so without this the db would
 * quietly restore everything the user just cleared.
 */
const applyPendingClear = (
  db: SqliteDatabase,
  pendingClearPath: string,
  legacyMainPath: string,
  legacyProfilePath: string,
) => {
  if (!existsSync(pendingClearPath)) {
    return;
  }

  // Legacy files first: if removal fails we abort before touching SQLite, and
  // the sentinel survives so the clear is retried on the next launch.
  removeFileIfExists(legacyMainPath);
  removeFileIfExists(legacyProfilePath);
  clearSqliteContents(db);
  removeFileIfExists(pendingClearPath);
};

const sleepSync = (durationMs: number) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
};

/**
 * Opens the database, retrying briefly to ride out a transient lock from another
 * instance still shutting down. Retries only happen here, before any caller
 * holds a store reference — swapping backends mid-session would strand writes in
 * modules that captured the old store (see api/replay.ts).
 */
const openSqliteDatabase = (
  BetterSqlite3: new (fileName: string) => SqliteDatabase,
  sqlitePath: string,
): SqliteDatabase => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= SQLITE_OPEN_ATTEMPTS; attempt += 1) {
    let db: SqliteDatabase | null = null;

    try {
      db = new BetterSqlite3(sqlitePath);
      initializeSqliteSchema(db);

      return db;
    } catch (error) {
      lastError = error;

      try {
        db?.close();
      } catch {
        // Nothing useful to do if closing a half-open handle also fails.
      }

      if (attempt < SQLITE_OPEN_ATTEMPTS) {
        sleepSync(SQLITE_OPEN_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const createSqliteStorageManager = (
  userDataPath: string,
  legacyMainPath: string,
  legacyProfilePath: string,
): StorageManager => {
  mkdirSync(userDataPath, { recursive: true });

  const sqlitePath = nodePath.join(userDataPath, SQLITE_DB_FILE_NAME);
  const pendingClearPath = nodePath.join(userDataPath, PENDING_CLEAR_FILE_NAME);
  const BetterSqlite3 = require('better-sqlite3') as new (
    fileName: string,
  ) => SqliteDatabase;
  const db = openSqliteDatabase(BetterSqlite3, sqlitePath);

  applyPendingClear(db, pendingClearPath, legacyMainPath, legacyProfilePath);
  reconcileLegacyStores(db, legacyMainPath, legacyProfilePath);

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
      // Legacy files (and any pending-clear sentinel) go first so a failure to
      // remove them aborts before the db is emptied. Clearing meta ahead of them
      // would drop the sync watermarks and let the leftover JSON be re-imported
      // on the next start.
      removeFileIfExists(legacyMainPath);
      removeFileIfExists(legacyProfilePath);
      removeFileIfExists(pendingClearPath);
      clearSqliteContents(db);
    },
    dispose: () => {
      db.close();
    },
  };
};

const createLegacyStorageManager = (
  pendingClearPath: string,
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

      // SQLite is unreachable this session, so it keeps whatever it already
      // holds. Leave a sentinel that the next successful start honours before it
      // reads anything, otherwise the cleared data reappears.
      writeFileSync(
        pendingClearPath,
        JSON.stringify({ requestedAt: Date.now() }),
        'utf-8',
      );
    },
    dispose: () => {},
  };
};

const getStorageManager = (): StorageManager => {
  if (storageManager) {
    return storageManager;
  }

  const userDataPath = resolveUserDataPath();
  const legacyMainPath = nodePath.join(
    userDataPath,
    LEGACY_MAIN_STORE_FILE_NAME,
  );
  const legacyProfilePath = nodePath.join(
    userDataPath,
    LEGACY_PROFILE_STORE_FILE_NAME,
  );
  const pendingClearPath = nodePath.join(userDataPath, PENDING_CLEAR_FILE_NAME);

  try {
    storageManager = createSqliteStorageManager(
      userDataPath,
      legacyMainPath,
      legacyProfilePath,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    storageManager = createLegacyStorageManager(
      pendingClearPath,
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
    profileInfo:
      (store.get('profileInfo') as ProfileCacheStore['profileInfo']) ?? null,
    hasFetchedProfileInfo: Boolean(store.get('hasFetchedProfileInfo')),
    lastFetchedAt: (store.get('lastFetchedAt') as number | null) ?? null,
  };
};
