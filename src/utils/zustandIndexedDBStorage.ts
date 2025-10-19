import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";

// Lightweight async StateStorage implementation for Zustand that persists
// values in the ryOS IndexedDB database.  Only a **single** key is used for
// the soundboard store, so we map each setItem/getItem to that object store.

const STORE_NAME = STORES.SOUND_BOARDS;

const getStore = async () => {
  const db = await ensureIndexedDBInitialized();
  return db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
};

export const zustandIndexedDBStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const store = await getStore();
    return new Promise((resolve) => {
      const req = store.get(name);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  },
  setItem: async (name: string, value: string): Promise<void> => {
    const store = await getStore();
    return new Promise((resolve, reject) => {
      const req = store.put(value, name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  removeItem: async (name: string): Promise<void> => {
    const store = await getStore();
    return new Promise((resolve, reject) => {
      const req = store.delete(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};