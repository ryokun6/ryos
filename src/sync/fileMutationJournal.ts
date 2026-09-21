import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import type { SplitAtomicEffects } from "@/utils/splitIndexedDBPersistStorage";
import type { SyncOp } from "@/shared/sync2/types";
import { nextHlc } from "@/shared/sync2/hlc";

export interface FileMutation {
  id: string;
  account: string;
  op: SyncOp;
  /** Related catalog/source deletions that must travel with this file. */
  additionalOps?: SyncOp[];
  /** Immutable local bytes paired with this catalog mutation. */
  content?: { storeName: string; key: string; snapshotId?: string; value?: Record<string, unknown> };
}
interface CatalogState { items: Record<string, unknown> }
let remoteDepth = 0;
let lastTimestamp: string | null = null;
let tabId: string | null = null;

export function isRemoteFileChange(): boolean { return remoteDepth > 0; }

export function observeFileMutationTimestamp(timestamp: string): void {
  if (!lastTimestamp || timestamp > lastTimestamp) lastTimestamp = timestamp;
}

/** Scope only the synchronous catalog setter; async I/O must stay outside. */
export function withRemoteFileChanges<T>(apply: () => T, timestamp?: string): T {
  if (timestamp) observeFileMutationTimestamp(timestamp);
  remoteDepth++;
  try { return apply(); } finally { remoteDepth--; }
}

export function createFileMutation(account: string, op: Omit<SyncOp, "t">): FileMutation {
  tabId ??= crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  lastTimestamp = nextHlc(lastTimestamp, tabId);
  const normalizedAccount = account.toLowerCase();
  return {
    id: `${normalizedAccount}:${crypto.randomUUID()}`,
    account: normalizedAccount,
    op: { ...structuredClone(op), t: lastTimestamp },
  };
}

export function fileMutationOps(mutation: FileMutation): SyncOp[] {
  return [mutation.op, ...(mutation.additionalOps ?? [])];
}

export function fileMutationKeys(mutation: FileMutation): string[] {
  return [...fileMutationOps(mutation).map(op => op.k), ...(mutation.content ? [mutation.content.key] : [])];
}

export function createFileMutationEffects<S extends CatalogState>(
  getAccount: () => string | null,
  committed?: () => void
): SplitAtomicEffects<S> {
  let previous: S | undefined;
  return {
    stores: [STORES.SYNC_FILE_MUTATIONS],
    hydrated: state => { previous = state; },
    capture: state => {
      const before = previous;
      previous = state;
      const account = getAccount()?.toLowerCase();
      if (remoteDepth || !account) return [];
      const beforeItems = before?.items ?? {};
      const paths = new Set([...Object.keys(beforeItems), ...Object.keys(state.items)]);
      const writes = [];
      for (const path of paths) {
        if (beforeItems[path] === state.items[path]) continue;
        // Hydration can reconstruct equal rows with different references.
        if (JSON.stringify(beforeItems[path]) === JSON.stringify(state.items[path])) continue;
        const value = createFileMutation(account, {
          k: `files/item:${path}`,
          ...(state.items[path] === undefined ? { del: true } : { v: state.items[path] }),
        });
        writes.push({ storeName: STORES.SYNC_FILE_MUTATIONS, key: value.id, value });
      }
      return writes;
    },
    committed,
  };
}

export async function readFileMutations(account: string): Promise<FileMutation[]> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SYNC_FILE_MUTATIONS, "readonly");
      const request = tx.objectStore(STORES.SYNC_FILE_MUTATIONS).getAll(
        IDBKeyRange.bound(`${account.toLowerCase()}:`, `${account.toLowerCase()}:\uffff`)
      );
      request.onsuccess = () => {
        const mutations = (request.result as FileMutation[]).sort((a, b) => a.op.t.localeCompare(b.op.t));
        for (const mutation of mutations) observeFileMutationTimestamp(mutation.op.t);
        resolve(mutations);
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

/** Read one immutable payload; queue scans never load every pending book. */
export async function readFileMutationContent(mutation: FileMutation): Promise<Record<string, unknown>> {
  const content = mutation.content;
  if (content?.value) return content.value; // early draft compatibility
  if (!content?.snapshotId) throw new Error(`Missing file content snapshot: ${mutation.id}`);
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORES.SYNC_FILE_CONTENTS).objectStore(STORES.SYNC_FILE_CONTENTS).get(content.snapshotId!);
      request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error(`Missing file content snapshot: ${mutation.id}`));
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

/** Delete only the acknowledged IDs; edits appended in another tab survive. */
export async function acknowledgeFileMutations(ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  const db = await ensureIndexedDBInitialized();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORES.SYNC_FILE_MUTATIONS, STORES.SYNC_FILE_CONTENTS], "readwrite");
      const store = tx.objectStore(STORES.SYNC_FILE_MUTATIONS);
      for (const id of ids) { store.delete(id); tx.objectStore(STORES.SYNC_FILE_CONTENTS).delete(id); }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("File mutation acknowledgement aborted"));
    });
  } finally { db.close(); }
}

const CATALOG_CHANNEL = "ryos:file-catalog";
export function broadcastFileCatalogChange(): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CATALOG_CHANNEL);
    channel.postMessage("changed");
    channel.close();
  } catch {
    // Broadcasts are only a wake-up hint; durable work is read on every pull.
  }
}
export function subscribeFileCatalogChanges(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return () => {};
  try {
    const channel = new BroadcastChannel(CATALOG_CHANNEL);
    channel.onmessage = () => onChange();
    return () => channel.close();
  } catch {
    return () => {};
  }
}
