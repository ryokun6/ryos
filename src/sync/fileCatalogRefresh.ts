import { useFilesStore, type FileSystemItem } from "@/stores/useFilesStore";
import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import { settleAllPersistWrites } from "@/utils/persistWriteQueue";
import { readStoreItems } from "@/utils/indexedDBBackup";
import { withRemoteFileChanges } from "./fileMutationJournal";

/** Merge another tab's committed rows without discarding edits made during I/O. */
export async function refreshFileCatalog(): Promise<void> {
  const before = useFilesStore.getState().items;
  await settleAllPersistWrites();
  const db = await ensureIndexedDBInitialized();
  let persisted: Record<string, FileSystemItem>;
  try {
    persisted = Object.fromEntries((await readStoreItems(db, STORES.VFS_ITEMS))
      .flatMap(row => row.key && row.value.item ? [[row.key, row.value.item as FileSystemItem]] : []));
  } finally { db.close(); }
  withRemoteFileChanges(() => {
    const current = useFilesStore.getState().items;
    const next = { ...current };
    let changed = false;
    for (const path of new Set([...Object.keys(before), ...Object.keys(persisted)])) {
      if (current[path] !== before[path]) continue;
      if (JSON.stringify(current[path]) === JSON.stringify(persisted[path])) continue;
      if (persisted[path]) next[path] = persisted[path];
      else delete next[path];
      changed = true;
    }
    if (changed) useFilesStore.setState({ items: next });
  });
}
