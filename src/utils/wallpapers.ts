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

let manifestCache: WallpaperManifest | null = null;
let manifestPromise: Promise<WallpaperManifest> | null = null;

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
