import { describe, expect, test } from "bun:test";
import {
  pickWallpaperRenderWidth,
  resolveStaticWallpaperRenderUrl,
} from "../src/utils/staticWallpaperUrl";

describe("responsive static wallpaper URLs", () => {
  test("chooses a viewport and DPR appropriate width", () => {
    expect(pickWallpaperRenderWidth(390, 3)).toBe(1280);
    expect(pickWallpaperRenderWidth(1280, 1)).toBe(1280);
    expect(pickWallpaperRenderWidth(1440, 1)).toBe(1920);
    expect(pickWallpaperRenderWidth(1366, 2)).toBe(2560);
    expect(pickWallpaperRenderWidth(1920, 2)).toBeNull();
  });

  test("maps built-in photos to deterministic WebP variants", () => {
    expect(
      resolveStaticWallpaperRenderUrl(
        "/wallpapers/photos/nature/aurora.jpg",
        1440,
        1
      )
    ).toBe("/wallpapers/variants/1920w/photos/nature/aurora.webp");
    expect(
      resolveStaticWallpaperRenderUrl(
        "https://example.com/wallpapers/photos/nature/aurora.jpg",
        800,
        1
      )
    ).toBe(
      "https://example.com/wallpapers/variants/1280w/photos/nature/aurora.webp"
    );
  });

  test("preserves non-photo and ultra-wide sources", () => {
    for (const source of [
      "/wallpapers/tiles/azul_dark.png",
      "/wallpapers/videos/bliss.mp4",
      "blob:test",
      "indexeddb://wallpaper",
      "dynamic://weather",
    ]) {
      expect(resolveStaticWallpaperRenderUrl(source, 1440, 2)).toBe(source);
    }
    expect(
      resolveStaticWallpaperRenderUrl(
        "/wallpapers/photos/nature/aurora.jpg",
        1920,
        2
      )
    ).toBe("/wallpapers/photos/nature/aurora.jpg");
  });
});
