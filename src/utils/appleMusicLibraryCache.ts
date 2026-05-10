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
import type {
  AppleMusicPlaylist,
  Track,
} from "@/stores/useIpodStore";

const LIBRARY_KEY = "library";
const PLAYLISTS_KEY = "playlists";

export interface CachedAppleMusicLibrary {
  tracks: Track[];
  loadedAt: number;
  storefrontId: string | null;
}

export interface CachedAppleMusicPlaylists {
  playlists: AppleMusicPlaylist[];
  loadedAt: number;
}

export interface CachedAppleMusicPlaylistTracks {
  tracks: Track[];
  loadedAt: number;
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

export async function saveAppleMusicPlaylists(
  payload: CachedAppleMusicPlaylists
): Promise<void> {
  try {
    await dbOperations.put(
      STORES.APPLE_MUSIC_PLAYLISTS,
      payload,
      PLAYLISTS_KEY
    );
  } catch (err) {
    console.warn("[apple music cache] failed to save playlists", err);
  }
}

export async function loadAppleMusicPlaylists(): Promise<CachedAppleMusicPlaylists | null> {
  try {
    const cached = await dbOperations.get<CachedAppleMusicPlaylists>(
      STORES.APPLE_MUSIC_PLAYLISTS,
      PLAYLISTS_KEY
    );
    if (!cached || !Array.isArray(cached.playlists)) return null;
    return cached;
  } catch (err) {
    console.warn("[apple music cache] failed to load playlists", err);
    return null;
  }
}

export async function saveAppleMusicPlaylistTracks(
  playlistId: string,
  payload: CachedAppleMusicPlaylistTracks
): Promise<void> {
  try {
    await dbOperations.put(
      STORES.APPLE_MUSIC_PLAYLIST_TRACKS,
      payload,
      playlistId
    );
  } catch (err) {
    console.warn(
      `[apple music cache] failed to save playlist tracks for ${playlistId}`,
      err
    );
  }
}

export async function loadAppleMusicPlaylistTracks(
  playlistId: string
): Promise<CachedAppleMusicPlaylistTracks | null> {
  try {
    const cached = await dbOperations.get<CachedAppleMusicPlaylistTracks>(
      STORES.APPLE_MUSIC_PLAYLIST_TRACKS,
      playlistId
    );
    if (!cached || !Array.isArray(cached.tracks)) return null;
    return cached;
  } catch (err) {
    console.warn(
      `[apple music cache] failed to load playlist tracks for ${playlistId}`,
      err
    );
    return null;
  }
}

async function clearAppleMusicPlaylists(): Promise<void> {
  try {
    await dbOperations.delete(STORES.APPLE_MUSIC_PLAYLISTS, PLAYLISTS_KEY);
  } catch (err) {
    console.warn("[apple music cache] failed to clear playlists", err);
  }
}

async function clearAppleMusicPlaylistTracks(): Promise<void> {
  try {
    await dbOperations.clear(STORES.APPLE_MUSIC_PLAYLIST_TRACKS);
  } catch (err) {
    console.warn("[apple music cache] failed to clear playlist tracks", err);
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
  await clearAppleMusicPlaylists();
  await clearAppleMusicPlaylistTracks();
}
