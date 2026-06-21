// Utility helpers for IndexedDB operations used across ryOS

const DB_NAME = "ryOS";
const DB_VERSION = 11;
let hasLoggedOpenSuccess = false;

export const STORES = {
  DOCUMENTS: "documents",
  IMAGES: "images",
  BOOKS: "books",
  TRASH: "trash",
  CUSTOM_WALLPAPERS: "custom_wallpapers",
  APPLETS: "applets",
  // Caches the user's Apple Music library so a page reload doesn't
  // re-paginate thousands of songs against the Apple Music API. Lives
  // in IndexedDB (not localStorage) because the library can easily
  // exceed localStorage's 5–10MB per-origin quota.
  APPLE_MUSIC_LIBRARY: "apple_music_library",
  APPLE_MUSIC_PLAYLISTS: "apple_music_playlists",
  APPLE_MUSIC_PLAYLIST_TRACKS: "apple_music_playlist_tracks",
} as const;

/**
 * Open (or create) the ryOS IndexedDB database and ensure all required
 * object stores exist.  Returns a ready-to-use IDBDatabase instance.
 */
export const ensureIndexedDBInitialized = async (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      if (!hasLoggedOpenSuccess) {
        hasLoggedOpenSuccess = true;
        console.log(
          `[IndexedDB] Database opened successfully. Object stores:`,
          Array.from(db.objectStoreNames)
        );
      }
      resolve(db);
    };

    request.onupgradeneeded = (evt) => {
      const db = (evt.target as IDBOpenDBRequest).result;
      const oldVersion = evt.oldVersion;

      console.log(
        `[IndexedDB] Upgrading from version ${oldVersion} to ${DB_VERSION}`
      );

      // Create or recreate stores without keyPath for UUID-based keys
      Object.values(STORES).forEach((storeName) => {
        if (db.objectStoreNames.contains(storeName)) {
          // For version 5 upgrade: recreate stores without keyPath
          if (oldVersion < 5) {
            console.log(
              `[IndexedDB] Recreating store ${storeName} without keyPath for UUID keys`
            );
            db.deleteObjectStore(storeName);
          }
        }

        // Create store without keyPath (we'll use UUID as key)
        if (!db.objectStoreNames.contains(storeName)) {
          console.log(`[IndexedDB] Creating store ${storeName}`);
          db.createObjectStore(storeName);
          console.log(`[IndexedDB] Store ${storeName} created successfully`);
        } else {
          console.log(`[IndexedDB] Store ${storeName} already exists`);
        }
      });

      console.log(
        `[IndexedDB] Upgrade complete. Final stores:`,
        Array.from(db.objectStoreNames)
      );
    };
  });
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
    console.log(
      `[dbOperations] Getting key "${key}" from store "${storeName}"`
    );
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          console.log(
            `[dbOperations] Get success for key "${key}". Result:`,
            request.result
          );
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
