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

const { createIndexedDBPersistStorage, settlePersistWrites } = await import(
  "../src/utils/indexedDBPersistStorage"
);
const {
  flushAllPersistWrites,
  resetPersistWritesForTests,
  haltPersistWrites,
  advancePersistEpoch,
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

  test("serializes consecutive in-flight snapshots in write order", async () => {
    const storage = createIndexedDBPersistStorage<{ a: number }>({
      delayMs: 60_000,
    });
    storage.setItem("ordered", { state: { a: 1 }, version: 1 });
    flushAllPersistWrites();
    storage.setItem("ordered", { state: { a: 2 }, version: 1 });

    await settlePersistWrites();

    const value = (await storage.getItem("ordered")) as {
      state: { a: number };
    };
    expect(value.state.a).toBe(2);
  });

  test("settling rejects when an IndexedDB commit fails", async () => {
    const storage = createIndexedDBPersistStorage<{
      callback: () => void;
    }>({ delayMs: 60_000 });
    storage.setItem("uncloneable", {
      state: { callback: () => undefined },
      version: 1,
    });
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      await expect(settlePersistWrites()).rejects.toBeInstanceOf(DOMException);
    } finally {
      console.error = originalConsoleError;
    }
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

  test("renames legacy IndexedDB persist keys without losing state", async () => {
    const legacyStorage = createIndexedDBPersistStorage<{ a: number }>({
      delayMs: 5,
    });
    legacyStorage.setItem("old-storage", {
      state: { a: 11 },
      version: 1,
    });
    await settlePersistWrites();

    const canonicalStorage = createIndexedDBPersistStorage<{ a: number }>({
      legacyNames: ["old-storage"],
    });
    expect(await canonicalStorage.getItem("ryos:new-storage")).toEqual({
      state: { a: 11 },
      version: 1,
    });

    const freshLegacy = createIndexedDBPersistStorage<{ a: number }>();
    expect(await freshLegacy.getItem("old-storage")).toBeNull();
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

  test("drops writes queued while asynchronous hydration is in flight", async () => {
    const seed = createIndexedDBPersistStorage<{ a: number }>({ delayMs: 5 });
    seed.setItem("hydrate-race", { state: { a: 9 }, version: 1 });
    await settlePersistWrites();

    const storage = createIndexedDBPersistStorage<{ a: number }>({
      delayMs: 5,
    });
    const hydration = storage.getItem("hydrate-race");
    storage.setItem("hydrate-race", { state: { a: 0 }, version: 1 });
    expect(await hydration).toEqual({ state: { a: 9 }, version: 1 });
    await settlePersistWrites();

    expect(
      await createIndexedDBPersistStorage<{ a: number }>().getItem(
        "hydrate-race"
      )
    ).toEqual({ state: { a: 9 }, version: 1 });
  });

  test("an epoch change invalidates adapters created in an older tab", async () => {
    const stale = createIndexedDBPersistStorage<{ a: number }>({ delayMs: 5 });
    stale.setItem("epoch", { state: { a: 1 }, version: 1 });
    advancePersistEpoch();
    await settlePersistWrites();

    expect(
      await createIndexedDBPersistStorage<{ a: number }>().getItem("epoch")
    ).toBeNull();
  });

  test("epoch invalidation does not delete a legacy value during hydration", async () => {
    backing.set(
      "legacy-race",
      JSON.stringify({ state: { a: 7 }, version: 1 })
    );
    const stale = createIndexedDBPersistStorage<{ a: number }>();
    const hydration = stale.getItem("legacy-race");
    advancePersistEpoch();
    expect(await hydration).toEqual({ state: { a: 7 }, version: 1 });
    expect(backing.has("legacy-race")).toBe(true);
  });
});
