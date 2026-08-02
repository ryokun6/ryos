// Utility helpers for IndexedDB operations used across ryOS

import { createClientLogger } from "@/utils/logger";

export const DB_NAME = "ryOS";
/** Bump when adding/removing object stores or changing upgrade logic. */
export const DB_VERSION = 16;
let hasLoggedOpenSuccess = false;
const log = createClientLogger("IndexedDB");

const summarizeIndexedDBLogValue = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (value === null) return "null";

  if (typeof value === "string") {
    return `string(length=${value.length})`;
  }

  const valueType = typeof value;
  if (valueType !== "object") {
    return valueType;
  }

  if (Array.isArray(value)) {
    return `array(length=${value.length})`;
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return `Blob(size=${value.size}, type=${value.type || "unknown"})`;
  }

  if (value instanceof ArrayBuffer) {
    return `ArrayBuffer(byteLength=${value.byteLength})`;
  }

  if (ArrayBuffer.isView(value)) {
    return `${value.constructor.name}(byteLength=${value.byteLength})`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const arrayFields = keys
    .filter((key) => Array.isArray(record[key]))
    .map((key) => `${key}:${(record[key] as unknown[]).length}`);
  const parts = [`keys=${keys.length ? keys.join(",") : "none"}`];

  if (arrayFields.length > 0) {
    parts.push(`arrayFields=${arrayFields.join(",")}`);
  }

  return `object(${parts.join("; ")})`;
};

export const STORES = {
  DOCUMENTS: "documents",
  IMAGES: "images",
  BOOKS: "books",
  BOOK_THUMBNAILS: "book_thumbnails",
  TRASH: "trash",
  CUSTOM_WALLPAPERS: "custom_wallpapers",
  APPLETS: "applets",
  // Stuff inventory cover images (Sync v2 `stuff-images` blob namespace).
  // Kept separate from Finder `images` so covers are not keyed as VFS files.
  STUFF_IMAGES: "stuff_images",
  // Caches the user's Apple Music library so a page reload doesn't
  // re-paginate thousands of songs against the Apple Music API. Lives
  // in IndexedDB (not localStorage) because the library can easily
  // exceed localStorage's 5–10MB per-origin quota.
  APPLE_MUSIC_LIBRARY: "apple_music_library",
  APPLE_MUSIC_PLAYLISTS: "apple_music_playlists",
  APPLE_MUSIC_PLAYLIST_TRACKS: "apple_music_playlist_tracks",
  // Per-user Cloud Sync cursor, shadow, and pending namespace state. This is
  // operational metadata, so manual backups intentionally exclude it.
  SYNC2_STATE: "sync2_state",
  // Normalized entity stores for large/hot Zustand slices. The small scalar
  // metadata for each slice remains in `persisted_state`.
  SOUNDBOARD_AUDIO: "soundboard_audio",
  CHATS_AI_MESSAGES: "chats_ai_messages",
  CHATS_ROOM_MESSAGES: "chats_room_messages",
  TEXTEDIT_INSTANCES: "textedit_instances",
  VFS_ITEMS: "vfs_items",
  // Backing store for Zustand persist metadata/snapshots. Entity-heavy slices
  // keep only scalar metadata here and put their records in dedicated stores.
  // Each record is keyed by the persist `name`.
  PERSISTED_STATE: "persisted_state",
} as const;

// Must stay below `STORES` — reading it earlier throws TDZ
// ("Cannot access 'STORES' before initialization").
const STORE_NAMES = Object.values(STORES);

function getMissingStoreNames(db: IDBDatabase): string[] {
  return STORE_NAMES.filter(
    (storeName) => !db.objectStoreNames.contains(storeName)
  );
}

function applySchemaUpgrade(
  db: IDBDatabase,
  oldVersion: number,
  upgradeTransaction: IDBTransaction | null
): void {
  log.debug("Upgrading database", {
    fromVersion: oldVersion,
    toVersion: db.version,
  });

  // Create or recreate stores without keyPath for UUID-based keys
  for (const storeName of STORE_NAMES) {
    if (db.objectStoreNames.contains(storeName)) {
      // For version 5 upgrade: recreate stores without keyPath
      if (oldVersion < 5) {
        log.debug("Recreating store without keyPath", { storeName });
        db.deleteObjectStore(storeName);
      }
    }

    // Create store without keyPath (we'll use UUID as key)
    if (!db.objectStoreNames.contains(storeName)) {
      log.debug("Creating store", { storeName });
      db.createObjectStore(storeName);
      log.debug("Store created successfully", { storeName });
    } else {
      log.debug("Store already exists", { storeName });
    }
  }

  if (upgradeTransaction) {
    const ensureIndex = (
      storeName: string,
      indexName: string,
      keyPath: string
    ) => {
      const store = upgradeTransaction.objectStore(storeName);
      if (!store.indexNames.contains(indexName)) {
        store.createIndex(indexName, keyPath, { unique: false });
      }
    };

    ensureIndex(STORES.SOUNDBOARD_AUDIO, "boardId", "boardId");
    ensureIndex(STORES.CHATS_AI_MESSAGES, "owner", "owner");
    ensureIndex(STORES.CHATS_ROOM_MESSAGES, "owner", "owner");
    ensureIndex(STORES.CHATS_ROOM_MESSAGES, "roomId", "roomId");
    ensureIndex(STORES.TEXTEDIT_INSTANCES, "filePath", "instance.filePath");
    ensureIndex(STORES.VFS_ITEMS, "uuid", "item.uuid");
    ensureIndex(STORES.VFS_ITEMS, "status", "item.status");
  }

  log.debug("Upgrade complete", {
    objectStores: Array.from(db.objectStoreNames),
  });
}

function openIndexedDB(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      version === undefined
        ? indexedDB.open(DB_NAME)
        : indexedDB.open(DB_NAME, version);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (evt) => {
      const db = (evt.target as IDBOpenDBRequest).result;
      applySchemaUpgrade(
        db,
        evt.oldVersion,
        (evt.target as IDBOpenDBRequest).transaction
      );
    };

    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Open (or create) the ryOS IndexedDB database and ensure all required
 * object stores exist.  Returns a ready-to-use IDBDatabase instance.
 */
export const ensureIndexedDBInitialized = async (): Promise<IDBDatabase> => {
  let db: IDBDatabase;
  try {
    db = await openIndexedDB(DB_VERSION);
  } catch (error) {
    // On-disk DB may already be newer than DB_VERSION after a prior
    // missing-store heal. Open at the current version instead.
    const errorName =
      error && typeof error === "object" && "name" in error
        ? String((error as { name: unknown }).name)
        : "";
    if (errorName === "VersionError") {
      db = await openIndexedDB();
    } else {
      throw error;
    }
  }

  const missingStores = getMissingStoreNames(db);
  if (missingStores.length > 0) {
    // Schema is behind STORES (e.g. store added without bumping DB_VERSION,
    // or a same-version deploy gap). Force onupgradeneeded past the current
    // on-disk version so the missing stores are created.
    const healVersion = Math.max(DB_VERSION, db.version) + 1;
    log.debug("Healing missing object stores", {
      missingStores,
      fromVersion: db.version,
      toVersion: healVersion,
    });
    db.close();
    db = await openIndexedDB(healVersion);
  }

  if (!hasLoggedOpenSuccess) {
    hasLoggedOpenSuccess = true;
    log.debug("Database opened successfully", {
      objectStores: Array.from(db.objectStoreNames),
    });
  }

  return db;
};

// Generic CRUD operations over the ryOS IndexedDB stores. Used across many apps
// (Finder, TextEdit, Paint, Chats, Terminal, Applet Viewer, Desktop, iPod cache)
// so it lives here rather than inside a Finder hook.
export const dbOperations = {
  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          db.close();
          resolve(request.result);
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error getting all items from ${storeName}:`, error);
        resolve([]);
      }
    });
  },

  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    log.debug("Getting item", { storeName, key });
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          log.debug("Get succeeded", {
            storeName,
            key,
            resultSummary: summarizeIndexedDBLogValue(request.result),
          });
          db.close();
          resolve(request.result);
        };
        request.onerror = () => {
          console.error(
            `[dbOperations] Get error for key "${key}":`,
            request.error
          );
          db.close();
          reject(request.error);
        };
      } catch (error) {
        console.error(`[dbOperations] Get exception for key "${key}":`, error);
        db.close();
        resolve(undefined);
      }
    });
  },

  async put<T>(storeName: string, item: T, key?: IDBValidKey): Promise<void> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(item, key);

        request.onsuccess = () => {
          db.close();
          resolve();
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error putting item in ${storeName}:`, error);
        reject(error);
      }
    });
  },

  async delete(storeName: string, key: string): Promise<void> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => {
          db.close();
          resolve();
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error deleting item from ${storeName}:`, error);
        reject(error);
      }
    });
  },

  async clear(storeName: string): Promise<void> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          db.close();
          resolve();
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error clearing ${storeName}:`, error);
        reject(error);
      }
    });
  },
};
