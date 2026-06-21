import { describe, expect, test } from "bun:test";
import {
  placeholderKeyFromSource,
  getWallpaperPlaceholder,
  type WallpaperPlaceholder,
} from "../src/utils/wallpapers";
import manifestJson from "../public/wallpapers/manifest.json";
import placeholdersJson from "../public/wallpapers/placeholders.json";

const MAP: Record<string, WallpaperPlaceholder> = {
  "photos/nature/aurora.jpg": {
    color: "#624568",
    blur: "data:image/jpeg;base64,abc",
  },
  "tiles/azul_dark.png": { color: "#2f457c" },
};

describe("generated placeholders.json", () => {
  const manifest = manifestJson as {
    tiles: string[];
    photos: Record<string, string[]>;
  };
  const data = placeholdersJson as {
    placeholders: Record<string, WallpaperPlaceholder>;
  };
  const placeholders = data.placeholders;
  const photoPaths = Object.values(manifest.photos).flat();

  test("every photo has a color + blur data URI", () => {
    for (const rel of photoPaths) {
      const ph = placeholders[rel];
      expect(ph, `missing placeholder for ${rel}`).toBeDefined();
      expect(ph.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(ph.blur).toStartWith("data:image/jpeg;base64,");
    }
  });

  test("every tile has a color (no blur)", () => {
    for (const rel of manifest.tiles) {
      const ph = placeholders[rel];
      expect(ph, `missing placeholder for ${rel}`).toBeDefined();
      expect(ph.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(ph.blur).toBeUndefined();
    }
  });
});

describe("placeholderKeyFromSource", () => {
  test("strips a leading /wallpapers/ prefix", () => {
    expect(placeholderKeyFromSource("/wallpapers/photos/nature/aurora.jpg")).toBe(
      "photos/nature/aurora.jpg"
    );
  });

  test("works for absolute URLs", () => {
    expect(
      placeholderKeyFromSource(
        "https://os.ryo.lu/wallpapers/tiles/azul_dark.png"
      )
    ).toBe("tiles/azul_dark.png");
  });

  test("ignores query strings and hashes", () => {
    expect(
      placeholderKeyFromSource("/wallpapers/photos/nature/aurora.jpg?v=2#x")
    ).toBe("photos/nature/aurora.jpg");
  });

  test("returns null for blob/data/dynamic sources", () => {
    expect(placeholderKeyFromSource("blob:abc-123")).toBeNull();
    expect(placeholderKeyFromSource("dynamic://weather")).toBeNull();
    expect(placeholderKeyFromSource("")).toBeNull();
  });
});

describe("getWallpaperPlaceholder", () => {
  test("resolves a photo placeholder with color + blur", () => {
    const ph = getWallpaperPlaceholder(
      "/wallpapers/photos/nature/aurora.jpg",
      MAP
    );
    expect(ph?.color).toBe("#624568");
    expect(ph?.blur).toStartWith("data:image/jpeg;base64,");
  });

  test("resolves a tile placeholder with color only", () => {
    const ph = getWallpaperPlaceholder("/wallpapers/tiles/azul_dark.png", MAP);
    expect(ph?.color).toBe("#2f457c");
    expect(ph?.blur).toBeUndefined();
  });

  test("returns null for unknown paths and missing map", () => {
    expect(
      getWallpaperPlaceholder("/wallpapers/photos/nature/missing.jpg", MAP)
    ).toBeNull();
    expect(
      getWallpaperPlaceholder("/wallpapers/photos/nature/aurora.jpg", null)
    ).toBeNull();
    expect(getWallpaperPlaceholder("blob:abc", MAP)).toBeNull();
  });
});
