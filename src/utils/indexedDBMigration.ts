import {
  dbOperations,
  DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import { STORES, ensureIndexedDBInitialized } from "@/utils/indexedDB";
import { type FileSystemItem, useFilesStore } from "@/stores/useFilesStore";

// Check if migration has been completed
const MIGRATION_KEY = "ryos:indexeddb-uuid-migration-v1";
const BACKUP_KEY = "ryos:indexeddb-backup";

type BackupEntry<T> = { key: string; value: T };

type SerializedBlobContent = {
  _isBlob: true;
  data: string;
  type?: string;
};

type SerializedDocumentContent = Omit<DocumentContent, "content"> & {
  content: DocumentContent["content"] | SerializedBlobContent;
};

type SerializedBackupData = {
  documents?: BackupEntry<SerializedDocumentContent>[];
  images?: BackupEntry<SerializedDocumentContent>[];
  trash?: BackupEntry<SerializedDocumentContent>[];
  custom_wallpapers?: BackupEntry<{ url: string }>[];
};

function isSerializedBlobContent(content: unknown): content is SerializedBlobContent {
  return (
    typeof content === "object" &&
    content !== null &&
    "_isBlob" in content &&
    (content as { _isBlob?: unknown })._isBlob === true &&
    "data" in content &&
    typeof (content as { data?: unknown }).data === "string"
  );
}

function deserializeDocumentContent(
  value: SerializedDocumentContent
): DocumentContent {
  const restoredValue: SerializedDocumentContent = { ...value };

  if (isSerializedBlobContent(restoredValue.content)) {
    restoredValue.content = base64ToBlob(
      restoredValue.content.data,
      restoredValue.content.type
    );
  }

  return restoredValue as DocumentContent;
}

async function restoreBackupStore<T>({
  storeName,
  entries,
  itemLabel,
  summaryLabel,
  transformValue,
}: {
  storeName: string;
  entries?: BackupEntry<T>[];
  itemLabel: string;
  summaryLabel: string;
  transformValue?: (value: T) => unknown;
}): Promise<void> {
  const items = entries ?? [];
  let restoredCount = 0;

  for (const item of items) {
    try {
      const value = transformValue ? transformValue(item.value) : item.value;
      await dbOperations.put(storeName, value, item.key);
      restoredCount++;
    } catch (err) {
      console.error(
        `[Migration] Failed to restore ${itemLabel} ${item.key}:`,
        err
      );
    }
  }

  console.log(
    `[Migration] Restored ${restoredCount}/${items.length} ${summaryLabel}`
  );
}

async function migrateStoreItemsToUUIDs({
  allItems,
  storeName,
  itemLabel,
  collectionLabel,
  predicate,
}: {
  allItems: FileSystemItem[];
  storeName: string;
  itemLabel: string;
  collectionLabel: string;
  predicate: (item: FileSystemItem) => boolean;
}): Promise<number> {
  const itemsToMigrate = allItems.filter(predicate);
  let migratedCount = 0;

  console.log(`[Migration] ${collectionLabel} to migrate: ${itemsToMigrate.length}`);

  for (const item of itemsToMigrate) {
    if (!item.uuid) {
      continue;
    }

    try {
      // Try to get content by filename (old way)
      const content = await dbOperations.get<DocumentContent>(storeName, item.name);

      if (content) {
        console.log(
          `[Migration] Found content for ${item.name}, migrating to UUID ${item.uuid}`
        );
        // Save with UUID as key
        await dbOperations.put<DocumentContent>(storeName, content, item.uuid);
        // Delete old filename-based entry
        await dbOperations.delete(storeName, item.name);
        console.log(
          `[Migration] Successfully migrated ${itemLabel}: ${item.name} -> ${item.uuid}`
        );
        migratedCount++;
        continue;
      }

      // Check if content already exists with UUID
      const uuidContent = await dbOperations.get<DocumentContent>(
        storeName,
        item.uuid
      );
      if (uuidContent) {
        console.log(
          `[Migration] ${itemLabel} ${item.name} already migrated to UUID ${item.uuid}`
        );
      } else {
        console.log(
          `[Migration] No content found for ${itemLabel} ${item.name} - file might be empty`
        );
      }
    } catch (err) {
      console.error(`[Migration] Error migrating ${itemLabel} ${item.name}:`, err);
    }
  }

  return migratedCount;
}

async function serializeDocumentBackupEntries(
  entries: BackupEntry<DocumentContent>[]
): Promise<BackupEntry<SerializedDocumentContent>[]> {
  return Promise.all(
    entries.map(async (item) => ({
      key: item.key,
      value: {
        ...item.value,
        content:
          item.value.content instanceof Blob
            ? {
                _isBlob: true,
                data: await blobToBase64(item.value.content),
                type: item.value.content.type,
              }
            : item.value.content,
      },
    }))
  );
}

// Backup all data before schema migration
async function backupDataBeforeMigration() {
  console.log("[Migration] Backing up data before schema migration...");

  const backup: {
    documents: BackupEntry<DocumentContent>[];
    images: BackupEntry<DocumentContent>[];
    trash: BackupEntry<DocumentContent>[];
    custom_wallpapers: BackupEntry<{ url: string }>[];
  } = {
    documents: [],
    images: [],
    trash: [],
    custom_wallpapers: [],
  };

  try {
    // Open the old version database directly
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ryOS", 4); // Open version 4 explicitly
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      // Don't upgrade yet
      request.onupgradeneeded = (e) => {
        e.preventDefault();
        reject(new Error("Database needs upgrade, aborting backup"));
      };
    });

    // Helper to backup a store
    const backupStore = async <T = DocumentContent | { url: string }>(
      storeName: string
    ): Promise<BackupEntry<T>[]> => {
      const items: BackupEntry<T>[] = [];

      if (!db.objectStoreNames.contains(storeName)) {
        console.log(`[Migration] Store ${storeName} does not exist, skipping`);
        return items;
      }

      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);

      // Use cursor to get both keys and values
      return new Promise((resolve, reject) => {
        const request = store.openCursor();

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
            .result;
          if (cursor) {
            // Store both key and value
            items.push({
              key: String(cursor.key), // Ensure key is string
              value: cursor.value,
            });
            cursor.continue();
          } else {
            // No more items
            console.log(
              `[Migration] Backed up ${items.length} items from ${storeName}`
            );
            resolve(items);
          }
        };

        request.onerror = () => {
          console.error(
            `[Migration] Error backing up ${storeName}:`,
            request.error
          );
          reject(request.error);
        };
      });
    };

    // Backup all stores
    backup.documents = await backupStore(STORES.DOCUMENTS);
    backup.images = await backupStore(STORES.IMAGES);
    backup.trash = await backupStore(STORES.TRASH);
    backup.custom_wallpapers = await backupStore(STORES.CUSTOM_WALLPAPERS);

    db.close();

    // Store backup in localStorage temporarily
    // Convert Blobs to base64 for storage
    const serializableBackup: SerializedBackupData = {
      documents: await serializeDocumentBackupEntries(backup.documents),
      images: await serializeDocumentBackupEntries(backup.images),
      trash: await serializeDocumentBackupEntries(backup.trash),
      custom_wallpapers: backup.custom_wallpapers,
    };

    localStorage.setItem(BACKUP_KEY, JSON.stringify(serializableBackup));
    console.log("[Migration] Backup completed and stored in localStorage");
    console.log(
      "[Migration] Total backed up - Documents:",
      backup.documents.length,
      "Images:",
      backup.images.length,
      "Trash:",
      backup.trash.length,
      "Wallpapers:",
      backup.custom_wallpapers.length
    );
  } catch (err) {
    console.error("[Migration] Error backing up data:", err);
  }
}

// Helper to convert Blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper to convert base64 to Blob
function base64ToBlob(
  dataUrl: string,
  type: string = "application/octet-stream"
): Blob {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type });
}

// Restore backup after schema migration
async function restoreBackupAfterMigration() {
  const backupStr = localStorage.getItem(BACKUP_KEY);
  if (!backupStr) {
    console.log("[Migration] No backup found to restore");
    return;
  }

  try {
    const backup = JSON.parse(backupStr) as SerializedBackupData;
    console.log("[Migration] Restoring backup after schema migration...");
    console.log(
      "[Migration] Backup contains - Documents:",
      backup.documents?.length || 0,
      "Images:",
      backup.images?.length || 0,
      "Trash:",
      backup.trash?.length || 0,
      "Wallpapers:",
      backup.custom_wallpapers?.length || 0
    );

    // Wait a bit to ensure database is ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    await restoreBackupStore({
      storeName: STORES.DOCUMENTS,
      entries: backup.documents,
      itemLabel: "document",
      summaryLabel: "documents",
      transformValue: deserializeDocumentContent,
    });

    await restoreBackupStore({
      storeName: STORES.IMAGES,
      entries: backup.images,
      itemLabel: "image",
      summaryLabel: "images",
      transformValue: deserializeDocumentContent,
    });

    await restoreBackupStore({
      storeName: STORES.TRASH,
      entries: backup.trash,
      itemLabel: "trash item",
      summaryLabel: "trash items",
      transformValue: deserializeDocumentContent,
    });

    await restoreBackupStore({
      storeName: STORES.CUSTOM_WALLPAPERS,
      entries: backup.custom_wallpapers,
      itemLabel: "wallpaper",
      summaryLabel: "wallpapers",
    });

    // Clean up backup
    localStorage.removeItem(BACKUP_KEY);
    console.log("[Migration] Backup restored and cleaned up");
  } catch (err) {
    console.error("[Migration] Error restoring backup:", err);
    // Don't remove backup on error so we can try again
  }
}

export async function migrateIndexedDBToUUIDs() {
  console.log("[Migration] Starting UUID migration check...");

  // Log environment info for debugging
  const isMobileSafari =
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    /WebKit/.test(navigator.userAgent) &&
    !/Chrome/.test(navigator.userAgent);
  console.log(
    `[Migration] Environment: ${
      isMobileSafari ? "Mobile Safari" : "Other browser"
    }`
  );

  // Check if we need to backup data before schema migration
  const currentDBVersion = await new Promise<number>((resolve) => {
    const request = indexedDB.open("ryOS");
    request.onsuccess = () => {
      const version = request.result.version;
      request.result.close();
      resolve(version);
    };
    request.onerror = () => resolve(0);
  });

  if (currentDBVersion < 5) {
    console.log(
      `[Migration] Database is version ${currentDBVersion}, need to backup before schema migration`
    );

    // First backup all data
    await backupDataBeforeMigration();

    // Check if backup was successful
    const backupStr = localStorage.getItem(BACKUP_KEY);
    if (!backupStr || backupStr === "{}") {
      console.error(
        "[Migration] Backup failed or is empty, aborting migration"
      );
      return;
    }

    // Now trigger the schema upgrade by opening with new version
    await ensureIndexedDBInitialized();

    // Wait a bit for the upgrade to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Restore the backup
    await restoreBackupAfterMigration();
  }

  // Check if migration has already been done
  if (localStorage.getItem(MIGRATION_KEY) === "completed") {
    console.log("[Migration] Migration already completed, skipping.");
    return;
  }

  console.log("[Migration] Starting IndexedDB UUID migration...");

  try {
    const fileStore = useFilesStore.getState();
    const allItems = Object.values(fileStore.items);

    console.log(`[Migration] Total items in file store: ${allItems.length}`);
    console.log(
      `[Migration] Items with UUIDs: ${
        allItems.filter((item) => item.uuid).length
      }`
    );

    let migratedCount = 0;

    migratedCount += await migrateStoreItemsToUUIDs({
      allItems,
      storeName: STORES.DOCUMENTS,
      itemLabel: "document",
      collectionLabel: "Documents",
      predicate: (item) =>
        !item.isDirectory && item.path.startsWith("/Documents/") && !!item.uuid,
    });

    migratedCount += await migrateStoreItemsToUUIDs({
      allItems,
      storeName: STORES.IMAGES,
      itemLabel: "image",
      collectionLabel: "Images",
      predicate: (item) =>
        !item.isDirectory && item.path.startsWith("/Images/") && !!item.uuid,
    });

    migratedCount += await migrateStoreItemsToUUIDs({
      allItems,
      storeName: STORES.TRASH,
      itemLabel: "trash item",
      collectionLabel: "Trash items",
      predicate: (item) =>
        !item.isDirectory && item.status === "trashed" && !!item.uuid,
    });

    console.log(`[Migration] Total items migrated: ${migratedCount}`);

    // Mark migration as completed
    localStorage.setItem(MIGRATION_KEY, "completed");
    console.log("[Migration] UUID migration completed successfully.");
  } catch (err) {
    console.error("[Migration] Fatal error during UUID migration:", err);
  }
}
