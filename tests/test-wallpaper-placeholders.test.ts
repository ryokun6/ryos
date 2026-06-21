import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  placeholderKeyFromSource,
  getWallpaperPlaceholder,
  thumbPathForSource,
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

  test("every photo has a generated .webp thumbnail on disk", () => {
    for (const rel of photoPaths) {
      const thumbUrl = thumbPathForSource(`/wallpapers/${rel}`);
      expect(thumbUrl, `no thumb path derived for ${rel}`).toBeTruthy();
      const abs = join("public", thumbUrl!);
      expect(existsSync(abs), `missing thumbnail file ${abs}`).toBe(true);
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

describe("thumbPathForSource", () => {
  test("maps a photo to its .webp thumbnail path", () => {
    expect(thumbPathForSource("/wallpapers/photos/nature/aurora.jpg")).toBe(
      "/wallpapers/thumbs/photos/nature/aurora.webp"
    );
    expect(
      thumbPathForSource("https://os.ryo.lu/wallpapers/photos/aqua/0.png")
    ).toBe("/wallpapers/thumbs/photos/aqua/0.webp");
  });

  test("returns null for tiles, videos, custom, and dynamic sources", () => {
    expect(thumbPathForSource("/wallpapers/tiles/azul_dark.png")).toBeNull();
    expect(
      thumbPathForSource("/wallpapers/videos/blue_flowers_loop.mp4")
    ).toBeNull();
    expect(thumbPathForSource("blob:abc-123")).toBeNull();
    expect(thumbPathForSource("dynamic://weather")).toBeNull();
  });
});
