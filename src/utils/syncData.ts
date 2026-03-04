import { ensureIndexedDBInitialized } from "@/utils/indexedDB";

interface StoreItem {
  [key: string]: unknown;
}

interface StoreItemWithKey {
  key: string;
  value: StoreItem;
}

interface IndexedDBSnapshot {
  documents: StoreItemWithKey[];
  images: StoreItemWithKey[];
  trash: StoreItemWithKey[];
  custom_wallpapers: StoreItemWithKey[];
  applets: StoreItemWithKey[];
}

export interface FilesSyncPayload {
  localStorage: Record<string, string | null>;
  indexedDB: IndexedDBSnapshot;
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const base64ToBlob = (dataUrl: string): Blob => {
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:(.*);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(base64);
  const array = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new Blob([array], { type: mime });
};

async function getStoreData(
  db: IDBDatabase,
  storeName: string
): Promise<StoreItemWithKey[]> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const items: StoreItemWithKey[] = [];
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          items.push({ key: cursor.key as string, value: cursor.value });
          cursor.continue();
        } else {
          resolve(items);
        }
      };
      request.onerror = () => reject(request.error);
    } catch (error) {
      console.error(`[syncData] Error accessing store ${storeName}:`, error);
      resolve([]);
    }
  });
}

async function serializeStoreItems(
  items: StoreItemWithKey[]
): Promise<StoreItemWithKey[]> {
  return Promise.all(
    items.map(async (item) => {
      const serialized: Record<string, unknown> = { ...item.value };
      for (const key of Object.keys(item.value)) {
        if (item.value[key] instanceof Blob) {
          serialized[key] = await blobToBase64(item.value[key] as Blob);
          serialized[`_isBlob_${key}`] = true;
        }
      }
      return { key: item.key, value: serialized as StoreItem };
    })
  );
}

export async function collectFilesData(
  localStorageKeys: string[]
): Promise<string> {
  const lsData: Record<string, string | null> = {};
  for (const key of localStorageKeys) {
    lsData[key] = localStorage.getItem(key);
  }

  const idbData: IndexedDBSnapshot = {
    documents: [],
    images: [],
    trash: [],
    custom_wallpapers: [],
    applets: [],
  };

  try {
    const db = await ensureIndexedDBInitialized();
    const [docs, imgs, trash, walls, apps] = await Promise.all([
      getStoreData(db, "documents"),
      getStoreData(db, "images"),
      getStoreData(db, "trash"),
      getStoreData(db, "custom_wallpapers"),
      getStoreData(db, "applets"),
    ]);

    idbData.documents = await serializeStoreItems(docs);
    idbData.images = await serializeStoreItems(imgs);
    idbData.trash = await serializeStoreItems(trash);
    idbData.custom_wallpapers = await serializeStoreItems(walls);
    idbData.applets = await serializeStoreItems(apps);
    db.close();
  } catch (error) {
    console.error("[syncData] Error collecting IndexedDB:", error);
  }

  const payload: FilesSyncPayload = { localStorage: lsData, indexedDB: idbData };
  return JSON.stringify(payload);
}

export async function applyFilesData(
  rawData: string,
  localStorageKeys: string[]
): Promise<boolean> {
  try {
    const payload: FilesSyncPayload = JSON.parse(rawData);

    for (const key of localStorageKeys) {
      if (key in payload.localStorage) {
        const val = payload.localStorage[key];
        if (val === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, val);
        }
      }
    }

    if (payload.indexedDB) {
      const db = await ensureIndexedDBInitialized();

      const restoreStore = (
        storeName: string,
        items: StoreItemWithKey[]
      ): Promise<void> =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, "readwrite");
          const store = tx.objectStore(storeName);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () =>
            reject(tx.error || new Error(`Transaction aborted: ${storeName}`));

          const clearReq = store.clear();
          clearReq.onsuccess = () => {
            try {
              for (const item of items) {
                const val: Record<string, unknown> = { ...item.value };
                for (const k of Object.keys(item.value)) {
                  if (item.value[`_isBlob_${k}`] === true) {
                    val[k] = base64ToBlob(item.value[k] as string);
                    delete val[`_isBlob_${k}`];
                  }
                }
                store.put(val, item.key);
              }
            } catch (err) {
              tx.abort();
              reject(err);
            }
          };
          clearReq.onerror = () => reject(clearReq.error);
        });

      const promises: Promise<void>[] = [];
      if (payload.indexedDB.documents)
        promises.push(restoreStore("documents", payload.indexedDB.documents));
      if (payload.indexedDB.images)
        promises.push(restoreStore("images", payload.indexedDB.images));
      if (payload.indexedDB.trash)
        promises.push(restoreStore("trash", payload.indexedDB.trash));
      if (payload.indexedDB.custom_wallpapers)
        promises.push(
          restoreStore("custom_wallpapers", payload.indexedDB.custom_wallpapers)
        );
      if (payload.indexedDB.applets)
        promises.push(restoreStore("applets", payload.indexedDB.applets));
      await Promise.all(promises);
      db.close();
    }

    return true;
  } catch (error) {
    console.error("[syncData] Error applying files data:", error);
    return false;
  }
}

export async function compressString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const inputData = encoder.encode(input);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(inputData);
      controller.close();
    },
  });
  const compressed = stream.pipeThrough(new CompressionStream("gzip"));
  const reader = compressed.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  let binary = "";
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

export async function decompressString(base64: string): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const response = new Response(bytes);
  const decompressed = response.body!.pipeThrough(
    new DecompressionStream("gzip")
  );
  const text = await new Response(decompressed).text();
  return text;
}
