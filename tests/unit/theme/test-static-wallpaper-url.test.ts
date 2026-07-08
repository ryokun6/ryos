import { describe, expect, test } from "bun:test";
import { resolveStaticWallpaperRenderUrl } from "../../../src/utils/staticWallpaperUrl";

describe("full-fidelity static wallpaper URLs", () => {
  test("keeps the canonical photo for full-fidelity cover rendering", () => {
    const source = "/wallpapers/photos/nature/zen_garden.jpg";
    expect(resolveStaticWallpaperRenderUrl(source)).toBe(source);
  });

  test("does not substitute a nominal variant for a smaller source", () => {
    const source = "/wallpapers/photos/aqua/0-aqua-blue.jpg";
    expect(resolveStaticWallpaperRenderUrl(source)).toBe(source);
  });

  test("preserves absolute URLs, query strings, and non-photo sources", () => {
    for (const source of [
      "https://example.com/wallpapers/photos/nature/aurora.jpg?v=7",
      "/wallpapers/tiles/azul_dark.png",
      "/wallpapers/videos/bliss.mp4",
      "blob:test",
      "indexeddb://wallpaper",
      "dynamic://weather",
    ]) {
      expect(resolveStaticWallpaperRenderUrl(source)).toBe(source);
    }
  });
});
