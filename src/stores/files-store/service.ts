import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import { abortableFetch } from "@/utils/abortableFetch";
import type { FileSystemItem, FileSystemItemData, StoredContent } from "./types";

const pendingLazyLoadFiles = new Map<string, FileSystemItemData>();
const loadingAssets = new Set<string>();

/**
 * Register files for lazy loading - content will be fetched on-demand
 * when the file is actually opened, not during initialization.
 */
export function registerFilesForLazyLoad(
  files: FileSystemItemData[],
  items: Record<string, FileSystemItem>
): void {
  for (const file of files) {
    const meta = items[file.path];
    if (!meta?.uuid) continue;
    if (file.assetPath) {
      pendingLazyLoadFiles.set(file.path, file);
    }
  }
}

/**
 * Load content for a specific file on-demand (lazy loading).
 * Call this when a file is opened to ensure its content is in IndexedDB.
 * Returns true if content was loaded (or already exists), false on error.
 */
export async function ensureFileContentLoaded(
  filePath: string,
  uuid: string
): Promise<boolean> {
  const storeName = filePath.startsWith("/Documents/")
    ? STORES.DOCUMENTS
    : filePath.startsWith("/Images/")
    ? STORES.IMAGES
    : filePath.startsWith("/Applets/")
    ? STORES.APPLETS
    : null;
  if (!storeName) return false;

  // Prevent duplicate concurrent loads
  if (loadingAssets.has(uuid)) {
    await new Promise<void>((resolve) => {
      const checkComplete = () => {
        if (!loadingAssets.has(uuid)) {
          resolve();
        } else {
          setTimeout(checkComplete, 50);
        }
      };
      checkComplete();
    });

    try {
      const db = await ensureIndexedDBInitialized();
      try {
        const exists = await new Promise<boolean>((resolve) => {
          const tx = db.transaction(storeName, "readonly");
          const store = tx.objectStore(storeName);
          const req = store.get(uuid);
          req.onsuccess = () => resolve(!!req.result);
          req.onerror = () => resolve(false);
        });
        return exists;
      } finally {
        db.close();
      }
    } catch {
      return false;
    }
  }

  let db: IDBDatabase | null = null;

  try {
    db = await ensureIndexedDBInitialized();

    const existing = await new Promise<StoredContent | undefined>((resolve) => {
      const tx = db!.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(uuid);
      req.onsuccess = () => resolve(req.result as StoredContent | undefined);
      req.onerror = () => resolve(undefined);
    });

    if (existing) {
      return true;
    }

    const pendingFile = pendingLazyLoadFiles.get(filePath);
    if (!pendingFile?.assetPath) {
      return false;
    }

    loadingAssets.add(uuid);

    try {
      const resp = await abortableFetch(pendingFile.assetPath, {
        timeout: 20000,
        retry: { maxAttempts: 2, initialDelayMs: 500 },
      });

      const content = await resp.blob();

      await new Promise<void>((resolve, reject) => {
        const tx = db!.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const putReq = store.put(
          { name: pendingFile.name, content } as StoredContent,
          uuid
        );
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      });

      pendingLazyLoadFiles.delete(filePath);

      return true;
    } finally {
      loadingAssets.delete(uuid);
    }
  } catch (err) {
    console.error(`[FilesStore] Error loading content for ${filePath}:`, err);
    loadingAssets.delete(uuid);
    return false;
  } finally {
    if (db) {
      db.close();
    }
  }
}

/**
 * Save default file contents into IndexedDB using generated UUIDs.
 * Only saves text content immediately; defers binary assets for lazy loading.
 */
export async function saveDefaultContents(
  files: FileSystemItemData[],
  items: Record<string, FileSystemItem>,
  options: { lazyLoadAssets?: boolean } = { lazyLoadAssets: true }
): Promise<void> {
  const textFiles: FileSystemItemData[] = [];
  const assetFiles: FileSystemItemData[] = [];

  for (const file of files) {
    if (file.content) {
      textFiles.push(file);
    } else if (file.assetPath) {
      assetFiles.push(file);
    }
  }

  if (options.lazyLoadAssets && assetFiles.length > 0) {
    registerFilesForLazyLoad(assetFiles, items);
  }

  if (textFiles.length === 0) return;

  let db: IDBDatabase | null = null;

  try {
    db = await ensureIndexedDBInitialized();

    const filesByStore = new Map<
      string,
      { file: FileSystemItemData; uuid: string }[]
    >();

    for (const file of textFiles) {
      const meta = items[file.path];
      const uuid = meta?.uuid;
      if (!uuid) continue;

      const storeName = file.path.startsWith("/Documents/")
        ? STORES.DOCUMENTS
        : file.path.startsWith("/Images/")
        ? STORES.IMAGES
        : file.path.startsWith("/Applets/")
        ? STORES.APPLETS
        : null;
      if (!storeName) continue;

      if (!filesByStore.has(storeName)) {
        filesByStore.set(storeName, []);
      }
      filesByStore.get(storeName)!.push({ file, uuid });
    }

    for (const [storeName, storeFiles] of filesByStore) {
      const existingUUIDs = new Set<string>();
      await new Promise<void>((resolve) => {
        const tx = db!.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        let completed = 0;

        for (const { uuid } of storeFiles) {
          const req = store.get(uuid);
          req.onsuccess = () => {
            if (req.result) existingUUIDs.add(uuid);
            completed++;
            if (completed === storeFiles.length) resolve();
          };
          req.onerror = () => {
            completed++;
            if (completed === storeFiles.length) resolve();
          };
        }

        if (storeFiles.length === 0) resolve();
      });

      const newFiles = storeFiles.filter(({ uuid }) => !existingUUIDs.has(uuid));
      if (newFiles.length === 0) continue;

      await new Promise<void>((resolve, reject) => {
        const tx = db!.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);

        for (const { file, uuid } of newFiles) {
          if (file.content) {
            store.put(
              { name: file.name, content: file.content } as StoredContent,
              uuid
            );
          }
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  } catch (err) {
    console.error("[FilesStore] Error saving default contents:", err);
  } finally {
    if (db) {
      db.close();
    }
  }
}
