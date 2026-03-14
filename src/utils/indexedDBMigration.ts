import type { FileSystemItem } from "@/stores/useFilesStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { STORES } from "@/utils/indexedDB";
import { getStoreForFile } from "@/utils/indexedDBOperations";
import {
  getContentStorageBackend,
  getStorageItem,
  listLegacyIndexedDbItems,
  putStorageItem,
  type StorageRecord,
  type StorageStoreName,
} from "@/utils/opfsStorage";
import { normalizeStoredWallpaperReference } from "@/utils/wallpaperStorage";

const MIGRATION_KEY = "ryos:opfs-storage-migration-v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidLike(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function resolveLegacyContentKey(
  storeName: StorageStoreName,
  legacyKey: string,
  fileItems: FileSystemItem[]
): string {
  if (storeName === STORES.CUSTOM_WALLPAPERS || isUuidLike(legacyKey)) {
    return legacyKey;
  }

  const matchingItem = fileItems.find((item) => {
    if (item.isDirectory || !item.uuid || item.name !== legacyKey) {
      return false;
    }

    if (storeName === STORES.TRASH) {
      return item.status === "trashed";
    }

    if (item.status === "trashed") {
      return false;
    }

    return (
      getStoreForFile(item.path, {
        name: item.name,
        type: item.type,
      }) === storeName
    );
  });

  return matchingItem?.uuid || legacyKey;
}

function normalizePersistedWallpaperReferences(): void {
  const persistedDisplaySettings = localStorage.getItem("ryos:display-settings");
  if (!persistedDisplaySettings) {
    return;
  }

  try {
    const parsed = JSON.parse(persistedDisplaySettings) as {
      state?: { currentWallpaper?: string; wallpaperSource?: string };
    };

    if (!parsed.state) {
      return;
    }

    parsed.state.currentWallpaper = normalizeStoredWallpaperReference(
      parsed.state.currentWallpaper || ""
    );
    parsed.state.wallpaperSource = normalizeStoredWallpaperReference(
      parsed.state.wallpaperSource || ""
    );

    localStorage.setItem("ryos:display-settings", JSON.stringify(parsed));
  } catch (error) {
    console.error("[Migration] Failed to normalize wallpaper references:", error);
  }
}

async function migrateLegacyStoreToOpfs(
  storeName: StorageStoreName,
  fileItems: FileSystemItem[]
): Promise<{ sourceCount: number; migratedCount: number }> {
  const legacyItems = (await listLegacyIndexedDbItems<StorageRecord>(
    storeName
  )) as Array<{ key: string; value: StorageRecord }>;

  let migratedCount = 0;

  for (const item of legacyItems) {
    const targetKey = resolveLegacyContentKey(storeName, item.key, fileItems);
    const existingTarget = await getStorageItem(storeName, targetKey);

    if (existingTarget !== undefined) {
      continue;
    }

    await putStorageItem(storeName, item.value, targetKey);

    const copiedItem = await getStorageItem(storeName, targetKey);
    if (copiedItem === undefined) {
      throw new Error(
        `Failed to validate migrated ${storeName} record for key ${targetKey}`
      );
    }

    migratedCount += 1;

    if (targetKey !== item.key) {
      console.log(
        `[Migration] Remapped legacy ${storeName} key "${item.key}" -> "${targetKey}"`
      );
    }
  }

  return {
    sourceCount: legacyItems.length,
    migratedCount,
  };
}

export async function migrateIndexedDBToUUIDs(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (localStorage.getItem(MIGRATION_KEY) === "completed") {
    return;
  }

  if (getContentStorageBackend() !== "opfs") {
    console.log(
      "[Migration] OPFS is unavailable in this browser; skipping legacy copy."
    );
    return;
  }

  try {
    const fileItems = Object.values(useFilesStore.getState().items);
    const storesToMigrate: StorageStoreName[] = [
      STORES.DOCUMENTS,
      STORES.IMAGES,
      STORES.TRASH,
      STORES.CUSTOM_WALLPAPERS,
      STORES.APPLETS,
    ];

    let totalSourceCount = 0;
    let totalMigratedCount = 0;

    for (const storeName of storesToMigrate) {
      const result = await migrateLegacyStoreToOpfs(storeName, fileItems);
      totalSourceCount += result.sourceCount;
      totalMigratedCount += result.migratedCount;
    }

    normalizePersistedWallpaperReferences();
    localStorage.setItem(MIGRATION_KEY, "completed");

    console.log(
      `[Migration] IndexedDB -> OPFS copy complete. Migrated ${totalMigratedCount} of ${totalSourceCount} legacy records.`
    );
  } catch (error) {
    console.error("[Migration] Failed migrating IndexedDB content to OPFS:", error);
  }
}
