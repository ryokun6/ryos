import { ensureIndexedDBInitialized } from "@/utils/indexedDB";

// Interface for content stored in IndexedDB
export interface DocumentContent {
  name: string; // Used as the key in IndexedDB
  content: string | Blob;
  contentUrl?: string; // URL for Blob content (managed temporarily)
}

// Generic CRUD operations
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
