import { dbOperations, ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import { getStoreForFile, type StoredContent } from "@/utils/indexedDBOperations";
import { settleAllPersistWrites } from "@/utils/persistWriteQueue";
import { isProtectedSystemPath, isWritablePath } from "./pathPolicy";
import { enqueueFileWrite } from "./fileWriteQueue";
import { CONTENT_KEYS } from "./FileSaveTransaction";
import { FILES_STORE_PERSIST_KEY, FILES_STORE_VERSION, useFilesStore, ensureFileContentLoaded, type FileSystemItem } from "@/stores/useFilesStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { refreshFileCatalog } from "@/sync/fileCatalogRefresh";
import { broadcastFileCatalogChange, createFileMutation, fileMutationKeys, withRemoteFileChanges, type FileMutation } from "@/sync/fileMutationJournal";
import { emitCloudSyncDomainChange } from "@/utils/cloudSyncEvents";
import { getSyncKeyNamespace, isSyncBlobNamespace } from "@/shared/sync2/namespaces";

type Operation = { kind: "move"; path: string; destination: string }
  | { kind: "trash" | "restore"; path: string }
  | { kind: "emptyTrash" };
interface Change { before: FileSystemItem; after?: FileSystemItem }
const parentPath = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const contentStore = (item: FileSystemItem) => item.status === "trashed"
  ? STORES.TRASH : getStoreForFile(item.path, item);

function plan(items: Record<string, FileSystemItem>, operation: Operation): Change[] {
  if (operation.kind === "emptyTrash") {
    const changes = Object.values(items).filter(item => item.status === "trashed").map(before => ({ before }));
    if (changes.some(({ before }) => before.isDirectory && Object.values(items).some(item => item.path.startsWith(`${before.path}/`) && item.status !== "trashed"))) {
      throw new Error("Cannot empty a folder containing active files");
    }
    return changes;
  }
  const root = items[operation.path];
  if (!root || isProtectedSystemPath(root.path)) throw new Error("Cannot change this item");
  if (root.status !== (operation.kind === "restore" ? "trashed" : "active")) throw new Error("File status changed; try again");
  let destination = root.path;
  if (operation.kind === "move") {
    destination = operation.destination;
    if (!destination.startsWith("/") || destination.split("/").slice(1).some(part => !part || part === "." || part === "..") || isProtectedSystemPath(destination)) {
      throw new Error("Invalid destination path");
    }
    if (destination === root.path) return [];
    if (destination.startsWith(`${root.path}/`)) throw new Error("Cannot move a folder into itself");
    if (!isWritablePath(parentPath(destination))) throw new Error("Destination is not writable");
  }
  if (operation.kind !== "trash") {
    const parent = items[parentPath(destination)];
    if (parentPath(destination) !== "/" && (!parent?.isDirectory || parent.status !== "active")) throw new Error("Parent directory is unavailable");
  }
  return Object.values(items)
    .filter(item => item.path === root.path || (root.isDirectory && item.path.startsWith(`${root.path}/`)))
    .filter(item => operation.kind === "move" || item.status === root.status)
    .sort((a, b) => a.path.length - b.path.length)
    .map(before => {
      if (operation.kind === "move") {
        const path = destination + before.path.slice(root.path.length);
        if (items[path]) throw new Error("A file already exists at the destination");
        return { before, after: { ...before, path, name: path.slice(path.lastIndexOf("/") + 1), ...(before.status === "trashed" ? { originalPath: path } : {}) } };
      }
      return { before, after: { ...before,
        status: operation.kind === "trash" ? "trashed" as const : "active" as const,
        originalPath: operation.kind === "trash" ? before.path : undefined,
        deletedAt: operation.kind === "trash" ? Date.now() : undefined,
      } };
    });
}

/** Catalog, relocated bytes, and immutable cloud intent commit together. */
export function transitionVfsFiles(operation: Operation): Promise<void> {
  const captured = structuredClone(operation);
  const account = useChatsStore.getState().username;
  return enqueueFileWrite(async () => {
    await refreshFileCatalog();
    const before = useFilesStore.getState().items;
    const changes = plan(before, captured);
    if (!changes.length) return;
    const values = new Map<Change, StoredContent>();
    // Network and Blob conversion must finish before opening a write transaction.
    for (const change of changes) {
      const { before: item, after } = change;
      if (item.isDirectory || !item.uuid || !after || contentStore(item) === contentStore(after)) continue;
      const source = contentStore(item);
      const target = contentStore(after);
      if (!source || !target || !CONTENT_KEYS[source] || !CONTENT_KEYS[target]) throw new Error("Unsupported content destination");
      const namespace = getSyncKeyNamespace(`${CONTENT_KEYS[source]}${item.uuid}`)!;
      if (isSyncBlobNamespace(namespace)) {
        const { getActiveCloudSyncEngine } = await import("@/sync/engine");
        const engine = getActiveCloudSyncEngine();
        if (engine?.hasPendingBlob(namespace, item.uuid) && !(await engine.ensureBlobItemLocal(namespace, item.uuid, { path: item.path }))) {
          throw new Error(`Latest content unavailable for ${item.name}`);
        }
      }
      let value = await dbOperations.get<StoredContent>(source, item.uuid);
      if (!value) {
        const key = `${CONTENT_KEYS[source]}${item.uuid}`;
        const namespace = getSyncKeyNamespace(key)!;
        if (isSyncBlobNamespace(namespace)) {
          const { getActiveCloudSyncEngine } = await import("@/sync/engine");
          await getActiveCloudSyncEngine()?.ensureBlobItemLocal(namespace, item.uuid, { path: item.path });
        } else await ensureFileContentLoaded(item.path, item.uuid);
        value = await dbOperations.get<StoredContent>(source, item.uuid);
        // Older folder-trash code moved only metadata. Recover its retained bytes.
        if (!value && item.status === "trashed") {
          const legacyStore = getStoreForFile(item.path, item);
          if (legacyStore) value = await dbOperations.get<StoredContent>(legacyStore, item.uuid);
        }
      }
      if (!value) throw new Error(`Content unavailable for ${item.name}; download it before moving this item`);
      values.set(change, { ...value, name: after.name,
        content: target === STORES.BOOKS && value.content instanceof Blob ? await value.content.arrayBuffer() : value.content,
      });
    }
    await settleAllPersistWrites();
    if (useChatsStore.getState().username !== account) throw new Error("Account changed; try again");
    const next = { ...before };
    for (const { before: item, after } of changes) {
      delete next[item.path];
      if (after) next[after.path] = after;
    }
    const icon = Object.values(next).some(item => item.status === "trashed") ? "/icons/trash-full.png" : "/icons/trash-empty.png";
    if (next["/Trash"] && next["/Trash"].icon !== icon) {
      const after = { ...next["/Trash"], icon };
      changes.push({ before: before["/Trash"], after });
      next["/Trash"] = after;
    }
    // Shared UUIDs may still be referenced by another catalog row. Legacy
    // folder trash may also have retained bytes in the original content store.
    const deletions = new Map<Change, string[]>();
    for (const change of changes) {
      const { before: item, after } = change;
      if (item.isDirectory || !item.uuid) continue;
      const source = contentStore(item);
      const candidates = new Set([source, ...(!after && item.status === "trashed" ? [getStoreForFile(item.path, item)] : [])]);
      deletions.set(change, [...candidates].filter((store): store is string => Boolean(store && CONTENT_KEYS[store] &&
        !Object.values(next).some(other => !other.isDirectory && other.uuid === item.uuid && contentStore(other) === store))));
    }
    const mutations: FileMutation[] = [];
    for (const change of changes) {
      if (!account) continue;
      const { before: item, after } = change;
      const mutation = createFileMutation(account, after
        ? { k: `files/item:${after.path}`, v: after }
        : { k: `files/item:${item.path}`, del: true });
      const extra = [];
      if (after && after.path !== item.path) extra.push({ k: `files/item:${item.path}`, t: mutation.op.t, del: true as const });
      const target = after && contentStore(after);
      for (const store of deletions.get(change) ?? []) extra.push({ k: `${CONTENT_KEYS[store]}${item.uuid}`, t: mutation.op.t, del: true as const });
      if (values.has(change) && after && target) mutation.content = { storeName: target, key: `${CONTENT_KEYS[target]}${item.uuid}`, snapshotId: mutation.id };
      if (extra.length) mutation.additionalOps = extra;
      mutations.push(mutation);
    }
    const db = await ensureIndexedDBInitialized();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([...Object.keys(CONTENT_KEYS), STORES.VFS_ITEMS, STORES.PERSISTED_STATE, STORES.SYNC_FILE_MUTATIONS, STORES.SYNC_FILE_CONTENTS], "readwrite");
        const abort = (error: unknown) => { tx.abort(); reject(error); };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("File transition aborted"));
        const catalog = tx.objectStore(STORES.VFS_ITEMS);
        const request = catalog.getAll();
        request.onsuccess = () => {
          try {
            const current = Object.fromEntries(request.result.map(row => [row.item.path, row.item])) as Record<string, FileSystemItem>;
            const touched = new Set(changes.flatMap(({ before: item, after }) => [item.path, ...(after ? [after.path, parentPath(after.path)] : [])]));
            // Re-plan detects new descendants and collisions created by another tab.
            const currentPlan = plan(current, captured);
            const originalPlan = changes.filter(change => change.before.path !== "/Trash");
            if (!same(currentPlan.map(c => c.before.path).sort(), originalPlan.map(c => c.before.path).sort()) || [...touched].some(path => !same(current[path], before[path]))) {
              throw new Error("Files changed in another tab; try again");
            }
            const currentNext = { ...current };
            for (const { before: item, after } of changes) {
              delete currentNext[item.path];
              if (after) currentNext[after.path] = after;
            }
            for (const change of changes) {
              const { before: item, after } = change;
              for (const store of deletions.get(change) ?? []) {
                if (Object.values(currentNext).some(other => !other.isDirectory && other.uuid === item.uuid && contentStore(other) === store)) {
                  throw new Error("Content gained another reference; try again");
                }
              }
              if (values.has(change) && after && Object.values(currentNext).some(other => other.path !== after.path && !other.isDirectory && other.uuid === item.uuid && contentStore(other) === contentStore(after))) {
                throw new Error("Content identity already exists at the destination");
              }
            }
            for (const change of changes) {
              const { before: item, after } = change;
              catalog.delete(item.path);
              if (after) catalog.put({ item: after }, after.path);
              const target = after && contentStore(after);
              if (item.uuid) {
                if (values.has(change) && target) tx.objectStore(target).put(values.get(change)!, item.uuid);
                for (const store of deletions.get(change) ?? []) tx.objectStore(store).delete(item.uuid);
              }
            }
            for (const mutation of mutations) {
              tx.objectStore(STORES.SYNC_FILE_MUTATIONS).put(mutation, mutation.id);
              if (mutation.content) {
                const change = changes.find(c => c.after?.path === (mutation.op.v as FileSystemItem).path)!;
                tx.objectStore(STORES.SYNC_FILE_CONTENTS).put(values.get(change)!, mutation.id);
              }
            }
            const persisted = tx.objectStore(STORES.PERSISTED_STATE);
            const state = persisted.get(FILES_STORE_PERSIST_KEY);
            state.onsuccess = () => {
              try { persisted.put({ ...state.result, state: { ...state.result?.state, items: {}, libraryState: "loaded" }, version: FILES_STORE_VERSION,
                __ryosSplitLayout: { version: 1, generation: crypto.randomUUID() } }, FILES_STORE_PERSIST_KEY); }
              catch (error) { abort(error); }
            };
          } catch (error) { abort(error); }
        };
      });
    } finally { db.close(); }
    withRemoteFileChanges(() => {
      const current = useFilesStore.getState().items;
      const merged = { ...current };
      for (const path of new Set(changes.flatMap(c => [c.before.path, ...(c.after ? [c.after.path] : [])]))) {
        if (current[path] !== before[path]) continue;
        if (next[path]) merged[path] = next[path]; else delete merged[path];
      }
      useFilesStore.setState({ items: merged });
    }, mutations.at(-1)?.op.t);
    broadcastFileCatalogChange();
    for (const key of mutations.flatMap(fileMutationKeys)) {
      const namespace = getSyncKeyNamespace(key);
      if (namespace) emitCloudSyncDomainChange(namespace, [key]);
    }
  });
}
