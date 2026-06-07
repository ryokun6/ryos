import { getAppPublicOrigin } from "@/utils/runtimeConfig";
import { listAllCachedSongMetadata } from "@/utils/songMetadataCache";
import { mapCatalogSongToTrack } from "@/stores/ipodCatalogTrackMapping";
import type {
  IpodData,
  IpodState,
  IpodChatContextTrack,
  IpodLibrarySelection,
  Track,
} from "./types";

const PLAYBACK_TIME_UPDATE_EPSILON_SECONDS = 0.05;

export function parseRyosShareTrackId(input: string): string | null {
  try {
    const url = new URL(input);
    const publicOrigin = new URL(getAppPublicOrigin());
    const isRyosShareHost =
      url.hostname === "os.ryo.lu" ||
      url.host === publicOrigin.host ||
      (typeof window !== "undefined" && url.host === window.location.host);

    if (
      isRyosShareHost &&
      (url.pathname.startsWith("/ipod/") ||
        url.pathname.startsWith("/karaoke/"))
    ) {
      return url.pathname.split("/")[2] || null;
    }
  } catch {
    return null;
  }
  return null;
}

export function updateTrackCoverColorList(
  tracks: Track[],
  trackId: string,
  coverColor: string
): { tracks: Track[]; changed: boolean } {
  let changed = false;
  const updatedTracks = tracks.map((track) => {
    if (track.id !== trackId || track.coverColor === coverColor) {
      return track;
    }
    changed = true;
    return { ...track, coverColor };
  });
  return { tracks: changed ? updatedTracks : tracks, changed };
}

/** Map a MusicKit media item id to the `am:…` form expected by `/api/songs`. */
export function appleMusicKitIdToLyricsSongId(
  kitId: string | undefined
): string {
  if (!kitId) return "";
  if (kitId.startsWith("am:")) return kitId;
  return `am:${kitId}`;
}

export function shouldUpdatePlaybackTime(previous: number, next: number): boolean {
  return Math.abs(previous - next) >= PLAYBACK_TIME_UPDATE_EPSILON_SECONDS;
}

export function normalizeAppleMusicPlaybackQueue(
  queue: string[] | null
): string[] | null {
  if (!queue) return null;
  const ids = queue.filter((id) => typeof id === "string" && id.length > 0);
  return ids.length > 0 ? ids : null;
}

export function resolveAppleMusicQueueTracks(state: IpodData): Track[] {
  const libraryTracks = state.appleMusicTracks;
  const queue = normalizeAppleMusicPlaybackQueue(state.appleMusicPlaybackQueue);
  if (!queue) {
    return libraryTracks.filter((track) => !isAppleMusicCollectionTrack(track));
  }

  const libraryById = new Map(libraryTracks.map((track) => [track.id, track]));
  return queue.reduce<Track[]>((acc, id) => {
    const track = libraryById.get(id);
    if (track) {
      acc.push(track);
    }
    return acc;
  }, []);
}

export function isAppleMusicCollectionTrack(
  track: Track | null | undefined
): boolean {
  return Boolean(
    track?.appleMusicPlayParams?.stationId ||
      track?.appleMusicPlayParams?.playlistId
  );
}

/** Helper to get current index from song ID */
export function getIndexFromSongId(tracks: Track[], songId: string | null): number {
  if (!songId || tracks.length === 0) return -1;
  const index = tracks.findIndex((t) => t.id === songId);
  return index >= 0 ? index : -1;
}

export function getIpodTracksForLibrary(
  state: Pick<IpodState, "librarySource" | "tracks" | "appleMusicTracks">,
  library: IpodLibrarySelection = "active"
): Track[] {
  const resolvedLibrary = library === "active" ? state.librarySource : library;
  return resolvedLibrary === "appleMusic" ? state.appleMusicTracks : state.tracks;
}

export function getActiveIpodTracks(
  state: Pick<IpodState, "librarySource" | "tracks" | "appleMusicTracks">
): Track[] {
  return getIpodTracksForLibrary(state);
}

export function getActiveIpodCurrentSongId(
  state: Pick<
    IpodState,
    "librarySource" | "currentSongId" | "appleMusicCurrentSongId"
  >
): string | null {
  return state.librarySource === "appleMusic"
    ? state.appleMusicCurrentSongId
    : state.currentSongId;
}

export function getActiveIpodCurrentTrack(
  state: Pick<
    IpodState,
    | "librarySource"
    | "tracks"
    | "currentSongId"
    | "appleMusicTracks"
    | "appleMusicCurrentSongId"
  >
): Track | null {
  const tracks = getActiveIpodTracks(state);
  const currentSongId = getActiveIpodCurrentSongId(state);
  if (!currentSongId) return tracks[0] ?? null;
  return tracks.find((track) => track.id === currentSongId) ?? null;
}

export function getIpodChatContextTrack(
  state: Pick<
    IpodState,
    | "librarySource"
    | "tracks"
    | "currentSongId"
    | "appleMusicTracks"
    | "appleMusicCurrentSongId"
    | "appleMusicKitNowPlaying"
  >
): IpodChatContextTrack | null {
  const currentTrack = getActiveIpodCurrentTrack(state);
  if (state.librarySource === "appleMusic" && state.appleMusicKitNowPlaying) {
    const snapshot = state.appleMusicKitNowPlaying;
    return {
      id: snapshot.id
        ? appleMusicKitIdToLyricsSongId(snapshot.id)
        : currentTrack?.id ?? "apple-music-now-playing",
      url: currentTrack?.url,
      title: snapshot.title,
      artist: snapshot.artist,
      album: snapshot.album,
      source: "appleMusic",
    };
  }

  return currentTrack
    ? {
        id: currentTrack.id,
        url: currentTrack.url,
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        source: state.librarySource,
      }
    : null;
}

export function setActiveIpodCurrentSongId(
  state: Pick<
    IpodState,
    | "librarySource"
    | "setCurrentSongId"
    | "setAppleMusicCurrentSongId"
    | "setAppleMusicPlaybackQueue"
  >,
  songId: string | null
): void {
  if (state.librarySource === "appleMusic") {
    state.setAppleMusicPlaybackQueue(null);
    state.setAppleMusicCurrentSongId(songId);
    return;
  }
  state.setCurrentSongId(songId);
}

export function navigateActiveIpodTrack(
  state: Pick<
    IpodState,
    | "librarySource"
    | "nextTrack"
    | "previousTrack"
    | "appleMusicNextTrack"
    | "appleMusicPreviousTrack"
  >,
  direction: "next" | "previous"
): void {
  if (state.librarySource === "appleMusic") {
    if (direction === "next") {
      state.appleMusicNextTrack();
    } else {
      state.appleMusicPreviousTrack();
    }
    return;
  }

  if (direction === "next") {
    state.nextTrack();
  } else {
    state.previousTrack();
  }
}

// Helper function to get unplayed track IDs from history
export function getUnplayedTrackIds(
  tracks: Track[],
  playbackHistory: string[]
): string[] {
  const playedIds = new Set(playbackHistory);
  return tracks.reduce<string[]>((acc, track) => {
    if (!playedIds.has(track.id)) {
      acc.push(track.id);
    }
    return acc;
  }, []);
}

// Helper function to get a random track ID avoiding recently played songs
export function getRandomTrackIdAvoidingRecent(
  tracks: Track[],
  playbackHistory: string[],
  currentSongId: string | null
): string | null {
  if (tracks.length === 0) return null;
  if (tracks.length === 1) return tracks[0].id;

  // Get unplayed tracks first (tracks that have never been played)
  const unplayedIds = getUnplayedTrackIds(tracks, playbackHistory);

  // If we have unplayed tracks, prioritize them
  if (unplayedIds.length > 0) {
    const availableUnplayed = unplayedIds.filter((id) => id !== currentSongId);

    if (availableUnplayed.length > 0) {
      return availableUnplayed[Math.floor(Math.random() * availableUnplayed.length)];
    }
  }

  // If no unplayed tracks, avoid recently played ones
  // Keep a reasonable history size to avoid (e.g., half the playlist or 10 tracks, whichever is smaller)
  const avoidCount = Math.min(Math.floor(tracks.length / 2), 10);
  const recentTrackIds = playbackHistory.slice(-avoidCount);
  const recentIds = new Set(recentTrackIds);

  // Find tracks that haven't been played recently
  const availableIds = tracks.reduce<string[]>((acc, track) => {
    if (!recentIds.has(track.id) && track.id !== currentSongId) {
      acc.push(track.id);
    }
    return acc;
  }, []);

  if (availableIds.length > 0) {
    return availableIds[Math.floor(Math.random() * availableIds.length)];
  }

  // If all tracks have been played recently, just pick any track except current
  const allIdsExceptCurrent = tracks.reduce<string[]>((acc, track) => {
    if (track.id !== currentSongId) {
      acc.push(track.id);
    }
    return acc;
  }, []);

  if (allIdsExceptCurrent.length > 0) {
    return allIdsExceptCurrent[Math.floor(Math.random() * allIdsExceptCurrent.length)];
  }

  // Fallback: return current song ID if it's the only option
  return currentSongId;
}

// Helper function to update playback history
export function updatePlaybackHistory(
  playbackHistory: string[],
  trackId: string,
  maxHistory: number = 50
): string[] {
  // Remove the track if it's already in history (to avoid duplicates when going back/forward)
  const filtered = playbackHistory.filter((id) => id !== trackId);
  // Add the track ID to the end of history
  const updated = [...filtered, trackId];
  // Keep only the most recent tracks
  return updated.slice(-maxHistory);
}

// ============================================================================
// CACHING FOR iPod TRACKS
// ============================================================================

// In-memory cache for iPod tracks data
let cachedIpodData: { tracks: Track[]; version: number } | null = null;
let ipodDataPromise: Promise<{ tracks: Track[]; version: number }> | null = null;
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
      
      console.log(`[iPod Store] Loaded ${cachedSongs.length} tracks from Redis cache (by ryo)`);
      // Songs are already sorted by createdAt (newest first) from the API
      const tracks: Track[] = cachedSongs.map(mapCatalogSongToTrack);
      // Use the latest createdAt timestamp as version (or 1 if empty)
      const version = cachedSongs.length > 0 
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
