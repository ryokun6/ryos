// Utility helpers for IndexedDB operations used across ryOS

const DB_NAME = "ryOS";
const DB_VERSION = 7; // Force APPLETS store creation

export const STORES = {
  DOCUMENTS: "documents",
  IMAGES: "images",
  TRASH: "trash",
  CUSTOM_WALLPAPERS: "custom_wallpapers",
  APPLETS: "applets",
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
      console.log(
        `[IndexedDB] Database opened successfully. Object stores:`,
        Array.from(db.objectStoreNames)
      );
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
