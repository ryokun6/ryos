const SYNC_V2_LOCAL_STORAGE_PREFIX = "ryos:sync2:";
const PERSIST_INTERNAL_PREFIX = "ryos:persist:";

export function shouldIncludeManualBackupLocalStorageKey(key: string): boolean {
  return (
    !key.startsWith(SYNC_V2_LOCAL_STORAGE_PREFIX) &&
    !key.startsWith(PERSIST_INTERNAL_PREFIX)
  );
}
