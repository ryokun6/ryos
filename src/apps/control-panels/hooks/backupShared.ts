import { v4 as uuidv4 } from "uuid";
import {
  readStoreItems,
  restoreStoreItems,
  serializeStoreItems,
  type IndexedDBStoreItemWithKey,
} from "@/utils/indexedDBBackup";

export type StoreItemWithKey = IndexedDBStoreItemWithKey;

/** Maximum cloud backup size in bytes (must match server-side MAX_BACKUP_SIZE) */
export const CLOUD_BACKUP_MAX_SIZE = 50 * 1024 * 1024;

export const BACKUP_INDEXEDDB_STORES = [
  "documents",
  "images",
  "trash",
  "custom_wallpapers",
  "applets",
] as const;

export function upgradeLegacyBackupStoreValue(
  backupVersion: number,
  storeName: string,
  value: Record<string, unknown>
): Record<string, unknown> {
  if (
    backupVersion >= 2 ||
    (storeName !== "documents" && storeName !== "images")
  ) {
    return value;
  }

  const nextValue = { ...value };
  if (!nextValue.uuid) {
    nextValue.uuid = uuidv4();
  }
  if (!nextValue.contentUrl && nextValue.content instanceof Blob) {
    nextValue.contentUrl = URL.createObjectURL(nextValue.content);
  }
  return nextValue;
}

export { readStoreItems, restoreStoreItems, serializeStoreItems };
