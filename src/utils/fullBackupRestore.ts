import { clearAllAppStates } from "@/stores/useAppStore";
import { clearPrefetchFlag } from "@/utils/prefetch";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
import {
  BACKUP_INDEXEDDB_STORES,
  restoreStoreItems,
  upgradeLegacyBackupStoreValue,
  type RyOSFullBackup,
} from "@/utils/indexedDBBackup";

/**
 * Normalize persisted files store after a full backup restore so Zustand
 * migrations do not re-run incorrectly.
 */
export function normalizeFilesStoreAfterFullBackupRestore(
  logFilesNormalizeError?: (err: unknown) => void
): void {
  try {
    const persistedKey = "ryos:files";
    const persistedState = localStorage.getItem(persistedKey);
    if (persistedState) {
      const parsed = JSON.parse(persistedState);
      if (parsed?.state) {
        const hasItems =
          parsed.state.items && Object.keys(parsed.state.items).length > 0;
        parsed.state.libraryState = hasItems ? "loaded" : "uninitialized";
        if (!parsed.version || parsed.version < 5) {
          parsed.version = 5;
        }
        localStorage.setItem(persistedKey, JSON.stringify(parsed));
      }
    }
  } catch (fallbackErr) {
    if (logFilesNormalizeError) {
      logFilesNormalizeError(fallbackErr);
    } else {
      console.error(
        "[FullBackupRestore] Files store normalize failed:",
        fallbackErr
      );
    }
  }
}

export interface ApplyRyosFullBackupRestoreOptions {
  setCurrentWallpaper: (path: string) => void;
  /** Called after console.error when IndexedDB restore throws (e.g. local alert). */
  onIndexedDBRestoreError?: (error: unknown) => void;
  logPrefix?: string;
  logFilesNormalizeError?: (err: unknown) => void;
  /** Cloud UI: after clear + before localStorage restore */
  onAfterClearState?: () => void;
  onAfterLocalStorage?: () => void;
  onAfterIndexedDB?: () => void;
  onAfterWallpaperAndNormalize?: () => void;
}

export async function applyRyosFullBackupRestore(
  backup: RyOSFullBackup,
  options: ApplyRyosFullBackupRestoreOptions
): Promise<void> {
  const {
    setCurrentWallpaper,
    onIndexedDBRestoreError,
    logPrefix = "",
    logFilesNormalizeError,
    onAfterClearState,
    onAfterLocalStorage,
    onAfterIndexedDB,
    onAfterWallpaperAndNormalize,
  } = options;
  const prefix = logPrefix ? `${logPrefix} ` : "";

  clearAllAppStates();
  clearPrefetchFlag();
  onAfterClearState?.();

  Object.entries(backup.localStorage).forEach(([key, value]) => {
    if (value !== null) {
      localStorage.setItem(key, value as string);
    }
  });
  onAfterLocalStorage?.();

  if (backup.indexedDB) {
    try {
      const db = await ensureIndexedDBInitialized();
      const restorePromises = BACKUP_INDEXEDDB_STORES.flatMap((storeName) => {
        const items = backup.indexedDB?.[storeName];
        if (!items) {
          return [];
        }
        return restoreStoreItems(db, storeName, items, {
          mapValue: (value) =>
            upgradeLegacyBackupStoreValue(backup.version, storeName, value),
        });
      });
      await Promise.all(restorePromises);
      db.close();
    } catch (error) {
      console.error(`${prefix}Error restoring IndexedDB:`, error);
      onIndexedDBRestoreError?.(error);
    }
  }
  onAfterIndexedDB?.();

  if (backup.localStorage["ryos:app:settings:wallpaper"]) {
    const wallpaper = backup.localStorage["ryos:app:settings:wallpaper"];
    if (wallpaper) {
      setCurrentWallpaper(wallpaper);
    }
  }

  normalizeFilesStoreAfterFullBackupRestore(logFilesNormalizeError);
  onAfterWallpaperAndNormalize?.();
}
