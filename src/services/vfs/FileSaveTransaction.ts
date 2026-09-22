import { enqueueFileWrite } from "./fileWriteQueue";
import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import { settleAllPersistWrites } from "@/utils/persistWriteQueue";
import { getStoreForFile, type StoredContent } from "@/utils/indexedDBOperations";
import { FILES_STORE_PERSIST_KEY, FILES_STORE_VERSION, useFilesStore, type FileSystemItem } from "@/stores/useFilesStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { broadcastFileCatalogChange, createFileMutation, withRemoteFileChanges } from "@/sync/fileMutationJournal";

export const CONTENT_KEYS: Record<string, string> = {
  [STORES.DOCUMENTS]: "files/doc:",
  [STORES.BOOKS]: "books/item:",
  [STORES.IMAGES]: "images/item:",
  [STORES.APPLETS]: "applets/item:",
  [STORES.TRASH]: "trash/item:",
};

/** Preserve invocation order across saves, moves, and trash operations. */
export function saveVfsFile(item: FileSystemItem, content: StoredContent["content"]): Promise<void> {
  const account = useChatsStore.getState().username;
  const capturedItem = structuredClone(item);
  const capturedContent = content instanceof ArrayBuffer ? content.slice(0) : content;
  return enqueueFileWrite(() => commitVfsFile(capturedItem, capturedContent, account));
}

/** A successful save means catalog, bytes and sync intent committed together. */
async function commitVfsFile(
  item: FileSystemItem,
  content: StoredContent["content"],
  account: string | null
): Promise<void> {
  const before = useFilesStore.getState().items[item.path];
  const metadata = structuredClone({ ...before, ...item });
  const storeName = getStoreForFile(item.path, metadata);
  if (!item.uuid || !storeName || !CONTENT_KEYS[storeName]) {
    throw new Error(`Cannot save content at ${item.path}`);
  }
  // Capture time and account before asynchronous conversion or storage work.
  const mutation = account ? createFileMutation(account, { k: `files/item:${item.path}`, v: metadata }) : undefined;
  const value = {
    name: item.name,
    content: storeName === STORES.BOOKS && content instanceof Blob ? await content.arrayBuffer() : content,
  };
  if (mutation) mutation.content = {
    storeName,
    key: `${CONTENT_KEYS[storeName]}${item.uuid}`,
    snapshotId: mutation.id,
  };
  await settleAllPersistWrites();
  if (useChatsStore.getState().username !== account) throw new Error("Account changed; try again");
  const db = await ensureIndexedDBInitialized();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([storeName, STORES.VFS_ITEMS, STORES.PERSISTED_STATE, STORES.SYNC_FILE_MUTATIONS, STORES.SYNC_FILE_CONTENTS], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("File save transaction aborted"));
      const parentPath = item.path.slice(0, item.path.lastIndexOf("/")) || "/";
      const parentRequest = tx.objectStore(STORES.VFS_ITEMS).get(parentPath);
      parentRequest.onsuccess = () => {
        const parent = parentRequest.result?.item as FileSystemItem | undefined;
        if (parentPath !== "/" && (!parent?.isDirectory || parent.status === "trashed")) {
          tx.abort();
          reject(new Error(`Parent directory is unavailable: ${parentPath}`));
          return;
        }
        const identities = tx.objectStore(STORES.VFS_ITEMS).index("uuid").getAll(item.uuid);
        identities.onsuccess = () => {
          const rows = identities.result as { item: FileSystemItem }[];
          if (rows.some(row => row.item.path === item.path && row.item.status === "trashed") ||
            (rows.length > 0 && !rows.some(row => row.item.path === item.path))) {
            tx.abort();
            reject(new Error("File moved or was trashed; reopen it before saving"));
            return;
          }
          try {
            tx.objectStore(storeName).put(value, item.uuid);
            tx.objectStore(STORES.VFS_ITEMS).put({ item: metadata }, item.path);
            if (mutation) {
              tx.objectStore(STORES.SYNC_FILE_MUTATIONS).put(mutation, mutation.id);
              tx.objectStore(STORES.SYNC_FILE_CONTENTS).put(value, mutation.id);
            }
            const persisted = tx.objectStore(STORES.PERSISTED_STATE);
            const request = persisted.get(FILES_STORE_PERSIST_KEY);
            request.onsuccess = () => {
              try {
                persisted.put({
                  ...request.result,
                  state: { ...request.result?.state, items: {}, libraryState: "loaded" },
                  version: FILES_STORE_VERSION,
                  __ryosSplitLayout: { version: 1, generation: crypto.randomUUID() },
                }, FILES_STORE_PERSIST_KEY);
              } catch (error) { tx.abort(); reject(error); }
            };
          } catch (error) { tx.abort(); reject(error); }
        };
      };
    });
  } finally { db.close(); }
  // Do not overwrite a newer in-memory edit made while the transaction ran.
  withRemoteFileChanges(() => {
    const state = useFilesStore.getState();
    if (state.items[item.path] === before) {
      useFilesStore.setState({ items: { ...state.items, [item.path]: metadata }, libraryState: "loaded" });
    }
  }, mutation?.op.t);
  broadcastFileCatalogChange();
}
