// Utility for loading wallpaper manifest at /wallpapers/manifest.json
// Similar approach to icons.ts
import { abortableFetch } from "./abortableFetch";

export interface WallpaperManifest {
  version: number;
  generatedAt: string;
  tiles: string[];
  photos: Record<string, string[]>; // category -> relative paths (e.g. photos/foliage/rose.jpg)
  videos: string[]; // relative paths
}

/** Blur-up loading placeholder for a single built-in wallpaper. */
export interface WallpaperPlaceholder {
  /** Average color as `#rrggbb`, painted instantly as a solid base. */
  color: string;
  /** Tiny blurred JPEG data URI (photos only). */
  blur?: string;
}

export interface WallpaperPlaceholderManifest {
  version: number;
  generatedAt: string;
  /** Keyed by manifest-relative path, e.g. `photos/nature/aurora.jpg`. */
  placeholders: Record<string, WallpaperPlaceholder>;
}

let manifestCache: WallpaperManifest | null = null;
let manifestPromise: Promise<WallpaperManifest> | null = null;

let placeholdersCache: Record<string, WallpaperPlaceholder> | null = null;
let placeholdersPromise: Promise<Record<string, WallpaperPlaceholder>> | null =
  null;

export async function loadWallpaperManifest(): Promise<WallpaperManifest> {
  if (manifestCache) return manifestCache;
  if (!manifestPromise) {
    // Bypass HTTP caches to ensure we always see the newest manifest.
    // Server headers also set no-cache for this file, but this defends against
    // any intermediary or conflicting rules.
    manifestPromise = abortableFetch("/wallpapers/manifest.json", {
      cache: "no-store",
      timeout: 15000,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    })
      .then((r) => {
        if (!r.ok)
          throw new Error(`Failed to load wallpaper manifest: ${r.status}`);
        return r.json();
      })
      .then((data) => (manifestCache = data));
  }
  return manifestPromise;
}

/**
 * Loads blur-up placeholders (`/wallpapers/placeholders.json`). This file is a
 * progressive enhancement, so failures resolve to an empty map rather than
 * throwing. Unlike the manifest it is allowed to be cached aggressively (the
 * payload is large and regenerated alongside the manifest).
 */
export async function loadWallpaperPlaceholders(): Promise<
  Record<string, WallpaperPlaceholder>
> {
  if (placeholdersCache) return placeholdersCache;
  if (!placeholdersPromise) {
    placeholdersPromise = abortableFetch("/wallpapers/placeholders.json", {
      timeout: 15000,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    })
      .then((r) => {
        if (!r.ok)
          throw new Error(`Failed to load wallpaper placeholders: ${r.status}`);
        return r.json();
      })
      .then((data: WallpaperPlaceholderManifest) => {
        placeholdersCache = data?.placeholders ?? {};
        return placeholdersCache;
      })
      .catch((err) => {
        console.warn("[wallpapers] placeholders unavailable:", err);
        placeholdersCache = {};
        return placeholdersCache;
      });
  }
  return placeholdersPromise;
}

/** Already-resolved placeholders, if loaded; otherwise null. */
export function getCachedWallpaperPlaceholders():
  | Record<string, WallpaperPlaceholder>
  | null {
  return placeholdersCache;
}

/**
 * Maps a rendered wallpaper source (e.g. `/wallpapers/photos/nature/aurora.jpg`
 * or an absolute URL) to its manifest-relative placeholder key
 * (`photos/nature/aurora.jpg`). Returns null for blob:/data:/dynamic sources.
 */
export function placeholderKeyFromSource(source: string): string | null {
  if (!source) return null;
  const marker = "/wallpapers/";
  const idx = source.indexOf(marker);
  if (idx === -1) return null;
  const key = source.slice(idx + marker.length).split(/[?#]/)[0];
  return key || null;
}

/** Looks up the placeholder for a rendered wallpaper source. */
export function getWallpaperPlaceholder(
  source: string,
  placeholders: Record<string, WallpaperPlaceholder> | null
): WallpaperPlaceholder | null {
  if (!placeholders) return null;
  const key = placeholderKeyFromSource(source);
  if (!key) return null;
  return placeholders[key] ?? null;
}
