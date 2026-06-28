/**
 * iPod default-track preloading, extracted from `useIpodStore`.
 *
 * `main.tsx` kicks this off before React mounts. Keeping it in its own thin
 * module means the entry chunk only pays for the song-metadata API client —
 * not the entire 2,600-line iPod store and its transitive dependencies.
 */
import { listAllCachedSongMetadata } from "@/utils/songMetadataCache";
import { mapCatalogSongToTrack } from "@/stores/ipodCatalogTrackMapping";
import type { Track } from "@/stores/useIpodStore";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("IpodPreload");

// In-memory cache for iPod tracks data
let cachedIpodData: { tracks: Track[]; version: number } | null = null;
let ipodDataPromise: Promise<{ tracks: Track[]; version: number }> | null =
  null;
/** Only the latest load may write `cachedIpodData` (avoids stale force-refresh overwrites). */
let ipodLoadGeneration = 0;

/**
 * Preload iPod tracks data early (can be called before React mounts).
 * This starts fetching the JSON file without blocking.
 */
export function preloadIpodData(): void {
  if (cachedIpodData || ipodDataPromise) return;
  loadDefaultTracks();
}

/**
 * Load default tracks from Redis song metadata cache.
 * @param forceRefresh - If true, bypasses cache and fetches fresh data (used by syncLibrary)
 */
export async function loadDefaultTracks(forceRefresh = false): Promise<{
  tracks: Track[];
  version: number;
}> {
  // Return cached data immediately if available (unless force refresh)
  if (!forceRefresh && cachedIpodData) {
    return cachedIpodData;
  }

  // Return existing promise if fetch is in progress (deduplication)
  // But not if we need a force refresh
  if (!forceRefresh && ipodDataPromise) {
    return ipodDataPromise;
  }

  const thisGeneration = ++ipodLoadGeneration;

  // Start new fetch
  const fetchPromise = (async () => {
    try {
      // Load from Redis song metadata cache
      // Only sync songs created by user "ryo" (the admin/curator)
      const cachedSongs = await listAllCachedSongMetadata("ryo");

      log.debug("Loaded tracks from Redis cache", {
        trackCount: cachedSongs.length,
        createdBy: "ryo",
      });
      // Songs are already sorted by createdAt (newest first) from the API
      const tracks: Track[] = cachedSongs.map(mapCatalogSongToTrack);
      // Use the latest createdAt timestamp as version (or 1 if empty)
      const version =
        cachedSongs.length > 0
          ? Math.max(...cachedSongs.map((s) => s.createdAt || 1))
          : 1;
      const payload = { tracks, version };
      if (thisGeneration === ipodLoadGeneration) {
        cachedIpodData = payload;
        return payload;
      }
      // A newer load won the race; prefer latest cache so awaiters do not apply stale tracks.
      return cachedIpodData ?? payload;
    } catch (err) {
      console.error("Failed to load tracks from cache", err);
      return { tracks: [], version: 1 };
    }
  })();

  // Only set the shared promise for non-force-refresh requests
  if (!forceRefresh) {
    ipodDataPromise = fetchPromise;
    fetchPromise.finally(() => {
      ipodDataPromise = null;
    });
  }

  return fetchPromise;
}
