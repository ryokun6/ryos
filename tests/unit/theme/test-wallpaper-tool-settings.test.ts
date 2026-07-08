/**
 * AI settings tool — wallpaper vocabulary and deterministic name resolution.
 *
 * Covers the shared shuffle/dynamic enums (and that they stay in sync with the
 * built-in wallpaper manifest), the settings schema's wallpaper fields, and
 * the strict resolver that replaced fuzzy matching.
 */
import { describe, expect, test } from "bun:test";

import manifest from "../../../public/wallpapers/manifest.json";
import {
  DYNAMIC_WALLPAPER_IDS,
  WALLPAPER_PHOTO_CATEGORIES,
  WALLPAPER_SHUFFLE_CATEGORIES,
} from "../../../src/shared/tools/wallpaper";
import {
  COVER_WALLPAPER,
  DAY_NIGHT_GRADIENT_WALLPAPER,
  DYNAMIC_WALLPAPER_DESCRIPTORS,
  LYRICS_WALLPAPER,
  WEATHER_WALLPAPER,
  buildShuffleDescriptor,
  isDynamicWallpaper,
  parseShuffleDescriptor,
} from "../../../src/utils/dynamicWallpaper";
import { settingsSchema } from "../../../api/chat/tools/schemas";
import {
  normalizeWallpaperName,
  resolveWallpaperFromManifest,
} from "../../../src/apps/chats/tools/wallpaperResolution";
import type { WallpaperManifest } from "../../../src/utils/wallpapers";

const MANIFEST = manifest as WallpaperManifest;

// ============================================================================
// Shared vocabulary stays in sync with the built-in manifest
// ============================================================================

describe("wallpaper tool vocabulary", () => {
  test("photo categories match the built-in wallpaper manifest", () => {
    expect([...WALLPAPER_PHOTO_CATEGORIES].sort()).toEqual(
      Object.keys(MANIFEST.photos).sort()
    );
  });

  test("every photo category has at least one wallpaper to shuffle", () => {
    for (const category of WALLPAPER_PHOTO_CATEGORIES) {
      expect(MANIFEST.photos[category].length).toBeGreaterThan(0);
    }
  });

  test("every shuffle category round-trips through the shuffle descriptor", () => {
    for (const category of WALLPAPER_SHUFFLE_CATEGORIES) {
      const target = parseShuffleDescriptor(buildShuffleDescriptor(category));
      expect(target).not.toBeNull();
      if (category === "tiles" || category === "videos") {
        expect(target).toEqual({ kind: category });
      } else {
        expect(target).toEqual({ kind: "photos", category });
      }
    }
  });

  test("dynamic ids map to the canonical dynamic descriptors", () => {
    expect(DYNAMIC_WALLPAPER_DESCRIPTORS).toEqual({
      "day-night": DAY_NIGHT_GRADIENT_WALLPAPER,
      weather: WEATHER_WALLPAPER,
      cover: COVER_WALLPAPER,
      lyrics: LYRICS_WALLPAPER,
    });
    for (const id of DYNAMIC_WALLPAPER_IDS) {
      expect(isDynamicWallpaper(DYNAMIC_WALLPAPER_DESCRIPTORS[id])).toBe(true);
    }
  });
});

// ============================================================================
// Settings schema wallpaper fields
// ============================================================================

describe("settingsSchema wallpaper fields", () => {
  test("accepts each shuffle category", () => {
    for (const category of WALLPAPER_SHUFFLE_CATEGORIES) {
      expect(
        settingsSchema.safeParse({ wallpaperShuffle: category }).success
      ).toBe(true);
    }
  });

  test("accepts each dynamic wallpaper id", () => {
    for (const id of DYNAMIC_WALLPAPER_IDS) {
      expect(settingsSchema.safeParse({ wallpaperDynamic: id }).success).toBe(
        true
      );
    }
  });

  test("rejects unknown shuffle categories and dynamic ids", () => {
    expect(
      settingsSchema.safeParse({ wallpaperShuffle: "rainbows" }).success
    ).toBe(false);
    expect(
      settingsSchema.safeParse({ wallpaperDynamic: "rainbow" }).success
    ).toBe(false);
  });

  test("accepts combined wallpaper fields (conflicts resolve client-side)", () => {
    // Overfilled bundles must reach the client, where the current wallpaper
    // is known: echoes are dropped by resolveWallpaperConflict and genuine
    // conflicts fail only the wallpaper change with a retry hint.
    expect(
      settingsSchema.safeParse({
        wallpaper: "aurora",
        wallpaperShuffle: "nature",
      }).success
    ).toBe(true);
    expect(
      settingsSchema.safeParse({
        wallpaperShuffle: "tiles",
        wallpaperDynamic: "weather",
      }).success
    ).toBe(true);
  });

  test("wallpaper fields combine with unrelated settings", () => {
    expect(
      settingsSchema.safeParse({ theme: "xp", wallpaperDynamic: "weather" })
        .success
    ).toBe(true);
    expect(
      settingsSchema.safeParse({ masterVolume: 0, wallpaperShuffle: "aqua" })
        .success
    ).toBe(true);
  });
});

// ============================================================================
// Deterministic name resolution (no fuzzy matching)
// ============================================================================

describe("resolveWallpaperFromManifest", () => {
  test("normalizeWallpaperName canonicalizes case, separators, and extensions", () => {
    expect(normalizeWallpaperName("Azul_Dark.png")).toBe("azul dark");
    expect(normalizeWallpaperName("photos/nature/aurora.jpg")).toBe(
      "photos nature aurora"
    );
    expect(normalizeWallpaperName("  Day--Night  ")).toBe("day night");
  });

  test("exact name matches resolve to the manifest asset", () => {
    const result = resolveWallpaperFromManifest(MANIFEST, "aurora");
    expect(result.match).toEqual({
      path: "/wallpapers/photos/nature/aurora.jpg",
      label: "aurora",
    });
  });

  test("matching is case- and separator-insensitive", () => {
    const result = resolveWallpaperFromManifest(MANIFEST, "Azul Dark");
    expect(result.match?.path).toBe("/wallpapers/tiles/azul_dark.png");
  });

  test("exact match wins even when longer names share the prefix", () => {
    // tiles has bondi.png alongside bondi_dark, bondi_light, etc.
    const result = resolveWallpaperFromManifest(MANIFEST, "bondi");
    expect(result.match?.path).toBe("/wallpapers/tiles/bondi.png");
  });

  test("full manifest paths and category-qualified names resolve", () => {
    expect(
      resolveWallpaperFromManifest(MANIFEST, "photos/nature/aurora.jpg").match
        ?.path
    ).toBe("/wallpapers/photos/nature/aurora.jpg");
    expect(
      resolveWallpaperFromManifest(MANIFEST, "nature aurora").match?.path
    ).toBe("/wallpapers/photos/nature/aurora.jpg");
    expect(
      resolveWallpaperFromManifest(MANIFEST, "tiles/azul_dark.png").match?.path
    ).toBe("/wallpapers/tiles/azul_dark.png");
  });

  test("a unique prefix resolves deterministically", () => {
    const result = resolveWallpaperFromManifest(MANIFEST, "clown");
    expect(result.match?.path).toBe("/wallpapers/photos/nature/clown_fish.jpg");
  });

  test("a prefix shared by several wallpapers is ambiguous, not a guess", () => {
    // "cancun" prefixes both the photo cancun_sunset and the video
    // cancun_sunset_loop — the old fuzzy matcher would silently pick one.
    const result = resolveWallpaperFromManifest(MANIFEST, "cancun");
    expect(result.match).toBeNull();
    expect(result.ambiguous).toBe(true);
    expect(result.suggestions).toContain("cancun sunset");
    expect(result.suggestions).toContain("cancun sunset loop");
  });

  test("ambiguous queries fail with suggestions instead of guessing", () => {
    const result = resolveWallpaperFromManifest(MANIFEST, "azul");
    expect(result.match).toBeNull();
    expect(result.ambiguous).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(1);
    expect(result.suggestions).toContain("azul dark");
  });

  test("unknown names fail without a match", () => {
    const result = resolveWallpaperFromManifest(MANIFEST, "flurble");
    expect(result.match).toBeNull();
    expect(result.ambiguous).toBe(false);
    expect(result.suggestions).toEqual([]);
  });

  test("resolution is stable across repeated calls", () => {
    const first = resolveWallpaperFromManifest(MANIFEST, "clouds");
    const second = resolveWallpaperFromManifest(MANIFEST, "clouds");
    expect(first).toEqual(second);
  });

  test("every manifest wallpaper resolves from its own exact name or path", () => {
    const relPaths = [
      ...MANIFEST.tiles,
      ...Object.values(MANIFEST.photos).flat(),
      ...MANIFEST.videos,
    ];
    for (const relPath of relPaths) {
      const byPath = resolveWallpaperFromManifest(MANIFEST, relPath);
      expect(byPath.match?.path).toBe(`/wallpapers/${relPath}`);
    }
  });
});
