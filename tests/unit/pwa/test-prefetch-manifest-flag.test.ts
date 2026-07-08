import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  clearPrefetchFlag,
  hasStoredPrefetchManifestTimestamp,
  hasWarmedThemeAssets,
  markThemeAssetsWarmed,
} from "../../../src/utils/prefetch";

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
    writable: true,
  });
  clearPrefetchFlag();
});

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage,
    writable: true,
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
    markThemeAssetsWarmed("xp", "current");

    clearPrefetchFlag();

    expect(hasStoredPrefetchManifestTimestamp()).toBe(false);
    expect(hasWarmedThemeAssets("xp", "current")).toBe(false);
  });

  test("tracks warmed themes per manifest version", () => {
    expect(hasWarmedThemeAssets("macosx", "build-a")).toBe(false);

    markThemeAssetsWarmed("macosx", "build-a");

    expect(hasWarmedThemeAssets("macosx", "build-a")).toBe(true);
    expect(hasWarmedThemeAssets("xp", "build-a")).toBe(false);
    expect(hasWarmedThemeAssets("macosx", "build-b")).toBe(false);
  });
});
