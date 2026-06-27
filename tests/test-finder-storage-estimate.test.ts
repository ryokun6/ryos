import { describe, test, expect } from "bun:test";
import { formatStorageSize, estimateStorageSpace, calculateStorageSpace } from "../src/stores/useFinderStore";

describe("storage helpers", () => {
  test("formatStorageSize uses MB under 1GB", () => {
    expect(formatStorageSize(0)).toBe("0 MB");
    expect(formatStorageSize(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatStorageSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
  test("formatStorageSize uses GB at/above 1GB", () => {
    expect(formatStorageSize(1024 * 1024 * 1024)).toBe("1 GB");
    expect(formatStorageSize(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });
  test("estimateStorageSpace uses navigator.storage.estimate when available", async () => {
    (globalThis as any).navigator = { storage: { estimate: async () => ({ usage: 250 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 }) } };
    const r = await estimateStorageSpace();
    expect(r.total).toBe(2 * 1024 * 1024 * 1024);
    expect(r.used).toBe(250 * 1024 * 1024);
    expect(r.available).toBe(r.total - r.used);
    expect(r.percentUsed).toBe(Math.round((r.used / r.total) * 100));
  });
  test("estimateStorageSpace falls back when API missing", async () => {
    (globalThis as any).navigator = {};
    (globalThis as any).localStorage = { length: 0, key: () => null, getItem: () => null };
    const r = await estimateStorageSpace();
    const fb = calculateStorageSpace();
    expect(r.total).toBe(fb.total);
  });
});
