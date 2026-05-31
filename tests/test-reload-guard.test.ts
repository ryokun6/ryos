import { afterEach, beforeEach, describe, expect, test } from "bun:test";

/**
 * Tests for the centralized reload-loop guard (src/utils/reloadGuard.ts).
 *
 * This logic was previously duplicated across main.tsx, prefetch.ts, and the
 * index.html bootstrap. The shared helpers must implement the same windowed
 * loop limit and stale-reload cooldown so the callers stay in sync.
 */

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
}

const ORIGINAL = (globalThis as { sessionStorage?: Storage }).sessionStorage;

beforeEach(() => {
  (globalThis as { sessionStorage?: Storage }).sessionStorage =
    new MemoryStorage() as unknown as Storage;
});

afterEach(() => {
  (globalThis as { sessionStorage?: Storage }).sessionStorage = ORIGINAL;
});

// Imported after the storage shim is installable; functions read sessionStorage
// lazily at call time, so a static import is fine.
import {
  isInReloadLoop,
  trackReload,
  isStaleReloadOnCooldown,
  markStaleReload,
  clearStaleReload,
  MAX_RELOADS_PER_WINDOW,
} from "../src/utils/reloadGuard";

describe("reloadGuard loop detection", () => {
  test("not in a loop initially", () => {
    expect(isInReloadLoop()).toBe(false);
  });

  test("trips after MAX reloads within the window", () => {
    for (let i = 0; i < MAX_RELOADS_PER_WINDOW; i++) {
      expect(isInReloadLoop()).toBe(false);
      trackReload();
    }
    expect(isInReloadLoop()).toBe(true);
  });

  test("does not trip below the limit", () => {
    trackReload();
    trackReload();
    expect(isInReloadLoop()).toBe(false);
  });
});

describe("reloadGuard stale-reload cooldown", () => {
  test("no cooldown before any stale reload", () => {
    expect(isStaleReloadOnCooldown()).toBe(false);
  });

  test("cooldown active right after marking", () => {
    markStaleReload();
    expect(isStaleReloadOnCooldown()).toBe(true);
  });

  test("cooldown cleared explicitly", () => {
    markStaleReload();
    clearStaleReload();
    expect(isStaleReloadOnCooldown()).toBe(false);
  });
});
