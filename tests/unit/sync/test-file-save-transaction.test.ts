import "../../helpers/local-storage-stub";
import { beforeEach, afterEach, describe, expect, test, spyOn } from "bun:test";
import { resetFakeIndexedDB } from "../../helpers/reset-fake-indexeddb";
import { resetPersistWritesForTests, settleAllPersistWrites } from "../../../src/utils/persistWriteQueue";
import { dbOperations, ensureIndexedDBInitialized, STORES } from "../../../src/utils/indexedDB";
import { useFilesStore, type FileSystemItem } from "../../../src/stores/useFilesStore";
import { useChatsStore } from "../../../src/stores/useChatsStore";
import { readFileMutations, readFileMutationContent, withRemoteFileChanges } from "../../../src/sync/fileMutationJournal";
import { saveVfsFile } from "../../../src/services/vfs/FileSaveTransaction";
import { CloudSyncEngine } from "../../../src/sync/engine";
import { useCloudSyncStore } from "../../../src/stores/useCloudSyncStore";
import type { SyncOp } from "../../../src/shared/sync2/types";
import { sha256Json } from "../../../src/sync/blobs";
import { SYNC_CODECS } from "../../../src/sync/codecs";

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

describe("atomic VFS save", () => {
  test("a successful document save persists metadata, bytes and paired intent", async () => {
    const metadata = item();
    await saveVfsFile(metadata, "durable text");
    expect(await dbOperations.get(STORES.DOCUMENTS, metadata.uuid!)).toEqual({ name: metadata.name, content: "durable text" });
    expect(await dbOperations.get(STORES.VFS_ITEMS, metadata.path)).toEqual({ item: metadata });
    expect(useFilesStore.getState().items[metadata.path]).toEqual(metadata);
    const mutation = (await readFileMutations(account)).find(m => m.op.k === `files/item:${metadata.path}`)!;
    expect(mutation.op.v).toEqual(metadata);
    expect(mutation.content).toEqual({ storeName: STORES.DOCUMENTS, key: "files/doc:saved-content", snapshotId: mutation.id });
    expect(await readFileMutationContent(mutation)).toEqual({ name: metadata.name, content: "durable text" });
  });

  test("journal failure leaves the previous metadata and bytes intact", async () => {
    await saveVfsFile(item(), "original");
    await settleAllPersistWrites();
    const original = await readFileMutations(account);
    const db = await ensureIndexedDBInitialized();
    const prototype = Object.getPrototypeOf(db.transaction(STORES.SYNC_FILE_MUTATIONS).objectStore(STORES.SYNC_FILE_MUTATIONS));
    db.close();
    const put = prototype.put;
    const mock = spyOn(prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: unknown[]) {
      if (this.name === STORES.SYNC_FILE_MUTATIONS) throw new DOMException("quota", "QuotaExceededError");
      return put.apply(this, args);
    });
    try {
      await expect(saveVfsFile({ ...item(), modifiedAt: 2 }, "replacement")).rejects.toThrow();
      expect(await dbOperations.get(STORES.DOCUMENTS, "saved-content")).toEqual({ name: "saved.md", content: "original" });
      expect(useFilesStore.getState().items["/saved.md"].modifiedAt).toBe(1);
      expect(await readFileMutations(account)).toEqual(original);
    } finally { mock.mockRestore(); }
  });

  test("EPUB bytes use ArrayBuffer locally and survive restart in the journal", async () => {
    const blob = new Blob(["epub bytes"], { type: "application/epub+zip" });
    await saveVfsFile(item("epub"), blob);
    const [mutation] = await readFileMutations(account);
    expect((await readFileMutationContent(mutation)).content).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode((await readFileMutationContent(mutation)).content as ArrayBuffer)).toBe("epub bytes");
    expect(await dbOperations.get(STORES.BOOKS, "saved-content")).toEqual({ name: "saved.epub", content: await blob.arrayBuffer() });
  });

  test("a slower earlier EPUB save cannot overwrite a later save", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const slow = new Blob(["earlier"], { type: "application/epub+zip" });
    const bytes = slow.arrayBuffer.bind(slow);
    slow.arrayBuffer = async () => { await gate; return bytes(); };
    const first = saveVfsFile(item("epub"), slow);
    const second = saveVfsFile({ ...item("epub"), modifiedAt: 2 }, new Blob(["later"]));
    release();
    await Promise.all([first, second]);
    const stored = await dbOperations.get<{ content: ArrayBuffer }>(STORES.BOOKS, "saved-content");
    expect(new TextDecoder().decode(stored!.content)).toBe("later");
    expect(useFilesStore.getState().items["/saved.epub"].modifiedAt).toBe(2);
  });

  test("dbOperations.put rejects a transaction that aborts after request success", async () => {
    const db = await ensureIndexedDBInitialized();
    const prototype = Object.getPrototypeOf(db.transaction(STORES.DOCUMENTS).objectStore(STORES.DOCUMENTS));
    db.close();
    const put = prototype.put;
    const mock = spyOn(prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: unknown[]) {
      const request = put.apply(this, args) as IDBRequest;
      request.addEventListener("success", () => this.transaction.abort());
      return request;
    });
    try {
      await expect(dbOperations.put(STORES.DOCUMENTS, { content: "abort" }, "abort")).rejects.toThrow("aborted");
      expect(await dbOperations.get(STORES.DOCUMENTS, "abort")).toBeUndefined();
    } finally { mock.mockRestore(); }
  });

  test("unavailable parent rejects without publishing a file", async () => {
    await expect(saveVfsFile({ ...item(), path: "/Missing/saved.md" }, "text")).rejects.toThrow("Parent directory");
    expect(await readFileMutations(account)).toEqual([]);
    expect(await dbOperations.get(STORES.DOCUMENTS, "saved-content")).toBeUndefined();
    expect(useFilesStore.getState().items["/Missing/saved.md"]).toBeUndefined();
  });

  test("guest saves remain atomic without creating an account mutation", async () => {
    useChatsStore.setState({ username: null });
    await saveVfsFile(item(), "guest bytes");
    expect(await readFileMutations(account)).toEqual([]);
    expect(await dbOperations.get(STORES.DOCUMENTS, "saved-content")).toEqual({ name: "saved.md", content: "guest bytes" });
  });
});

describe("paired content replay", () => {
  test("document bytes and catalog are submitted together with a stable timestamp", async () => {
    await saveVfsFile(item(), "offline text");
    const [mutation] = await readFileMutations(account);
    const requests: SyncOp[][] = [];
    globalThis.fetch = (async (_input, init) => {
      const ops = JSON.parse(String(init?.body)).ops as SyncOp[];
      requests.push(ops);
      return response({ ok: true, seq: 2, results: ops.map(op => ({ k: op.k, accepted: true })) });
    }) as typeof fetch;
    const engine = await CloudSyncEngine.create(account);
    try {
      await replay(engine);
      expect(requests).toHaveLength(1);
      expect(requests[0].map(op => op.k)).toEqual(["files/doc:saved-content", "files/item:/saved.md"]);
      expect(requests[0].every(op => op.t === mutation.op.t)).toBe(true);
      expect(await readFileMutations(account)).toEqual([]);
    } finally { await engine.stop(); }
  });

  test("a document edited during POST retains its new bytes and durable intent", async () => {
    await saveVfsFile(item(), "first");
    globalThis.fetch = (async (_input, init) => {
      const ops = JSON.parse(String(init?.body)).ops as SyncOp[];
      await saveVfsFile({ ...item(), modifiedAt: 2 }, "second");
      return response({ ok: true, seq: 2, results: ops.map(op => ({ k: op.k, accepted: true })) });
    }) as typeof fetch;
    const engine = await CloudSyncEngine.create(account);
    try {
      await replay(engine);
      expect((await readFileMutationContent((await readFileMutations(account))[0])).content).toBe("second");
      expect((await dbOperations.get<{ content: string }>(STORES.DOCUMENTS, "saved-content"))?.content).toBe("second");
    } finally { await engine.stop(); }
  });

  test("an uploaded EPUB commits with its catalog and uses the codec's stable content hash", async () => {
    await saveVfsFile(item("epub"), new Blob(["epub bytes"], { type: "application/epub+zip" }));
    const calls: string[] = [];
    let posted: SyncOp[] = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      calls.push(url);
      const body = JSON.parse(String(init?.body));
      if (url.endsWith("/blobs")) return response({ ok: true, uploads: body.upload.map((entry: { sha256: string }) => ({ ...entry, exists: true, url: `https://storage.example/${entry.sha256}` })) });
      posted = body.ops;
      return response({ ok: true, seq: 2, results: posted.map(op => ({ k: op.k, accepted: true })) });
    }) as typeof fetch;
    const engine = await CloudSyncEngine.create(account);
    try {
      await replay(engine);
      expect(calls.map(url => url.split("/").pop())).toEqual(["blobs", "ops"]);
      expect(posted.map(op => op.k)).toEqual(["books/item:saved-content", "files/item:/saved.epub"]);
      const db = await ensureIndexedDBInitialized();
      try {
        const collected = await SYNC_CODECS.books.collect({ db }, new Set(["books/item:saved-content"]));
        const hash = await sha256Json(collected.get("books/item:saved-content"));
        expect(posted[0].v).toMatchObject({ blob: { sha256: hash } });
      } finally { db.close(); }
      expect(await readFileMutations(account)).toEqual([]);
    } finally { await engine.stop(); }
  });

  test("startup downloads the catalog without waiting for queued EPUB uploads", async () => {
    await saveVfsFile(item("epub"), new Blob(["offline EPUB"]));
    useFilesStore.getState().updateItemMetadata("/saved.epub", { modifiedAt: 2 });
    await settleAllPersistWrites();
    useCloudSyncStore.setState({ syncSettings: false, syncSongs: false, syncVideos: false,
      syncTv: false, syncStickies: false, syncCalendar: false, syncContacts: false,
      syncMaps: false, syncBooks: false, syncStuff: false });
    const requests: string[] = [];
    const ready = spyOn(SYNC_CODECS.files, "isReady").mockReturnValue(true);
    globalThis.fetch = (async input => {
      requests.push(String(input));
      return response({ ok: true, seq: 0, entries: {} });
    }) as typeof fetch;
    const engine = await CloudSyncEngine.create(account);
    try {
      await engine.start();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toContain("/snapshot");
      expect(engine.cursor).toBe(0);
      expect(await readFileMutations(account)).toHaveLength(2);
    } finally { await engine.stop(); ready.mockRestore(); }
  });

  test("failed binary upload cannot publish its catalog or remove the queued bytes", async () => {
    await saveVfsFile(item("epub"), new Blob(["epub bytes"]));
    const urls: string[] = [];
    globalThis.fetch = (async input => { urls.push(String(input)); return response({ error: "storage unavailable" }, 400); }) as typeof fetch;
    const engine = await CloudSyncEngine.create(account);
    try {
      await expect(replay(engine)).rejects.toThrow("storage unavailable");
      expect(urls.every(url => url.includes("/blobs"))).toBe(true);
      expect(await readFileMutations(account)).toHaveLength(1);
    } finally { await engine.stop(); }
  });
});

describe("independent file uploads", () => {
  for (const extension of ["epub", "png", "html"]) {
    test(`a failed ${extension} upload preserves dependent edits while other formats sync`, async () => {
      const failed = { ...item(extension), uuid: "failed" };
      await saveVfsFile(failed, new Blob(["failed bytes"]));
      // A later rename must not escape the failed upload through its new path.
      useFilesStore.getState().renameItem(failed.path, `/renamed.${extension}`, `renamed.${extension}`);
      useFilesStore.getState().updateItemMetadata(`/renamed.${extension}`, { modifiedAt: 3 });
      await settleAllPersistWrites();
      for (const ext of ["md", "epub", "png", "html"]) {
        await saveVfsFile({ ...item(ext), path: `/healthy.${ext}`, name: `healthy.${ext}`, uuid: `healthy-${ext}` }, "healthy bytes");
      }
      const initial = await readFileMutations(account);
      const posted: SyncOp[] = [];
      let unavailable = true;
      let attempts = 0;
      globalThis.fetch = (async (input, init) => {
        if (!init?.body) return response({ authenticated: true, username: account, directories: [], files: [] });
        const body = JSON.parse(String(init.body));
        if (String(input).endsWith("/blobs")) {
          attempts++;
          if (unavailable && attempts === 1) return response({ error: "storage unavailable" }, 400);
          return response({ ok: true, uploads: body.upload.map((entry: { sha256: string }) => ({ ...entry, exists: true, url: `https://storage.example/${entry.sha256}` })) });
        }
        posted.push(...body.ops);
        return response({ ok: true, seq: 1, results: body.ops.map((op: SyncOp) => ({ k: op.k, accepted: true })) });
      }) as typeof fetch;
      let engine = await CloudSyncEngine.create(account);
      try {
        await expect(replay(engine)).rejects.toThrow("storage unavailable");
        expect(posted.filter(op => op.k.startsWith("files/item:/healthy.")).map(op => op.k).sort()).toEqual(
          ["md", "epub", "png", "html"].map(ext => `files/item:/healthy.${ext}`).sort()
        );
        const remaining = await readFileMutations(account);
        expect(remaining).toEqual(initial.filter(m => m.op.k === `files/item:${failed.path}` || m.op.k === `files/item:/renamed.${extension}`));
        expect(posted.some(op => op.k.includes("renamed.") || op.k.includes("saved."))).toBe(false);
        expect((await readFileMutationContent(remaining[0])).content).toBeDefined();
        // Restart retries the exact durable timestamps, not newly minted writes.
        await engine.stop();
        unavailable = false;
        engine = await CloudSyncEngine.create(account);
        posted.length = 0;
        await replay(engine);
        expect(await readFileMutations(account)).toEqual([]);
        for (const mutation of remaining) {
          // Multiple metadata updates to one key coalesce to its latest value.
          const latest = remaining.filter(m => m.op.k === mutation.op.k).at(-1)!;
          expect(posted.some(op => op.k === latest.op.k && op.t === latest.op.t)).toBe(true);
        }
      } finally { await engine.stop(); }
    }, 20000);
  }

  test("missing document snapshot does not block an unrelated document", async () => {
    await saveVfsFile(item(), "lost snapshot");
    const [broken] = await readFileMutations(account);
    await dbOperations.delete(STORES.SYNC_FILE_CONTENTS, broken.id);
    await saveVfsFile({ ...item(), path: "/healthy.md", uuid: "healthy" }, "safe");
    const posted: SyncOp[] = [];
    globalThis.fetch = (async (_input, init) => {
      const { ops } = JSON.parse(String(init?.body));
      posted.push(...ops);
      return response({ ok: true, seq: 1, results: ops.map((op: SyncOp) => ({ k: op.k, accepted: true })) });
    }) as typeof fetch;
    const engine = await CloudSyncEngine.create(account);
    try {
      await expect(replay(engine)).rejects.toThrow("Missing file content snapshot");
      expect(posted.map(op => op.k)).toEqual(["files/doc:healthy", "files/item:/healthy.md"]);
      expect(await readFileMutations(account)).toEqual([broken]);
    } finally { await engine.stop(); }
  });

  test("settings finish in the same flush while a file stays queued and reports an error", async () => {
    await saveVfsFile(item("png"), new Blob(["image"]));
    useCloudSyncStore.setState({ syncSettings: true });
    const collected = spyOn(SYNC_CODECS.settings, "collect").mockResolvedValue(new Map([["settings/test/value", "changed"]]));
    const ready = SYNC_CODECS.settings.isReady ? spyOn(SYNC_CODECS.settings, "isReady").mockReturnValue(true) : undefined;
    const posted: SyncOp[] = [];
    globalThis.fetch = (async (input, init) => {
      if (String(input).endsWith("/blobs")) return response({ error: "storage unavailable" }, 400);
      const { ops } = JSON.parse(String(init?.body));
      posted.push(...ops);
      return response({ ok: true, seq: 1, results: ops.map((op: SyncOp) => ({ k: op.k, accepted: true })) });
    }) as typeof fetch;
    const engine = await CloudSyncEngine.create(account);
    try {
      engine.markDirty("settings");
      await expect(engine.flush({ throwOnError: true })).rejects.toThrow("storage unavailable");
      expect(posted).toContainEqual(expect.objectContaining({ k: "settings/test/value", v: "changed" }));
      expect(posted.some(op => op.k === "files/item:/saved.png")).toBe(false);
      expect(await readFileMutations(account)).toHaveLength(1);
    } finally { await engine.stop(); collected.mockRestore(); ready?.mockRestore(); }
  });
});
