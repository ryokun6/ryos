import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import type { AnkiMediaRecord } from "./import";

/** Device-local store for media that came with imported Anki decks. */

interface StoredMedia {
  data: ArrayBuffer;
  type: string;
}

const STORE = STORES.DICTIONARY_MEDIA;

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  webm: "audio/webm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

export function guessMediaType(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function dictionaryMediaKey(scope: string, filename: string): string {
  return `${scope}/${filename}`;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
    ? (data.buffer as ArrayBuffer)
    : (data.slice().buffer as ArrayBuffer);
}

export async function putDictionaryMediaBatch(records: AnkiMediaRecord[]): Promise<void> {
  if (!records.length) return;
  const db = await ensureIndexedDBInitialized();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const record of records) {
        const value: StoredMedia = {
          data: toArrayBuffer(record.data),
          type: guessMediaType(record.filename),
        };
        store.put(value, record.key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getDictionaryMedia(key: string): Promise<Blob | null> {
  const db = await ensureIndexedDBInitialized();
  try {
    const value = await new Promise<StoredMedia | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as StoredMedia | undefined);
      request.onerror = () => reject(request.error);
    });
    return value ? new Blob([value.data], { type: value.type }) : null;
  } finally {
    db.close();
  }
}

export async function getDictionaryMediaBytes(key: string): Promise<Uint8Array | null> {
  const blob = await getDictionaryMedia(key);
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/** Delete media whose scope no card references anymore. */
export async function pruneDictionaryMedia(activeScopes: ReadonlySet<string>): Promise<number> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const request = tx.objectStore(STORE).openKeyCursor();
      let removed = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = String(cursor.key);
        const scope = key.slice(0, key.indexOf("/"));
        if (!activeScopes.has(scope)) {
          tx.objectStore(STORE).delete(cursor.primaryKey);
          removed++;
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve(removed);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const objectUrlCache = new Map<string, Promise<string | null>>();

/** Cached object URL for a media key (null when the file isn't stored). */
export function getDictionaryMediaUrl(key: string): Promise<string | null> {
  let pending = objectUrlCache.get(key);
  if (!pending) {
    pending = getDictionaryMedia(key)
      .then((blob) => {
        if (blob) return URL.createObjectURL(blob);
        objectUrlCache.delete(key);
        return null;
      })
      .catch(() => {
        objectUrlCache.delete(key);
        return null;
      });
    objectUrlCache.set(key, pending);
  }
  return pending;
}
