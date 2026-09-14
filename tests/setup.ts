import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "bun:test";
import {
  flushDebouncedPersistWrites,
  resetDebouncedPersistWritesForTests,
} from "../src/utils/debouncedPersistStorage";
import { resetPersistWritesForTests } from "../src/utils/persistWriteQueue";
import { resetFakeIndexedDB } from "./helpers/reset-fake-indexeddb";

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

function resetSharedPersistAndIndexedDB(): void {
  // Abandon stuck IndexedDB persist writes *before* swapping the factory.
  // `settleAllPersistWrites()` can hang for the full test timeout when an
  // earlier suite left `inFlight` chained to happy-dom's broken indexedDB
  // (open / deleteDatabase never fire after GlobalRegistrator.unregister).
  resetPersistWritesForTests();
  resetFakeIndexedDB();
}

beforeEach(() => {
  ensureTestLocalStorage();
  flushDebouncedPersistWrites();
  resetDebouncedPersistWritesForTests();
  resetSharedPersistAndIndexedDB();
  ensureTestLocalStorage().clear();
});

afterEach(() => {
  ensureTestLocalStorage();
  flushDebouncedPersistWrites();
  resetDebouncedPersistWritesForTests();
  resetSharedPersistAndIndexedDB();
  ensureTestLocalStorage().clear();
});
