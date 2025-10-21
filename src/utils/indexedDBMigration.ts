import {
  dbOperations,
  DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import { STORES } from "@/utils/indexedDB";
import { useFilesStore } from "@/stores/useFilesStore";

// Check if migration has been completed
const MIGRATION_KEY = "ryos:indexeddb-uuid-migration-v1";
const BACKUP_KEY = "ryos:indexeddb-backup";

// Backup all data before schema migration
async function backupDataBeforeMigration() {
  console.log("[Migration] Backing up data before schema migration...");

  const backup: {
    documents: Array<{ key: string; value: DocumentContent }>;
    images: Array<{ key: string; value: DocumentContent }>;
    trash: Array<{ key: string; value: DocumentContent }>;
    custom_wallpapers: Array<{ key: string; value: { url: string } }>;
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
    ): Promise<Array<{ key: string; value: T }>> => {
      const items: Array<{ key: string; value: T }> = [];

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
    const serializableBackup = {
      documents: await Promise.all(
        backup.documents.map(async (item) => ({
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
      ),
      images: await Promise.all(
        backup.images.map(async (item) => ({
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
      ),
      trash: await Promise.all(
        backup.trash.map(async (item) => ({
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
      ),
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
    const backup = JSON.parse(backupStr);
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

    // Restore documents with their original keys
    let restoredCount = 0;
    for (const item of backup.documents || []) {
      try {
        const value = { ...item.value };
        // Convert base64 back to Blob if needed
        if (value.content?._isBlob) {
          value.content = base64ToBlob(value.content.data, value.content.type);
        }
        await dbOperations.put(STORES.DOCUMENTS, value, item.key);
        restoredCount++;
      } catch (err) {
        console.error(
          `[Migration] Failed to restore document ${item.key}:`,
          err
        );
      }
    }
    console.log(
      `[Migration] Restored ${restoredCount}/${
        backup.documents?.length || 0
      } documents`
    );

    // Restore images with their original keys
    restoredCount = 0;
    for (const item of backup.images || []) {
      try {
        const value = { ...item.value };
        // Convert base64 back to Blob if needed
        if (value.content?._isBlob) {
          value.content = base64ToBlob(value.content.data, value.content.type);
        }
        await dbOperations.put(STORES.IMAGES, value, item.key);
        restoredCount++;
      } catch (err) {
        console.error(`[Migration] Failed to restore image ${item.key}:`, err);
      }
    }
    console.log(
      `[Migration] Restored ${restoredCount}/${
        backup.images?.length || 0
      } images`
    );

    // Restore trash with their original keys
    restoredCount = 0;
    for (const item of backup.trash || []) {
      try {
        const value = { ...item.value };
        // Convert base64 back to Blob if needed
        if (value.content?._isBlob) {
          value.content = base64ToBlob(value.content.data, value.content.type);
        }
        await dbOperations.put(STORES.TRASH, value, item.key);
        restoredCount++;
      } catch (err) {
        console.error(
          `[Migration] Failed to restore trash item ${item.key}:`,
          err
        );
      }
    }
    console.log(
      `[Migration] Restored ${restoredCount}/${
        backup.trash?.length || 0
      } trash items`
    );

    // Restore custom wallpapers
    restoredCount = 0;
    for (const item of backup.custom_wallpapers || []) {
      try {
        await dbOperations.put(STORES.CUSTOM_WALLPAPERS, item.value, item.key);
        restoredCount++;
      } catch (err) {
        console.error(
          `[Migration] Failed to restore wallpaper ${item.key}:`,
          err
        );
      }
    }
    console.log(
      `[Migration] Restored ${restoredCount}/${
        backup.custom_wallpapers?.length || 0
      } wallpapers`
    );

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
    const { ensureIndexedDBInitialized } = await import("@/utils/indexedDB");
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

    // Process documents
    const documentsToMigrate = allItems.filter(
      (item) =>
        !item.isDirectory && item.path.startsWith("/Documents/") && item.uuid
    );

    console.log(
      `[Migration] Documents to migrate: ${documentsToMigrate.length}`
    );

    for (const item of documentsToMigrate) {
      try {
        // Try to get content by filename (old way)
        const content = await dbOperations.get<DocumentContent>(
          STORES.DOCUMENTS,
          item.name
        );
        if (content && item.uuid) {
          console.log(
            `[Migration] Found content for ${item.name}, migrating to UUID ${item.uuid}`
          );
          // Save with UUID as key
          await dbOperations.put<DocumentContent>(
            STORES.DOCUMENTS,
            content,
            item.uuid
          );
          // Delete old filename-based entry
          await dbOperations.delete(STORES.DOCUMENTS, item.name);
          console.log(
            `[Migration] Successfully migrated document: ${item.name} -> ${item.uuid}`
          );
          migratedCount++;
        } else if (!content) {
          // Check if content already exists with UUID
          if (item.uuid) {
            const uuidContent = await dbOperations.get<DocumentContent>(
              STORES.DOCUMENTS,
              item.uuid
            );
            if (uuidContent) {
              console.log(
                `[Migration] Document ${item.name} already migrated to UUID ${item.uuid}`
              );
            } else {
              console.log(
                `[Migration] No content found for document ${item.name} - file might be empty`
              );
            }
          }
        }
      } catch (err) {
        console.error(
          `[Migration] Error migrating document ${item.name}:`,
          err
        );
      }
    }

    // Process images
    const imagesToMigrate = allItems.filter(
      (item) =>
        !item.isDirectory && item.path.startsWith("/Images/") && item.uuid
    );

    console.log(`[Migration] Images to migrate: ${imagesToMigrate.length}`);

    for (const item of imagesToMigrate) {
      try {
        // Try to get content by filename (old way)
        const content = await dbOperations.get<DocumentContent>(
          STORES.IMAGES,
          item.name
        );
        if (content && item.uuid) {
          console.log(
            `[Migration] Found content for ${item.name}, migrating to UUID ${item.uuid}`
          );
          // Save with UUID as key
          await dbOperations.put<DocumentContent>(
            STORES.IMAGES,
            content,
            item.uuid
          );
          // Delete old filename-based entry
          await dbOperations.delete(STORES.IMAGES, item.name);
          console.log(
            `[Migration] Successfully migrated image: ${item.name} -> ${item.uuid}`
          );
          migratedCount++;
        } else if (!content) {
          // Check if content already exists with UUID
          if (item.uuid) {
            const uuidContent = await dbOperations.get<DocumentContent>(
              STORES.IMAGES,
              item.uuid
            );
            if (uuidContent) {
              console.log(
                `[Migration] Image ${item.name} already migrated to UUID ${item.uuid}`
              );
            } else {
              console.log(
                `[Migration] No content found for image ${item.name} - file might be empty`
              );
            }
          }
        }
      } catch (err) {
        console.error(`[Migration] Error migrating image ${item.name}:`, err);
      }
    }

    // Process trash items
    const trashItemsToMigrate = allItems.filter(
      (item) => !item.isDirectory && item.status === "trashed" && item.uuid
    );

    console.log(
      `[Migration] Trash items to migrate: ${trashItemsToMigrate.length}`
    );

    for (const item of trashItemsToMigrate) {
      try {
        // Try to get content by filename (old way)
        const content = await dbOperations.get<DocumentContent>(
          STORES.TRASH,
          item.name
        );
        if (content && item.uuid) {
          console.log(
            `[Migration] Found content for ${item.name}, migrating to UUID ${item.uuid}`
          );
          // Save with UUID as key
          await dbOperations.put<DocumentContent>(
            STORES.TRASH,
            content,
            item.uuid
          );
          // Delete old filename-based entry
          await dbOperations.delete(STORES.TRASH, item.name);
          console.log(
            `[Migration] Successfully migrated trash item: ${item.name} -> ${item.uuid}`
          );
          migratedCount++;
        } else if (!content) {
          // Check if content already exists with UUID
          if (item.uuid) {
            const uuidContent = await dbOperations.get<DocumentContent>(
              STORES.TRASH,
              item.uuid
            );
            if (uuidContent) {
              console.log(
                `[Migration] Trash item ${item.name} already migrated to UUID ${item.uuid}`
              );
            } else {
              console.log(
                `[Migration] No content found for trash item ${item.name} - file might be empty`
              );
            }
          }
        }
      } catch (err) {
        console.error(
          `[Migration] Error migrating trash item ${item.name}:`,
          err
        );
      }
    }

    console.log(`[Migration] Total items migrated: ${migratedCount}`);

    // Mark migration as completed
    localStorage.setItem(MIGRATION_KEY, "completed");
    console.log("[Migration] UUID migration completed successfully.");
  } catch (err) {
    console.error("[Migration] Fatal error during UUID migration:", err);
  }
}
