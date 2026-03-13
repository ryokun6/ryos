import { describe, expect, test } from "bun:test";
import {
  extractStoredWallpaperId,
  isStoredWallpaperReference,
  normalizeStoredWallpaperReference,
  OPFS_WALLPAPER_PREFIX,
  toStoredWallpaperReference,
} from "../src/utils/wallpaperStorage";

describe("wallpaper storage references", () => {
  test("detects both OPFS and legacy IndexedDB references", () => {
    expect(isStoredWallpaperReference("opfs://wallpaper-1")).toBe(true);
    expect(isStoredWallpaperReference("indexeddb://wallpaper-1")).toBe(true);
    expect(isStoredWallpaperReference("/wallpapers/photos/aqua/water.jpg")).toBe(
      false
    );
  });

  test("extracts ids from stored wallpaper references", () => {
    expect(extractStoredWallpaperId("opfs://wallpaper-1")).toBe("wallpaper-1");
    expect(extractStoredWallpaperId("indexeddb://wallpaper-1")).toBe(
      "wallpaper-1"
    );
    expect(extractStoredWallpaperId("/wallpapers/photos/aqua/water.jpg")).toBe(
      null
    );
  });

  test("normalizes legacy references to the OPFS prefix", () => {
    expect(normalizeStoredWallpaperReference("indexeddb://wallpaper-1")).toBe(
      "opfs://wallpaper-1"
    );
    expect(normalizeStoredWallpaperReference("opfs://wallpaper-1")).toBe(
      "opfs://wallpaper-1"
    );
    expect(
      normalizeStoredWallpaperReference("/wallpapers/photos/aqua/water.jpg")
    ).toBe("/wallpapers/photos/aqua/water.jpg");
  });

  test("creates canonical OPFS wallpaper references", () => {
    expect(toStoredWallpaperReference("wallpaper-1")).toBe(
      `${OPFS_WALLPAPER_PREFIX}wallpaper-1`
    );
  });
});
