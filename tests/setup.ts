import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "bun:test";
import {
  flushDebouncedPersistWrites,
  resetDebouncedPersistWritesForTests,
} from "../src/utils/debouncedPersistStorage";

// fake-indexeddb schedules requests with setImmediate. On Bun 1.4 that waits
// out the poll phase whenever any timer is pending, so each IndexedDB open
// stalls until the next timer (often ~1s, longer when backoff timers stack).
// setTimeout(0) stays on the timers phase. Browsers have no setImmediate, so
// this matches the fallback fake-indexeddb already uses there.
//
// Suites that install fake timers replace setTimeout and expect setImmediate
// to keep firing. Fall back to the native check-phase callback in that case.
if (typeof globalThis.setImmediate === "function" && typeof globalThis.clearImmediate === "function") {
  const nativeSetImmediate = globalThis.setImmediate.bind(globalThis);
  const nativeClearImmediate = globalThis.clearImmediate.bind(globalThis);
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const timersAreMocked = () => globalThis.setTimeout !== nativeSetTimeout;

  globalThis.setImmediate = ((callback: (...args: unknown[]) => void, ...args: unknown[]) => {
    if (timersAreMocked()) return nativeSetImmediate(callback, ...args);
    return nativeSetTimeout(callback, 0, ...args) as unknown as NodeJS.Immediate;
  }) as typeof setImmediate;
  globalThis.clearImmediate = ((handle: NodeJS.Immediate) => {
    if (timersAreMocked()) {
      nativeClearImmediate(handle);
      return;
    }
    nativeClearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
  }) as typeof clearImmediate;
}

/**
 * Global test setup — preloaded before every bun test run.
 */

export const BASE_URL = process.env.API_URL || "http://localhost:3000";

export class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const sharedTestLocalStorage = new MemoryStorage();

function isUsableStorage(storage: unknown): storage is Storage {
  return (
    typeof storage === "object" &&
    storage !== null &&
    typeof (storage as Storage).clear === "function" &&
    typeof (storage as Storage).getItem === "function" &&
    typeof (storage as Storage).setItem === "function" &&
    typeof (storage as Storage).removeItem === "function"
  );
}

export function installTestLocalStorage(
  storage: Storage = sharedTestLocalStorage
): Storage {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    enumerable: true,
    value: storage,
    writable: true,
  });
  return storage;
}

export function ensureTestLocalStorage(): Storage {
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  if (
    isUsableStorage(storage) &&
    descriptor &&
    "value" in descriptor &&
    descriptor.configurable &&
    descriptor.writable
  ) {
    return storage;
  }
  return installTestLocalStorage(isUsableStorage(storage) ? storage : undefined);
}

installTestLocalStorage();

beforeEach(() => {
  ensureTestLocalStorage();
  flushDebouncedPersistWrites();
  resetDebouncedPersistWritesForTests();
  ensureTestLocalStorage().clear();
});

afterEach(() => {
  ensureTestLocalStorage();
  flushDebouncedPersistWrites();
  resetDebouncedPersistWritesForTests();
  ensureTestLocalStorage().clear();
});
