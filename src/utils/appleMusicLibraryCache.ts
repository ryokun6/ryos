// IndexedDB-backed cache for the user's Apple Music library.
//
// We keep this OUT of zustand's localStorage `persist` because Apple
// Music libraries routinely exceed the 5–10MB per-origin localStorage
// quota — when zustand tried to write a 5,000-song library to
// localStorage the entire ipod store failed to persist with a
// QuotaExceededError. IndexedDB has no practical size limit for our
// purposes (browsers typically allow 50%+ of free disk space).
//
// The cache is keyed under a single record so we can replace the whole
// library atomically and load it in one round-trip.

import { dbOperations } from "@/apps/finder/hooks/useFileSystem";
import { STORES } from "@/utils/indexedDB";
import type { Track } from "@/stores/useIpodStore";

const LIBRARY_KEY = "library";

export interface CachedAppleMusicLibrary {
  tracks: Track[];
  loadedAt: number;
  storefrontId: string | null;
}

/** Persist the library to IndexedDB. Failures are logged but swallowed
 * so the in-memory copy remains usable even when storage is unhappy. */
export async function saveAppleMusicLibrary(
  payload: CachedAppleMusicLibrary
): Promise<void> {
  try {
    await dbOperations.put(STORES.APPLE_MUSIC_LIBRARY, payload, LIBRARY_KEY);
  } catch (err) {
    console.warn("[apple music cache] failed to save library", err);
  }
}

/** Load the previously cached library from IndexedDB. Returns null when
 * nothing is cached yet (first run, after sign-out, etc.). */
export async function loadAppleMusicLibrary(): Promise<CachedAppleMusicLibrary | null> {
  try {
    const cached = await dbOperations.get<CachedAppleMusicLibrary>(
      STORES.APPLE_MUSIC_LIBRARY,
      LIBRARY_KEY
    );
    if (!cached || !Array.isArray(cached.tracks)) return null;
    return cached;
  } catch (err) {
    console.warn("[apple music cache] failed to load library", err);
    return null;
  }
}

/** Clear the cache (called on sign-out so a different user doesn't
 * inherit the previous user's library). */
export async function clearAppleMusicLibrary(): Promise<void> {
  try {
    await dbOperations.delete(STORES.APPLE_MUSIC_LIBRARY, LIBRARY_KEY);
  } catch (err) {
    console.warn("[apple music cache] failed to clear library", err);
  }
}
