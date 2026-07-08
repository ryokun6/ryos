/**
 * Tests for the write-behind localStorage persist adapter.
 *
 * Large persisted slices (Files VFS, chat history, iPod library) used to be
 * JSON.stringify'd and written synchronously on every mutation. The adapter
 * defers serialization to a debounce window while keeping read-your-writes
 * semantics and explicit flush/halt hooks for backup/restore/reset flows.
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  jest,
} from "bun:test";

// Minimal localStorage polyfill for the bun test environment.
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
  createDebouncedPersistStorage,
  flushDebouncedPersistWrites,
  resetDebouncedPersistWritesForTests,
} = await import("../../../src/utils/debouncedPersistStorage");

// Fake timers make the debounce window deterministic: we advance time by an
// exact amount instead of sleeping past it and hoping the real timer fired.
beforeEach(() => {
  jest.useFakeTimers();
  backing.clear();
});

afterEach(() => {
  jest.useRealTimers();
  resetDebouncedPersistWritesForTests();
});

afterAll(() => {
  resetDebouncedPersistWritesForTests();
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

describe("createDebouncedPersistStorage", () => {
  test("setItem defers the localStorage write until the debounce window", () => {
    const storage = createDebouncedPersistStorage<{ a: number }>({ delayMs: 30 });
    storage.setItem("k", { state: { a: 1 }, version: 1 });

    // Just before the window closes nothing is written yet...
    jest.advanceTimersByTime(29);
    expect(backing.has("k")).toBe(false);
    // ...and exactly at the window the snapshot is serialized.
    jest.advanceTimersByTime(1);
    expect(JSON.parse(backing.get("k")!)).toEqual({ state: { a: 1 }, version: 1 });
  });

  test("only the latest snapshot in a burst is serialized", () => {
    const storage = createDebouncedPersistStorage<{ a: number }>({ delayMs: 30 });
    storage.setItem("k", { state: { a: 1 }, version: 1 });
    storage.setItem("k", { state: { a: 2 }, version: 1 });
    storage.setItem("k", { state: { a: 3 }, version: 1 });

    jest.advanceTimersByTime(30);
    expect(JSON.parse(backing.get("k")!).state.a).toBe(3);
  });

  test("getItem serves the pending snapshot before it is written (read-your-writes)", () => {
    const storage = createDebouncedPersistStorage<{ a: number }>({ delayMs: 1000 });
    storage.setItem("k", { state: { a: 7 }, version: 2 });

    const value = storage.getItem("k");
    expect(value && typeof value === "object" && "state" in value).toBe(true);
    expect((value as { state: { a: number } }).state.a).toBe(7);
  });

  test("getItem falls back to localStorage and parses stored JSON", () => {
    backing.set("k", JSON.stringify({ state: { a: 9 }, version: 3 }));
    const storage = createDebouncedPersistStorage<{ a: number }>({ delayMs: 1000 });
    expect((storage.getItem("k") as { state: { a: number } }).state.a).toBe(9);
  });

  test("flushDebouncedPersistWrites drains pending snapshots immediately", () => {
    const storage = createDebouncedPersistStorage<{ a: number }>({ delayMs: 60_000 });
    storage.setItem("k", { state: { a: 5 }, version: 1 });
    expect(backing.has("k")).toBe(false);

    flushDebouncedPersistWrites();
    expect(JSON.parse(backing.get("k")!).state.a).toBe(5);

    // Flush is one-shot: queue is drained.
    backing.clear();
    flushDebouncedPersistWrites();
    expect(backing.has("k")).toBe(false);
  });

  test("removeItem cancels a pending write and clears storage", () => {
    const storage = createDebouncedPersistStorage<{ a: number }>({ delayMs: 20 });
    backing.set("k", "old");
    storage.setItem("k", { state: { a: 1 }, version: 1 });
    storage.removeItem("k");

    jest.advanceTimersByTime(50);
    expect(backing.has("k")).toBe(false);
  });
});

// NOTE: haltDebouncedPersistWrites is module-global and irreversible by
// design (restore/reset flows reload the page right after), so it runs last.
describe("haltDebouncedPersistWrites", () => {
  test("halts pending and future writes until reload", async () => {
    const { haltDebouncedPersistWrites } = await import(
      "../../../src/utils/debouncedPersistStorage"
    );
    const storage = createDebouncedPersistStorage<{ a: number }>({ delayMs: 20 });
    storage.setItem("k", { state: { a: 1 }, version: 1 });

    haltDebouncedPersistWrites();
    jest.advanceTimersByTime(50);
    expect(backing.has("k")).toBe(false);

    storage.setItem("k", { state: { a: 2 }, version: 1 });
    flushDebouncedPersistWrites();
    jest.advanceTimersByTime(50);
    expect(backing.has("k")).toBe(false);
  });
});
