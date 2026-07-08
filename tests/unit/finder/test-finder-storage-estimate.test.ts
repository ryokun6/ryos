import { afterEach, describe, test, expect, spyOn } from "bun:test";
import { formatStorageSize, estimateStorageSpace, calculateStorageSpace } from "../../../src/stores/useFinderStore";

const originalNavigator = globalThis.navigator;
const originalLocalStorage = globalThis.localStorage;

function setGlobalProperty(
  property: "navigator" | "localStorage",
  value: unknown
): void {
  Object.defineProperty(globalThis, property, {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  setGlobalProperty("navigator", originalNavigator);
  setGlobalProperty("localStorage", originalLocalStorage);
});

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
    setGlobalProperty("navigator", {
      storage: {
        estimate: async () => ({
          usage: 250 * 1024 * 1024,
          quota: 2 * 1024 * 1024 * 1024,
        }),
      },
    });
    const r = await estimateStorageSpace();
    expect(r.total).toBe(2 * 1024 * 1024 * 1024);
    expect(r.used).toBe(250 * 1024 * 1024);
    expect(r.available).toBe(r.total - r.used);
    expect(r.percentUsed).toBe(Math.round((r.used / r.total) * 100));
  });
  test("estimateStorageSpace falls back when API missing", async () => {
    setGlobalProperty("navigator", {});
    setGlobalProperty("localStorage", {
      length: 0,
      key: () => null,
      getItem: () => null,
    });
    const r = await estimateStorageSpace();
    const fb = calculateStorageSpace();
    expect(r.total).toBe(fb.total);
  });

  test("estimateStorageSpace falls back when estimate() rejects", async () => {
    // Mirrors the observed cloud-VM behavior where Chrome throws
    // "Internal error when calculating storage usage".
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    setGlobalProperty("navigator", {
      storage: {
        estimate: async () => {
          throw new TypeError("Internal error when calculating storage usage");
        },
      },
    });
    setGlobalProperty("localStorage", {
      length: 0,
      key: () => null,
      getItem: () => null,
    });
    try {
      const r = await estimateStorageSpace();
      const fb = calculateStorageSpace();
      expect(r.total).toBe(fb.total);
      expect(r.available).toBe(fb.total - fb.used);
      expect(consoleError).toHaveBeenCalledWith(
        "[FinderStore] Error estimating storage space",
        expect.any(TypeError)
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
