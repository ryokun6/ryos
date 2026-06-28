const SYNC_V2_LOCAL_STORAGE_PREFIX = "ryos:sync2:";

export function shouldIncludeManualBackupLocalStorageKey(key: string): boolean {
  return !key.startsWith(SYNC_V2_LOCAL_STORAGE_PREFIX);
}
