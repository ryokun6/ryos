import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  clearPrefetchFlag,
  hasStoredPrefetchManifestTimestamp,
} from "../src/utils/prefetch";

class MemoryStorage {
  private map = new Map<string, string>();

  getItem(key: string) {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }

  removeItem(key: string) {
    this.map.delete(key);
  }
}

const originalLocalStorage = globalThis.localStorage;

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage,
  });
});

describe("prefetch manifest warmup flag", () => {
  test("detects the current prefetch manifest timestamp", () => {
    expect(hasStoredPrefetchManifestTimestamp()).toBe(false);

    localStorage.setItem("ryos:manifest-timestamp", "2026-06-02T00:00:00Z");

    expect(hasStoredPrefetchManifestTimestamp()).toBe(true);
  });

  test("clearPrefetchFlag clears the current key", () => {
    localStorage.setItem("ryos:manifest-timestamp", "current");

    clearPrefetchFlag();

    expect(hasStoredPrefetchManifestTimestamp()).toBe(false);
  });
});
