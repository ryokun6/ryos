/**
 * Shared wallpaper vocabulary for the AI `settings` tool.
 *
 * Dependency-free constants used by both the server-side Zod schema
 * (`api/chat/tools/schemas.ts`) and the client-side settings handler, so the
 * model sees exact enum values instead of relying on fuzzy string matching.
 *
 * `WALLPAPER_PHOTO_CATEGORIES` mirrors the photo category folders in
 * `public/wallpapers/photos/` (and thus `public/wallpapers/manifest.json`).
 * A unit test (`tests/unit/theme/test-wallpaper-tool-settings.test.ts`) verifies the two
 * stay in sync when wallpapers are added or removed.
 */

/** Photo categories available in the built-in wallpaper manifest. */
export const WALLPAPER_PHOTO_CATEGORIES = [
  "aqua",
  "black_and_white",
  "convergency",
  "foliage",
  "graphics",
  "landscapes",
  "nature",
  "nostalgia",
  "objects",
  "plants",
  "structures",
] as const;
export type WallpaperPhotoCategory =
  (typeof WALLPAPER_PHOTO_CATEGORIES)[number];

/**
 * Categories that can be shuffled: the tile patterns, the video wallpapers,
 * or any photo category. Maps 1:1 onto `buildShuffleDescriptor` targets
 * (`shuffle://tiles`, `shuffle://videos`, `shuffle://photos/<category>`).
 */
export const WALLPAPER_SHUFFLE_CATEGORIES = [
  "tiles",
  "videos",
  ...WALLPAPER_PHOTO_CATEGORIES,
] as const;
export type WallpaperShuffleCategory =
  (typeof WALLPAPER_SHUFFLE_CATEGORIES)[number];

/**
 * Dynamic wallpapers whose rendered pixels change over time. Each id maps to
 * a `dynamic://…` descriptor (see `src/utils/dynamicWallpaper.ts`).
 */
export const DYNAMIC_WALLPAPER_IDS = [
  "day-night",
  "weather",
  "cover",
  "lyrics",
] as const;
export type DynamicWallpaperToolId = (typeof DYNAMIC_WALLPAPER_IDS)[number];
