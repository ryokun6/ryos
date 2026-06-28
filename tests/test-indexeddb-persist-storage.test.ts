/**
 * Tests for the write-behind IndexedDB persist adapter.
 *
 * Large persisted slices (e.g. Soundboard recordings, which inline base64
 * audio) exceed localStorage's per-origin quota. This adapter persists them to
 * IndexedDB instead, with debounced write-behind, read-your-writes, transparent
 * migration from the slice's legacy localStorage key, and shared flush/halt
 * hooks for backup/restore/reset.
 */

import "fake-indexeddb/auto";
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  afterAll,
} from "bun:test";

// Minimal localStorage polyfill for the bun test environment (used by the
// migration path). Mirrors tests/test-debounced-persist-storage.test.ts.
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage"
);
const backing = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, String(value));
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: (i: number) => Array.from(backing.keys())[i] ?? null,
    get length() {
      return backing.size;
    },
  },
  writable: true,
});

const {
  clearIndexedDBPersistedState,
  createIndexedDBPersistStorage,
  settlePersistWrites,
} = await import("../src/utils/indexedDBPersistStorage");
const {
  flushAllPersistWrites,
  resetPersistWritesForTests,
  haltPersistWrites,
} = await import("../src/utils/persistWriteQueue");

const resetDb = () =>
  new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("ryOS");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

beforeEach(async () => {
  backing.clear();
  await resetDb();
});

afterEach(() => {
  resetPersistWritesForTests();
});

afterAll(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

describe("createIndexedDBPersistStorage", () => {
  test("persists a snapshot to IndexedDB and reads it back", async () => {
    const storage = createIndexedDBPersistStorage<{ a: number }>({
      delayMs: 5,
    });
    storage.setItem("k", { state: { a: 1 }, version: 1 });

    // Flush + await the async IndexedDB commit.
    await settlePersistWrites();

    const value = await storage.getItem("k");
    expect(value).toEqual({ state: { a: 1 }, version: 1 });
  });

  test("getItem serves the pending snapshot before it is committed", async () => {
    const storage = createIndexedDBPersistStorage<{ a: number }>({
      delayMs: 60_000,
    });
    storage.setItem("k", { state: { a: 7 }, version: 2 });

    // Nothing flushed yet, but read-your-writes returns the queued snapshot.
    const value = await storage.getItem("k");
    expect(value).toEqual({ state: { a: 7 }, version: 2 });
  });

  test("getItem serves a flushed snapshot while the commit is in flight", async () => {
    const storage = createIndexedDBPersistStorage<{ a: number }>({
      delayMs: 60_000,
    });
    storage.setItem("k", { state: { a: 8 }, version: 2 });

    flushAllPersistWrites();

    const value = await storage.getItem("k");
    expect(value).toEqual({ state: { a: 8 }, version: 2 });
    await settlePersistWrites();
  });

  test("only the latest snapshot in a burst is persisted", async () => {
    const storage = createIndexedDBPersistStorage<{ a: number }>({
      delayMs: 5,
    });
    storage.setItem("k", { state: { a: 1 }, version: 1 });
    storage.setItem("k", { state: { a: 2 }, version: 1 });
    storage.setItem("k", { state: { a: 3 }, version: 1 });

    await settlePersistWrites();

    const value = (await storage.getItem("k")) as {
      state: { a: number };
    };
    expect(value.state.a).toBe(3);
  });

  test("migrates a legacy localStorage value into IndexedDB on first read", async () => {
    backing.set("legacy", JSON.stringify({ state: { a: 9 }, version: 3 }));
    const storage = createIndexedDBPersistStorage<{ a: number }>();

    const value = await storage.getItem("legacy");
    expect(value).toEqual({ state: { a: 9 }, version: 3 });

    // Legacy localStorage key is dropped to free quota...
    expect(backing.has("legacy")).toBe(false);

    // ...and the value now lives in IndexedDB (a fresh adapter reads it).
    const fresh = createIndexedDBPersistStorage<{ a: number }>();
    expect(await fresh.getItem("legacy")).toEqual({
      state: { a: 9 },
      version: 3,
    });
  });

  test("returns null when neither IndexedDB nor localStorage has the key", async () => {
    const storage = createIndexedDBPersistStorage<{ a: number }>();
    expect(await storage.getItem("missing")).toBeNull();
  });

  test("removeItem clears the IndexedDB record and legacy localStorage", async () => {
    backing.set("r", JSON.stringify({ state: { a: 1 }, version: 1 }));
    const storage = createIndexedDBPersistStorage<{ a: number }>({
      delayMs: 5,
    });
    // Migrate it into IndexedDB.
    await storage.getItem("r");
    storage.setItem("r", { state: { a: 2 }, version: 1 });
    await settlePersistWrites();

    await storage.removeItem("r");

    expect(await storage.getItem("r")).toBeNull();
    expect(backing.has("r")).toBe(false);
  });

  test("clearIndexedDBPersistedState clears all persisted slice records", async () => {
    const storage = createIndexedDBPersistStorage<{ a: number }>({
      delayMs: 5,
    });
    storage.setItem("slice-a", { state: { a: 1 }, version: 1 });
    await settlePersistWrites();
    storage.setItem("slice-b", { state: { a: 2 }, version: 1 });
    await settlePersistWrites();

    await clearIndexedDBPersistedState();

    const fresh = createIndexedDBPersistStorage<{ a: number }>();
    expect(await fresh.getItem("slice-a")).toBeNull();
    expect(await fresh.getItem("slice-b")).toBeNull();
  });

  test("halted writes are not committed to IndexedDB", async () => {
    const storage = createIndexedDBPersistStorage<{ a: number }>({
      delayMs: 5,
    });
    storage.setItem("h", { state: { a: 1 }, version: 1 });

    haltPersistWrites();
    await settlePersistWrites();

    // A fresh adapter (no in-memory read-your-writes snapshot) sees nothing
    // durable: the queued write was dropped by the halt.
    const fresh = createIndexedDBPersistStorage<{ a: number }>();
    expect(await fresh.getItem("h")).toBeNull();
  });
});
