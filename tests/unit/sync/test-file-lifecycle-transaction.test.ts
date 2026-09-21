import { transitionVfsFiles } from "../../../src/services/vfs/FileLifecycleTransaction";
import "../../helpers/local-storage-stub";
import { beforeEach, afterEach, describe, expect, test, spyOn } from "bun:test";
import { resetFakeIndexedDB } from "../../helpers/reset-fake-indexeddb";
import { resetPersistWritesForTests, settleAllPersistWrites } from "../../../src/utils/persistWriteQueue";
import { dbOperations, ensureIndexedDBInitialized, STORES } from "../../../src/utils/indexedDB";
import { useFilesStore, type FileSystemItem } from "../../../src/stores/useFilesStore";
import { useChatsStore } from "../../../src/stores/useChatsStore";
import { readFileMutations, readFileMutationContent, fileMutationOps, withRemoteFileChanges } from "../../../src/sync/fileMutationJournal";
import { saveVfsFile } from "../../../src/services/vfs/FileSaveTransaction";
import { CloudSyncEngine } from "../../../src/sync/engine";
import { useCloudSyncStore } from "../../../src/stores/useCloudSyncStore";
import type { SyncOp } from "../../../src/shared/sync2/types";

const originalFetch = globalThis.fetch;
const originalFiles = useFilesStore.getState();
const originalChats = useChatsStore.getState();
const originalCloud = useCloudSyncStore.getState();
const account = "transaction-test";
const item = (extension = "md"): FileSystemItem => ({ path: `/saved.${extension}`, name: `saved.${extension}`, uuid: "saved-content", isDirectory: false, status: "active", modifiedAt: 1 });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function replay(engine: CloudSyncEngine) {
  await (engine as unknown as { replayFileMutations(): Promise<void> }).replayFileMutations();
}
beforeEach(async () => {
  resetPersistWritesForTests();
  resetFakeIndexedDB();
  globalThis.fetch = (async () => response({ authenticated: true, username: account, directories: [], files: [] })) as typeof fetch;
  withRemoteFileChanges(() => useFilesStore.setState({ items: {}, libraryState: "loaded" }));
  useChatsStore.setState({ username: account });
  useCloudSyncStore.setState({ autoSyncEnabled: true, syncFiles: true });
  await settleAllPersistWrites();
  useChatsStore.setState({ username: account });
});
afterEach(() => {
  withRemoteFileChanges(() => useFilesStore.setState(originalFiles));
  useChatsStore.setState(originalChats);
  useCloudSyncStore.setState(originalCloud);
  resetPersistWritesForTests();
  globalThis.fetch = originalFetch;
});

const folder = (path: string): FileSystemItem => ({ path, name: path.slice(path.lastIndexOf("/") + 1), isDirectory: true, status: "active" });
async function addFolders(...paths: string[]) {
  withRemoteFileChanges(() => useFilesStore.setState({ items: { ...useFilesStore.getState().items, ...Object.fromEntries(paths.map(path => [path, folder(path)])) } }));
  await settleAllPersistWrites();
}
const formats = [["md", STORES.DOCUMENTS], ["png", STORES.IMAGES], ["html", STORES.APPLETS], ["epub", STORES.BOOKS]] as const;
async function mixedFolder() {
  await addFolders("/Mixed", "/Trash");
  for (const [ext] of formats) await saveVfsFile({ ...item(ext), path: `/Mixed/saved.${ext}`, uuid: ext }, `bytes-${ext}`);
}

describe("atomic file lifecycle", () => {
  test("rename keeps content identity and bytes without a new content snapshot", async () => {
    await saveVfsFile(item(), "text");
    await transitionVfsFiles({ kind: "move", path: "/saved.md", destination: "/renamed.md" });
    expect(useFilesStore.getState().items["/saved.md"]).toBeUndefined();
    expect(useFilesStore.getState().items["/renamed.md"].uuid).toBe("saved-content");
    expect(await dbOperations.get(STORES.DOCUMENTS, "saved-content")).toEqual({ name: "saved.md", content: "text" });
    const mutation = (await readFileMutations(account)).at(-1)!;
    expect(mutation.content).toBeUndefined();
    expect(fileMutationOps(mutation)).toEqual([
      expect.objectContaining({ k: "files/item:/renamed.md" }),
      { k: "files/item:/saved.md", t: mutation.op.t, del: true },
    ]);
  });

  test("folder trash and restore relocate every file format with paired source deletions", async () => {
    await mixedFolder();
    await transitionVfsFiles({ kind: "trash", path: "/Mixed" });
    for (const [ext, store] of formats) {
      expect(await dbOperations.get(store, ext)).toBeUndefined();
      expect(await dbOperations.get(STORES.TRASH, ext)).toEqual({ name: `saved.${ext}`, content: `bytes-${ext}` });
      expect(useFilesStore.getState().items[`/Mixed/saved.${ext}`].status).toBe("trashed");
    }
    const queued = await readFileMutations(account);
    expect(queued.filter(m => m.content?.storeName === STORES.TRASH)).toHaveLength(4);
    for (const mutation of queued.filter(m => m.content?.storeName === STORES.TRASH)) {
      expect(mutation.additionalOps).toHaveLength(1);
      expect(mutation.additionalOps![0].del).toBe(true);
      expect((await readFileMutationContent(mutation)).content).toBeDefined();
    }
    await transitionVfsFiles({ kind: "restore", path: "/Mixed" });
    for (const [ext, store] of formats) {
      expect(await dbOperations.get(STORES.TRASH, ext)).toBeUndefined();
      expect(await dbOperations.get(store, ext)).toEqual({ name: `saved.${ext}`, content: `bytes-${ext}` });
      expect(useFilesStore.getState().items[`/Mixed/saved.${ext}`].status).toBe("active");
    }
    expect(useFilesStore.getState().items["/Trash"].icon).toBe("/icons/trash-empty.png");
  });

  test("empty trash commits explicit metadata and content tombstones", async () => {
    await mixedFolder();
    await transitionVfsFiles({ kind: "trash", path: "/Mixed" });
    await transitionVfsFiles({ kind: "emptyTrash" });
    for (const [ext] of formats) {
      expect(await dbOperations.get(STORES.TRASH, ext)).toBeUndefined();
      expect(useFilesStore.getState().items[`/Mixed/saved.${ext}`]).toBeUndefined();
    }
    expect(useFilesStore.getState().items["/Mixed"]).toBeUndefined();
    expect((await readFileMutations(account)).flatMap(fileMutationOps).filter(op => op.k.startsWith("trash/item:") && op.del)).toHaveLength(4);
  });

  test("journal failure rolls back every row and byte in a folder transition", async () => {
    await mixedFolder();
    const before = structuredClone(useFilesStore.getState().items);
    const journal = await readFileMutations(account);
    const db = await ensureIndexedDBInitialized();
    const prototype = Object.getPrototypeOf(db.transaction(STORES.SYNC_FILE_MUTATIONS).objectStore(STORES.SYNC_FILE_MUTATIONS));
    db.close();
    const put = prototype.put;
    const mock = spyOn(prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: unknown[]) {
      if (this.name === STORES.SYNC_FILE_MUTATIONS) throw new DOMException("quota", "QuotaExceededError");
      return put.apply(this, args);
    });
    try {
      await expect(transitionVfsFiles({ kind: "trash", path: "/Mixed" })).rejects.toThrow();
      expect(useFilesStore.getState().items).toEqual(before);
      expect(await readFileMutations(account)).toEqual(journal);
      for (const [ext, store] of formats) {
        expect(await dbOperations.get(STORES.TRASH, ext)).toBeUndefined();
        expect(await dbOperations.get(store, ext)).toBeDefined();
      }
    } finally { mock.mockRestore(); }
  });

  test("a cross-store folder move keeps every UUID and queues destination bytes before source deletes", async () => {
    await mixedFolder();
    await addFolders("/Documents");
    await transitionVfsFiles({ kind: "move", path: "/Mixed", destination: "/Documents/Mixed" });
    expect(useFilesStore.getState().items["/Mixed"]).toBeUndefined();
    for (const [ext] of formats) {
      expect(useFilesStore.getState().items[`/Documents/Mixed/saved.${ext}`].uuid).toBe(ext);
      expect(await dbOperations.get(STORES.DOCUMENTS, ext)).toEqual({ name: `saved.${ext}`, content: `bytes-${ext}` });
    }
    const movedImage = (await readFileMutations(account)).find(m => m.op.k === "files/item:/Documents/Mixed/saved.png")!;
    expect(movedImage.content?.key).toBe("files/doc:png");
    expect(movedImage.additionalOps?.map(op => op.k)).toEqual(["files/item:/Mixed/saved.png", "images/item:png"]);
  });

  test("collision, invalid parent, and self-move leave the source intact", async () => {
    await mixedFolder();
    await addFolders("/Occupied");
    for (const destination of ["/Occupied", "/Missing/Mixed", "/Mixed/child", "/../escape"]) {
      await expect(transitionVfsFiles({ kind: "move", path: "/Mixed", destination })).rejects.toThrow();
      expect(useFilesStore.getState().items["/Mixed"].status).toBe("active");
    }
  });

  test("missing bytes fail a folder transition without partially trashing its siblings", async () => {
    await mixedFolder();
    await dbOperations.delete(STORES.IMAGES, "png");
    await expect(transitionVfsFiles({ kind: "trash", path: "/Mixed" })).rejects.toThrow("Content unavailable");
    for (const [ext] of formats) expect(useFilesStore.getState().items[`/Mixed/saved.${ext}`].status).toBe("active");
    expect(await dbOperations.get(STORES.TRASH, "md")).toBeUndefined();
  });

  test("restore recovers bytes left in their original store by old folder trash", async () => {
    await mixedFolder();
    useFilesStore.getState().removeItem("/Mixed");
    await settleAllPersistWrites();
    await transitionVfsFiles({ kind: "restore", path: "/Mixed" });
    for (const [ext, store] of formats) expect(await dbOperations.get(store, ext)).toBeDefined();
  });

  test("a pending save finishes before its file moves to trash", async () => {
    const saved = saveVfsFile(item(), "ordered");
    const trashed = transitionVfsFiles({ kind: "trash", path: "/saved.md" });
    await Promise.all([saved, trashed]);
    expect(await dbOperations.get(STORES.DOCUMENTS, "saved-content")).toBeUndefined();
    expect(await dbOperations.get(STORES.TRASH, "saved-content")).toEqual({ name: "saved.md", content: "ordered" });
  });

  test("a save queued after rename cannot recreate the old path", async () => {
    await saveVfsFile(item(), "first");
    const moved = transitionVfsFiles({ kind: "move", path: "/saved.md", destination: "/renamed.md" });
    const saved = saveVfsFile(item(), "stale editor");
    await moved;
    await expect(saved).rejects.toThrow("File moved or was trashed");
    expect(useFilesStore.getState().items["/saved.md"]).toBeUndefined();
    expect(await dbOperations.get(STORES.DOCUMENTS, "saved-content")).toEqual({ name: "saved.md", content: "first" });
  });

  test("trashing one alias preserves content referenced by an active file", async () => {
    await saveVfsFile(item(), "shared");
    useFilesStore.getState().addItem({ ...item(), path: "/alias.md" });
    await settleAllPersistWrites();
    await transitionVfsFiles({ kind: "trash", path: "/saved.md" });
    const mutation = (await readFileMutations(account)).at(-1)!;
    expect(mutation.content?.key).toBe("trash/item:saved-content");
    expect(fileMutationOps(mutation).some(op => op.k === "files/doc:saved-content" && op.del)).toBe(false);
    await transitionVfsFiles({ kind: "emptyTrash" });
    expect(await dbOperations.get(STORES.DOCUMENTS, "saved-content")).toEqual({ name: "saved.md", content: "shared" });
    expect(useFilesStore.getState().items["/alias.md"].status).toBe("active");
  });

  test("a child arriving from another tab during preparation aborts the folder move", async () => {
    await mixedFolder();
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const get = dbOperations.get.bind(dbOperations);
    let held = false;
    const mock = spyOn(dbOperations, "get").mockImplementation(async (store, key) => {
      const value = await get(store, key);
      if (!held && store === STORES.DOCUMENTS) { held = true; entered(); await gate; }
      return value;
    });
    const operation = transitionVfsFiles({ kind: "trash", path: "/Mixed" });
    try {
      await started;
      const foreign = { ...item(), path: "/Mixed/foreign.md", uuid: "foreign" };
      await dbOperations.put(STORES.VFS_ITEMS, { item: foreign }, foreign.path);
      release();
      await expect(operation).rejects.toThrow("Files changed in another tab");
      expect(await dbOperations.get(STORES.TRASH, "md")).toBeUndefined();
      expect(await dbOperations.get(STORES.VFS_ITEMS, foreign.path)).toEqual({ item: foreign });
      expect(useFilesStore.getState().items["/Mixed"].status).toBe("active");
    } finally { release(); await operation.catch(() => {}); mock.mockRestore(); }
  });

  test("failed trash upload retains source tombstones and dependent restore", async () => {
    await saveVfsFile(item(), "text");
    await transitionVfsFiles({ kind: "trash", path: "/saved.md" });
    await transitionVfsFiles({ kind: "restore", path: "/saved.md" });
    const posted: SyncOp[] = [];
    globalThis.fetch = (async (input, init) => {
      if (String(input).endsWith("/blobs")) return response({ error: "storage unavailable" }, 400);
      const { ops } = JSON.parse(String(init?.body));
      posted.push(...ops);
      return response({ ok: true, seq: 1, results: ops.map((op: SyncOp) => ({ k: op.k, accepted: true })) });
    }) as typeof fetch;
    const engine = await CloudSyncEngine.create(account);
    try {
      await expect(replay(engine)).rejects.toThrow("storage unavailable");
      expect(posted.some(op => op.del)).toBe(false);
      const remaining = await readFileMutations(account);
      expect(remaining).toHaveLength(2);
      expect(remaining.map(m => m.content?.storeName)).toEqual([STORES.TRASH, STORES.DOCUMENTS]);
      expect(await dbOperations.get(STORES.DOCUMENTS, "saved-content")).toBeDefined();
    } finally { await engine.stop(); }
  });

  test("large empty-trash replay keeps related operations within the server batch limit", async () => {
    withRemoteFileChanges(() => useFilesStore.setState({ items: Object.fromEntries(Array.from({ length: 150 }, (_, i) => {
      const path = `/deleted-${i}.md`;
      return [path, { ...item(), path, uuid: `deleted-${i}`, status: "trashed", originalPath: path }];
    })) }));
    await settleAllPersistWrites();
    await transitionVfsFiles({ kind: "emptyTrash" });
    const batches: SyncOp[][] = [];
    globalThis.fetch = (async (_input, init) => {
      const { ops } = JSON.parse(String(init?.body));
      batches.push(ops);
      return response({ ok: true, seq: 1, results: ops.map((op: SyncOp) => ({ k: op.k, accepted: true })) });
    }) as typeof fetch;
    const engine = await CloudSyncEngine.create(account);
    try {
      await replay(engine);
      expect(batches.map(ops => ops.length)).toEqual([399, 51]);
      expect(await readFileMutations(account)).toEqual([]);
    } finally { await engine.stop(); }
  });

  test("replay commits a trash destination with its source tombstone and survives restore replay", async () => {
    await saveVfsFile(item(), "text");
    await transitionVfsFiles({ kind: "trash", path: "/saved.md" });
    const posted: SyncOp[][] = [];
    globalThis.fetch = (async (input, init) => {
      if (!init?.body) return response({ authenticated: true, username: account, directories: [], files: [] });
      const body = JSON.parse(String(init.body));
      if (String(input).endsWith("/blobs")) return response({ ok: true, uploads: body.upload.map((entry: { sha256: string }) => ({ ...entry, exists: true, url: `https://storage.example/${entry.sha256}` })) });
      posted.push(body.ops);
      return response({ ok: true, seq: 1, results: body.ops.map((op: SyncOp) => ({ k: op.k, accepted: true })) });
    }) as typeof fetch;
    const engine = await CloudSyncEngine.create(account);
    try {
      await replay(engine);
      const batch = posted.find(ops => ops.some(op => op.k === "trash/item:saved-content"))!;
      expect(batch.map(op => op.k)).toEqual(["trash/item:saved-content", "files/item:/saved.md", "files/doc:saved-content"]);
      expect(batch.at(-1)?.del).toBe(true);
      expect(new Set(batch.map(op => op.t)).size).toBe(1);
      expect(await dbOperations.get(STORES.DOCUMENTS, "saved-content")).toBeUndefined();
      expect(await dbOperations.get(STORES.TRASH, "saved-content")).toBeDefined();
      await transitionVfsFiles({ kind: "restore", path: "/saved.md" });
      await replay(engine);
      expect(await dbOperations.get(STORES.TRASH, "saved-content")).toBeUndefined();
      expect(await dbOperations.get(STORES.DOCUMENTS, "saved-content")).toBeDefined();
      expect(await readFileMutations(account)).toEqual([]);
    } finally { await engine.stop(); }
  }, 20000);
});
