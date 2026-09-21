import "../../helpers/local-storage-stub";
import { beforeEach, afterEach, describe, expect, test, spyOn } from "bun:test";
import { resetFakeIndexedDB } from "../../helpers/reset-fake-indexeddb";
import { resetPersistWritesForTests, settleAllPersistWrites } from "../../../src/utils/persistWriteQueue";
import { ensureIndexedDBInitialized, STORES } from "../../../src/utils/indexedDB";
import { createSplitIndexedDBPersistStorage, type SplitAtomicEffects } from "../../../src/utils/splitIndexedDBPersistStorage";
import { acknowledgeFileMutations, createFileMutationEffects, readFileMutations, withRemoteFileChanges } from "../../../src/sync/fileMutationJournal";

interface Catalog { items: Record<string, { name: string }> }
const name = "test:file-journal";
function storage(account = "alice", effects?: SplitAtomicEffects<Catalog>) {
  return createSplitIndexedDBPersistStorage<Catalog>({
    stores: [STORES.VFS_ITEMS], layoutVersion: 1, delayMs: 60_000,
    mergeConcurrentRows: true,
    atomicEffects: effects ?? createFileMutationEffects(() => account),
    split: state => ({ metadata: { items: {} }, rows: {
      [STORES.VFS_ITEMS]: Object.entries(state.items).map(([key, item]) => ({ key, value: { item }, revision: item })),
    } }),
    merge: (_, rows) => ({ items: Object.fromEntries((rows[STORES.VFS_ITEMS] ?? []).map(row => [row.key, row.value.item])) }),
  });
}
async function save(adapter: ReturnType<typeof storage>, state: Catalog) {
  adapter.setItem(name, { state });
  await settleAllPersistWrites();
}
beforeEach(() => { resetPersistWritesForTests(); resetFakeIndexedDB(); });
afterEach(() => { resetPersistWritesForTests(); });

describe("durable file mutation journal", () => {
  test("catalog and immutable operation survive a new adapter", async () => {
    await save(storage(), { items: { "/Books/a": { name: "A" } } });
    const [mutation] = await readFileMutations("ALICE");
    expect(mutation.op).toMatchObject({ k: "files/item:/Books/a", v: { name: "A" } });
    expect((await storage().getItem(name))?.state.items["/Books/a"]).toEqual({ name: "A" });
    expect((await readFileMutations("alice"))[0]).toEqual(mutation);
  });

  test("journal failure aborts catalog and metadata in the same transaction", async () => {
    const effects = createFileMutationEffects<Catalog>(() => "alice");
    const adapter = storage("alice", { ...effects, capture: state => effects.capture(state).map(write => ({ ...write, value: () => {} })) });
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      adapter.setItem(name, { state: { items: { a: { name: "uncommitted" } } } });
      await expect(settleAllPersistWrites()).rejects.toBeDefined();
      expect(await readFileMutations("alice")).toEqual([]);
      expect(await storage().getItem(name)).toBeNull();
      const db = await ensureIndexedDBInitialized();
      const count = await new Promise<number>(resolve => {
        const req = db.transaction(STORES.VFS_ITEMS).objectStore(STORES.VFS_ITEMS).count();
        req.onsuccess = () => resolve(req.result);
      });
      db.close();
      expect(count).toBe(0);
    } finally { error.mockRestore(); }
  });

  test("a transient transaction failure retries without another user edit", async () => {
    const effects = createFileMutationEffects<Catalog>(() => "alice");
    const adapter = storage("alice", effects);
    const db = await ensureIndexedDBInitialized();
    const prototype = Object.getPrototypeOf(db.transaction(STORES.SYNC_FILE_MUTATIONS).objectStore(STORES.SYNC_FILE_MUTATIONS));
    db.close();
    const put = prototype.put;
    let fail = true;
    const mock = spyOn(prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: unknown[]) {
      if (this.name === STORES.SYNC_FILE_MUTATIONS && fail) {
        fail = false;
        throw new DOMException("temporary storage failure", "QuotaExceededError");
      }
      return put.apply(this, args);
    });
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      adapter.setItem(name, { state: { items: { a: { name: "retry" } } } });
      await expect(settleAllPersistWrites()).rejects.toThrow();
      await settleAllPersistWrites();
      expect(await readFileMutations("alice")).toHaveLength(1);
      expect((await storage().getItem(name))!.state.items.a.name).toBe("retry");
    } finally { mock.mockRestore(); error.mockRestore(); }
  });

  test("remote updates do not erase local intent during debounce", async () => {
    const adapter = storage();
    withRemoteFileChanges(() => adapter.setItem(name, { state: { items: { a: { name: "remote" } } } }));
    await settleAllPersistWrites();
    expect(await readFileMutations("alice")).toEqual([]);
    adapter.setItem(name, { state: { items: { a: { name: "local" } } } });
    withRemoteFileChanges(() => adapter.setItem(name, { state: { items: { a: { name: "remote-again" } } } }));
    await settleAllPersistWrites();
    expect((await readFileMutations("alice")).map(m => m.op.v)).toEqual([{ name: "local" }]);
  });

  test("two stale tabs preserve edits to different rows", async () => {
    const first = storage();
    await save(first, { items: { a: { name: "A" }, b: { name: "B" } } });
    await acknowledgeFileMutations((await readFileMutations("alice")).map(m => m.id));
    const second = storage();
    const baseline = (await second.getItem(name))!.state;
    await save(first, { items: { a: { name: "A edited" }, b: (await first.getItem(name))!.state.items.b } });
    await save(second, { items: { ...baseline.items, b: { name: "B edited" } } });
    expect((await storage().getItem(name))!.state.items).toEqual({ a: { name: "A edited" }, b: { name: "B edited" } });
    expect((await readFileMutations("alice")).map(m => m.op.v)).toEqual([{ name: "A edited" }, { name: "B edited" }]);
  });

  test("first write without hydration does not clear another tab's rows", async () => {
    await save(storage(), { items: { a: { name: "A" } } });
    await save(storage(), { items: { b: { name: "B" } } });
    expect(Object.keys((await storage().getItem(name))!.state.items).sort()).toEqual(["a", "b"]);
  });

  test("acknowledging an older operation preserves new edits and other accounts", async () => {
    const adapter = storage();
    await save(adapter, { items: { a: { name: "old" } } });
    const [old] = await readFileMutations("alice");
    await save(adapter, { items: {} });
    await save(storage("bob"), { items: { b: { name: "private" } } });
    await acknowledgeFileMutations([old.id]);
    expect((await readFileMutations("alice")).map(m => m.op)).toMatchObject([{ k: "files/item:a", del: true }]);
    expect(await readFileMutations("bob")).toHaveLength(1);
  });

  test("observed remote clock precedes the next captured edit", async () => {
    const adapter = storage();
    const future = `${String(Date.now() + 1000).padStart(14, "0")}-0001-remote`;
    withRemoteFileChanges(() => adapter.setItem(name, { state: { items: {} } }), future);
    await save(adapter, { items: { a: { name: "after" } } });
    expect((await readFileMutations("alice"))[0].op.t > future).toBe(true);
  });
});

// Use the real HTTP transport and IndexedDB journal. A controllable server
// response models response loss, restart, and a newer edit during POST.
import { CloudSyncEngine } from "../../../src/sync/engine";
import { useCloudSyncStore } from "../../../src/stores/useCloudSyncStore";
import { SYNC_CODECS } from "../../../src/sync/codecs";
import { nextHlc } from "../../../src/shared/sync2/hlc";
import type { SyncOp } from "../../../src/shared/sync2/types";
import { useFilesStore } from "../../../src/stores/useFilesStore";

async function replay(engine: CloudSyncEngine) {
  await (engine as unknown as { replayFileMutations(): Promise<void> }).replayFileMutations();
}
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("file journal engine replay", () => {
  beforeEach(() => {
    useCloudSyncStore.setState({ autoSyncEnabled: true, syncFiles: true, syncSettings: false, syncBooks: false, syncSongs: false,
      syncVideos: false, syncTv: false, syncStickies: false, syncCalendar: false, syncContacts: false, syncMaps: false, syncStuff: false });
  });

  test("failed POST leaves exact operations for a restarted engine", async () => {
    await save(storage(), { items: { a: { name: "offline edit" } } });
    const [original] = await readFileMutations("alice");
    const requests: SyncOp[][] = [];
    const fetch = globalThis.fetch;
    const first = await CloudSyncEngine.create("alice");
    globalThis.fetch = (async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)).ops);
      return respond({ error: "lost response" }, 400);
    }) as typeof fetch;
    try { await expect(replay(first)).rejects.toThrow("lost response"); }
    finally { await first.stop(); }
    expect(await readFileMutations("alice")).toEqual([original]);
    const second = await CloudSyncEngine.create("alice");
    globalThis.fetch = (async (_input, init) => {
      const ops = JSON.parse(String(init?.body)).ops as SyncOp[];
      requests.push(ops);
      return respond({ ok: true, seq: 1, results: ops.map(op => ({ k: op.k, accepted: false, winner: { ...op, seq: 1 } })) });
    }) as typeof fetch;
    try {
      await replay(second);
      expect(requests).toEqual([[original.op], [original.op]]);
      expect(await readFileMutations("alice")).toEqual([]);
    } finally { await second.stop(); globalThis.fetch = fetch; }
  });

  test("an edit captured during POST survives the old batch acknowledgement", async () => {
    const adapter = storage();
    await save(adapter, { items: { a: { name: "first" } } });
    const fetch = globalThis.fetch;
    const engine = await CloudSyncEngine.create("alice");
    globalThis.fetch = (async (_input, init) => {
      const ops = JSON.parse(String(init?.body)).ops as SyncOp[];
      await save(adapter, { items: { a: { name: "second" } } });
      return respond({ ok: true, seq: 1, results: ops.map(op => ({ k: op.k, accepted: true })) });
    }) as typeof fetch;
    try {
      await replay(engine);
      expect((await readFileMutations("alice")).map(m => m.op.v)).toEqual([{ name: "second" }]);
    } finally { await engine.stop(); globalThis.fetch = fetch; }
  });

  test("a rejected edit converges to the server winner before acknowledgement", async () => {
    await save(storage(), { items: { a: { name: "offline" } } });
    const [mutation] = await readFileMutations("alice");
    const winner = { v: { name: "newer remote" }, t: nextHlc(mutation.op.t, "remote"), seq: 2 };
    const fetch = globalThis.fetch;
    const ready = spyOn(SYNC_CODECS.files, "isReady").mockReturnValue(true);
    const engine = await CloudSyncEngine.create("alice");
    globalThis.fetch = (async () => respond({ ok: true, seq: 2, results: [{ k: mutation.op.k, accepted: false, winner }] })) as typeof fetch;
    try {
      await replay(engine);
      expect(useFilesStore.getState().items.a).toEqual(winner.v as never);
      expect(await readFileMutations("alice")).toEqual([]);
    } finally { await engine.stop(); ready.mockRestore(); globalThis.fetch = fetch; }
  });

  test("confirmed intent repairs a catalog overwritten by a stale tab", async () => {
    const adapter = storage();
    await save(adapter, { items: { a: { name: "newer intent" } } });
    withRemoteFileChanges(() => adapter.setItem(name, { state: { items: { a: { name: "stale disk row" } } } }));
    await settleAllPersistWrites();
    const fetch = globalThis.fetch;
    const engine = await CloudSyncEngine.create("alice");
    globalThis.fetch = (async (_input, init) => {
      const ops = JSON.parse(String(init?.body)).ops as SyncOp[];
      return respond({ ok: true, seq: 1, results: ops.map(op => ({ k: op.k, accepted: true })) });
    }) as typeof fetch;
    try {
      await replay(engine);
      expect(useFilesStore.getState().items.a.name).toBe("newer intent");
      expect(await readFileMutations("alice")).toEqual([]);
    } finally { await engine.stop(); globalThis.fetch = fetch; }
  });

  test("startup posts offline intent before downloading a snapshot", async () => {
    const account = `startup-${crypto.randomUUID()}`;
    await save(storage(account), { items: { a: { name: "offline" } } });
    const fetch = globalThis.fetch;
    const requests: string[] = [];
    const ready = spyOn(SYNC_CODECS.files, "isReady").mockReturnValue(true);
    const engine = await CloudSyncEngine.create(account);
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/ops")) {
        const ops = JSON.parse(String(init?.body)).ops as SyncOp[];
        return respond({ ok: true, seq: 1, results: ops.map(op => ({ k: op.k, accepted: true })) });
      }
      return respond({ ok: true, seq: 1, entries: {} });
    }) as typeof fetch;
    try {
      await engine.start();
      expect(requests[0]).toContain("/ops");
      expect(requests[1]).toContain("/snapshot");
      expect(engine.cursor).toBe(1);
      expect(await readFileMutations(account)).toEqual([]);
    } finally { await engine.stop(); ready.mockRestore(); globalThis.fetch = fetch; }
  });

  test("missing per-key acknowledgement retains the batch", async () => {
    await save(storage(), { items: { a: { name: "keep" } } });
    const fetch = globalThis.fetch;
    const engine = await CloudSyncEngine.create("alice");
    globalThis.fetch = (async () => respond({ ok: true, seq: 1, results: [] })) as typeof fetch;
    try {
      await expect(replay(engine)).rejects.toThrow("Unconfirmed file mutation");
      expect(await readFileMutations("alice")).toHaveLength(1);
    } finally { await engine.stop(); globalThis.fetch = fetch; }
  });
});
