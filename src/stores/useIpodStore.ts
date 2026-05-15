import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  LyricsAlignment,
  KoreanDisplay,
  JapaneseFurigana,
  LyricsFont,
  RomanizationSettings,
  DisplayMode,
  areRomanizationSettingsEqual,
} from "@/types/lyrics";
import { LyricLine } from "@/types/lyrics";
import type { FuriganaSegment } from "@/utils/romanization";
import { getApiUrl } from "@/utils/platform";
import { getAppPublicOrigin } from "@/utils/runtimeConfig";
import { getCachedSongMetadata, listAllCachedSongMetadata } from "@/utils/songMetadataCache";
import i18n from "@/lib/i18n";
import { useChatsStore } from "./useChatsStore";
import { abortableFetch } from "@/utils/abortableFetch";
import { emitCloudSyncDomainChange } from "@/utils/cloudSyncEvents";
import { sortTracksLikeServerOrder } from "@/stores/ipodTrackOrder";
import { saveAppleMusicLibrary } from "@/utils/appleMusicLibraryCache";

/** Special value for lyricsTranslationLanguage that means "use ryOS locale" */
export const LYRICS_TRANSLATION_AUTO = "auto";

/** Lyrics source from Kugou */
export interface LyricsSource {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
}

/** Library source the iPod is currently displaying. */
export type LibrarySource = "youtube" | "appleMusic";

/** User playlist from the Apple Music library. */
export interface AppleMusicPlaylist {
  id: string;
  globalId?: string;
  name: string;
  artworkUrl?: string;
  trackCount?: number;
  canEdit?: boolean;
}

/** Apple Music play parameters needed for `setQueue` (catalog vs library). */
export interface AppleMusicPlayParams {
  /** Catalog song ID (numeric string) when available — preferred for setQueue. */
  catalogId?: string;
  /** Library song ID (`i.<hash>` form) for personal library tracks. */
  libraryId?: string;
  /** Catalog station ID (`ra.*` form) for Apple Music radio playback. */
  stationId?: string;
  /** Catalog playlist ID (`pl.*` form) for recommendation playback. */
  playlistId?: string;
  /** MusicKit kind, e.g. "song", "library-song". */
  kind: string;
  isLibrary?: boolean;
}

// Define the Track type (can be shared or defined here)
export interface Track {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  /** Album-level artist for grouping compilations/collaborative albums. */
  albumArtist?: string;
  /** Apple Music album/library album id when available, used for album grouping. */
  appleMusicAlbumId?: string;
  /** Cover image URL from Kugou */
  cover?: string;
  /** Offset in milliseconds to adjust lyrics timing for this track (positive = lyrics earlier) */
  lyricOffset?: number;
  /** Selected lyrics source from Kugou (user override) */
  lyricsSource?: LyricsSource;
  /** Server/library creation time (ms); used for All Songs order (newest first) */
  createdAt?: number;
  /** Stable sequence when createdAt ties (e.g. bulk import index) */
  importOrder?: number;
  /** Last metadata update from server (ms); tiebreaker for list order */
  updatedAt?: number;
  /** Origin of this track. Defaults to "youtube" when unset for back-compat. */
  source?: LibrarySource;
  /** Track duration in milliseconds (Apple Music exposes this up front). */
  durationMs?: number;
  /** Apple Music play parameters used to drive MusicKit playback. */
  appleMusicPlayParams?: AppleMusicPlayParams;
}

/**
 * Live now-playing row from MusicKit (`mediaItemDidChange`) while a station or
 * catalog playlist queue is active. Drives LCD metadata, title bar rotation,
 * and lyrics for air items (the store `currentTrack` stays the shell row).
 */
export interface AppleMusicKitNowPlaying {
  id?: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
}

/** Map a MusicKit media item id to the `am:…` form expected by `/api/songs`. */
export function appleMusicKitIdToLyricsSongId(
  kitId: string | undefined
): string {
  if (!kitId) return "";
  if (kitId.startsWith("am:")) return kitId;
  return `am:${kitId}`;
}

type LibraryState = "uninitialized" | "loaded" | "cleared";

interface IpodData {
  tracks: Track[];
  /** The ID of the currently playing song */
  currentSongId: string | null;
  loopCurrent: boolean;
  loopAll: boolean;
  isShuffled: boolean;
  isPlaying: boolean;
  showVideo: boolean;
  /** Display mode for visual background (video, cover art, or landscapes) */
  displayMode: DisplayMode;
  backlightOn: boolean;
  theme: "classic" | "black" | "u2";
  /**
   * On-screen UI variant for the iPod display.
   *
   * - `"classic"` keeps the monochrome 1st/4th-gen iPod LCD look — blue
   *   Chicago-font menu rows on a pale blue background, the original
   *   look that's been there forever.
   * - `"modern"` switches the screen to an iOS 6 inspired skin: glossy
   *   blue gradient navigation bar (à la `UIBarStyleDefault`), white
   *   table-view cells with thin grey separators and a glossy blue
   *   selection highlight, and Helvetica Neue typography. The classic
   *   hardware (click wheel, body) is unchanged — only the contents of
   *   the 150px LCD swap.
   *
   * Persisted across reloads. Defaults to **`"modern"`**; existing saved
   * preferences (including **`"classic"`**) are kept on rehydrate.
   */
  uiVariant: "classic" | "modern";
  lcdFilterOn: boolean;
  showLyrics: boolean;
  lyricsAlignment: LyricsAlignment;
  lyricsFont: LyricsFont;
  /** @deprecated Use romanization settings instead */
  koreanDisplay: KoreanDisplay;
  /** @deprecated Use romanization settings instead */
  japaneseFurigana: JapaneseFurigana;
  /** Romanization settings for lyrics display */
  romanization: RomanizationSettings;
  /** Persistent translation language preference that persists across tracks */
  lyricsTranslationLanguage: string | null;
  currentLyrics: { lines: LyricLine[] } | null;
  /** Furigana map for current lyrics (startTimeMs -> FuriganaSegment[]) - not persisted */
  currentFuriganaMap: Record<string, FuriganaSegment[]> | null;
  /** Incrementing trigger to force-refresh lyrics fetching (client-side refetch) */
  lyricsRefetchTrigger: number;
  /** Incrementing trigger to force-clear all lyrics caches (bypasses server cache) */
  lyricsCacheBustTrigger: number;
  isFullScreen: boolean;
  libraryState: LibraryState;
  lastKnownVersion: number;
  playbackHistory: string[]; // Track IDs in playback order for back functionality and avoiding recent tracks
  historyPosition: number; // Current position in playback history (-1 means at the end)
  /** Current playback position in seconds (not persisted, synced from ReactPlayer) */
  elapsedTime: number;
  /** Total duration of current track in seconds (not persisted, synced from ReactPlayer) */
  totalTime: number;

  // ---------- Apple Music slice ----------

  /** Which library is currently active (default "youtube"). */
  librarySource: LibrarySource;
  /** Tracks fetched from the user's Apple Music library. Cached in
   * IndexedDB (not localStorage — the library is too large for
   * localStorage's per-origin quota) and re-hydrated on mount by
   * `useAppleMusicLibrary`. The library hook treats anything younger
   * than `APPLE_MUSIC_LIBRARY_STALE_AFTER_MS` (24h) as fresh. */
  appleMusicTracks: Track[];
  /** Playlists from the user's Apple Music library (IndexedDB-backed). */
  appleMusicPlaylists: AppleMusicPlaylist[];
  /**
   * Timestamp (epoch ms) when the playlist list itself was last synced.
   * Drives the opportunistic background refresh in
   * `useAppleMusicLibrary` independently of the heavier full-library
   * fetch (which has its own `appleMusicLibraryLoadedAt`).
   */
  appleMusicPlaylistsLoadedAt: number | null;
  /** Tracks per playlist id; lazy-loaded on drill-down. */
  appleMusicPlaylistTracks: Record<string, Track[]>;
  /** Per-playlist cache timestamp for stale-while-revalidate. */
  appleMusicPlaylistTracksLoadedAt: Record<string, number>;
  /** Per-playlist in-flight fetch flags. */
  appleMusicPlaylistTracksLoading: Record<string, boolean>;
  /**
   * Tracks shown in the "Recently Added" menu, mirrored from IndexedDB
   * so the menu can render cached content immediately on iPod open and
   * the opportunistic refresh path in `useAppleMusicLibrary` can update
   * the same source other consumers read from.
   */
  appleMusicRecentlyAddedTracks: Track[];
  /** Last sync timestamp for `appleMusicRecentlyAddedTracks`. */
  appleMusicRecentlyAddedLoadedAt: number | null;
  /** True while a Recently Added refresh is in flight (drives the
   *  one-time "Loading…" placeholder when the cache is empty). */
  appleMusicRecentlyAddedLoading: boolean;
  /** Tracks shown in the "Favorite Songs" menu (same shape as above). */
  appleMusicFavoriteTracks: Track[];
  appleMusicFavoriteTracksLoadedAt: number | null;
  appleMusicFavoritesLoading: boolean;
  /** Currently selected song id within the Apple Music library. */
  appleMusicCurrentSongId: string | null;
  /**
   * Ordered list of Apple Music track ids that scopes next/previous
   * navigation. When non-null, prev/next walk through these ids
   * (intersected with `appleMusicTracks` so unknown ids are dropped).
   * `null` falls back to the full library order.
   */
  appleMusicPlaybackQueue: string[] | null;
  /** Last time the Apple Music library was synced (epoch ms). */
  appleMusicLibraryLoadedAt: number | null;
  /** True while a library refresh is in flight. */
  appleMusicLibraryLoading: boolean;
  /** Error from the most recent library fetch, if any. */
  appleMusicLibraryError: string | null;
  /** Cached storefront ID reported by MusicKit (e.g. "us"). */
  appleMusicStorefrontId: string | null;
  /** Live MusicKit now-playing metadata during station / playlist queue playback. */
  appleMusicKitNowPlaying: AppleMusicKitNowPlaying | null;

  // ---------- Menu navigation persistence ----------

  /**
   * Slim breadcrumb of the iPod's menu navigation: an entry per level
   * with the menu's title and the cursor position the user left it at.
   * The deepest entry's `selectedIndex` mirrors the live cursor.
   *
   * Only titles + indices are persisted (action closures and rebuilt
   * item arrays are not serializable). On iPod open the breadcrumb is
   * walked through `rebuildMenuItems` to reconstruct the full
   * `menuHistory` with fresh actions.
   *
   * `null` means "no saved breadcrumb yet" — the iPod will start at the
   * top-level menu.
   */
  ipodMenuBreadcrumb:
    | { title: string; displayTitle?: string; selectedIndex: number }[]
    | null;
  /**
   * Whether the iPod was last in menu mode (true) or Now Playing mode
   * (false). Restored on open so reopening returns the user to the same
   * surface they left from.
   */
  ipodMenuMode: boolean | null;
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
async function loadDefaultTracks(forceRefresh = false): Promise<{
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
      const tracks: Track[] = cachedSongs.map((song) => ({
        id: song.youtubeId,
        url: `https://www.youtube.com/watch?v=${song.youtubeId}`,
        title: song.title,
        artist: song.artist,
        album: song.album ?? "",
        cover: song.cover,
        lyricOffset: song.lyricOffset,
        lyricsSource: song.lyricsSource,
        createdAt: song.createdAt,
        importOrder: song.importOrder,
        updatedAt: song.updatedAt,
      }));
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

const initialIpodData: IpodData = {
  tracks: [],
  currentSongId: null,
  loopCurrent: false,
  loopAll: true,
  isShuffled: true,
  isPlaying: false,
  showVideo: false,
  displayMode: DisplayMode.Video,
  backlightOn: true,
  theme: "classic",
  uiVariant: "modern",
  lcdFilterOn: true,
  showLyrics: true,
  lyricsAlignment: LyricsAlignment.Alternating,
  lyricsFont: LyricsFont.SansSerif,
  koreanDisplay: KoreanDisplay.Original,
  japaneseFurigana: JapaneseFurigana.On,
  romanization: {
    enabled: true,
    japaneseFurigana: true,
    japaneseRomaji: false,
    korean: true,
    chinese: false,
    soramimi: false,
    soramamiTargetLanguage: "zh-TW",
    pronunciationOnly: false,
  },
  lyricsTranslationLanguage: LYRICS_TRANSLATION_AUTO,
  currentLyrics: null,
  currentFuriganaMap: null,
  lyricsRefetchTrigger: 0,
  lyricsCacheBustTrigger: 0,
  isFullScreen: false,
  libraryState: "uninitialized",
  lastKnownVersion: 0,
  playbackHistory: [],
  historyPosition: -1,
  elapsedTime: 0,
  totalTime: 0,

  librarySource: "youtube",
  appleMusicTracks: [],
  appleMusicPlaylists: [],
  appleMusicPlaylistsLoadedAt: null,
  appleMusicPlaylistTracks: {},
  appleMusicPlaylistTracksLoadedAt: {},
  appleMusicPlaylistTracksLoading: {},
  appleMusicRecentlyAddedTracks: [],
  appleMusicRecentlyAddedLoadedAt: null,
  appleMusicRecentlyAddedLoading: false,
  appleMusicFavoriteTracks: [],
  appleMusicFavoriteTracksLoadedAt: null,
  appleMusicFavoritesLoading: false,
  appleMusicCurrentSongId: null,
  appleMusicPlaybackQueue: null,
  appleMusicLibraryLoadedAt: null,
  appleMusicLibraryLoading: false,
  appleMusicLibraryError: null,
  appleMusicStorefrontId: null,
  appleMusicKitNowPlaying: null,

  ipodMenuBreadcrumb: null,
  ipodMenuMode: null,
};

function normalizeAppleMusicPlaybackQueue(
  queue: string[] | null
): string[] | null {
  if (!queue) return null;
  const ids = queue.filter((id) => typeof id === "string" && id.length > 0);
  return ids.length > 0 ? ids : null;
}

export function resolveAppleMusicQueueTracks(
  state: Pick<IpodData, "appleMusicTracks" | "appleMusicPlaybackQueue">
): Track[] {
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
function getIndexFromSongId(tracks: Track[], songId: string | null): number {
  if (!songId || tracks.length === 0) return -1;
  const index = tracks.findIndex((t) => t.id === songId);
  return index >= 0 ? index : -1;
}

export interface IpodState extends IpodData {
  /** Set the current song by ID */
  setCurrentSongId: (songId: string | null) => void;
  /** Get the current track (computed from currentSongId) */
  getCurrentTrack: () => Track | null;
  /** Get the current track index (computed from currentSongId) */
  getCurrentIndex: () => number;
  toggleLoopCurrent: () => void;
  toggleLoopAll: () => void;
  toggleShuffle: () => void;
  togglePlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  toggleVideo: () => void;
  /** Set the display mode for visual background */
  setDisplayMode: (mode: DisplayMode) => void;
  toggleBacklight: () => void;
  toggleLcdFilter: () => void;
  toggleFullScreen: () => void;
  setTheme: (theme: "classic" | "black" | "u2") => void;
  /** Switch between the monochrome classic LCD and the iOS-6 modern skin. */
  setUiVariant: (variant: "classic" | "modern") => void;
  addTrack: (track: Track) => void;
  /** Remove one track from the library by id (e.g. TV playlist trash). */
  removeTrackById: (trackId: string) => void;
  clearLibrary: () => void;
  resetLibrary: () => Promise<void>;
  nextTrack: () => void;
  previousTrack: () => void;
  setShowVideo: (show: boolean) => void;
  toggleLyrics: () => void;
  /** Force refresh lyrics for current track */
  refreshLyrics: () => void;
  /** Clear all lyrics caches (lyrics, translation, furigana) and refetch */
  clearLyricsCache: () => void;
  /** Set the furigana map for current lyrics */
  setCurrentFuriganaMap: (map: Record<string, FuriganaSegment[]> | null) => void;
  /** Adjust the lyric offset (in ms) for the track at the given index. */
  adjustLyricOffset: (trackIndex: number, deltaMs: number) => void;
  /** Set the lyric offset (in ms) for the track at the given index to an absolute value. */
  setLyricOffset: (trackIndex: number, offsetMs: number) => void;
  /** Set lyrics alignment mode */
  setLyricsAlignment: (alignment: LyricsAlignment) => void;
  /** Set lyrics font style */
  setLyricsFont: (font: LyricsFont) => void;
  /** Set romanization settings */
  setRomanization: (settings: Partial<RomanizationSettings>) => void;
  /** Toggle master romanization on/off */
  toggleRomanization: () => void;
  /** Set the persistent translation language preference that persists across tracks */
  setLyricsTranslationLanguage: (language: string | null) => void;
  /** Import library from JSON string */
  importLibrary: (json: string) => void;
  /** Export library to JSON string */
  exportLibrary: () => string;
  /** Adds a track from a YouTube video ID or URL, fetching metadata automatically */
  addTrackFromVideoId: (urlOrId: string, autoPlay?: boolean) => Promise<Track | null>;
  /** Load the default library if no tracks exist */
  initializeLibrary: () => Promise<void>;

  /** Sync library with server - checks for updates and ensures all default tracks are present */
  syncLibrary: () => Promise<{
    newTracksAdded: number;
    tracksUpdated: number;
    totalTracks: number;
  }>;
  /** Set lyrics source override for a specific track */
  setTrackLyricsSource: (
    trackId: string,
    lyricsSource: LyricsSource | null
  ) => void;
  /** Clear lyrics source override for a specific track */
  clearTrackLyricsSource: (trackId: string) => void;
  /** Update current playback position (called from ReactPlayer progress) */
  setElapsedTime: (time: number) => void;
  /** Update total duration of current track (called from ReactPlayer) */
  setTotalTime: (time: number) => void;

  // ---------- Apple Music actions ----------

  /** Switch between the YouTube and Apple Music libraries. */
  setLibrarySource: (source: LibrarySource) => void;
  /** Replace the cached Apple Music library with the supplied tracks. */
  setAppleMusicTracks: (tracks: Track[]) => void;
  /**
   * Replace the cached Apple Music playlist list. When `loadedAt` is
   * omitted, the freshness timestamp is set to `Date.now()`. Pass an
   * explicit value (typically from IndexedDB) when hydrating from cache.
   */
  setAppleMusicPlaylists: (
    playlists: AppleMusicPlaylist[],
    loadedAt?: number | null
  ) => void;
  /** Cache tracks for one playlist and mark it fresh. */
  setAppleMusicPlaylistTracks: (playlistId: string, tracks: Track[]) => void;
  /** Mark a per-playlist track fetch as in-flight (or finished). */
  setAppleMusicPlaylistTracksLoading: (
    playlistId: string,
    loading: boolean
  ) => void;
  /**
   * Replace the cached "Recently Added" track list. When `loadedAt` is
   * omitted, the freshness timestamp is set to `Date.now()`. Pass an
   * explicit value when hydrating from IndexedDB.
   */
  setAppleMusicRecentlyAddedTracks: (
    tracks: Track[],
    loadedAt?: number | null
  ) => void;
  setAppleMusicRecentlyAddedLoading: (loading: boolean) => void;
  /** Same as the Recently Added setters, but for "Favorite Songs". */
  setAppleMusicFavoriteTracks: (
    tracks: Track[],
    loadedAt?: number | null
  ) => void;
  setAppleMusicFavoritesLoading: (loading: boolean) => void;
  /**
   * Optimistically prepend a track to the favorites list (used right
   * after `addAppleMusicTrackToFavorites` succeeds). Doesn't bump
   * `loadedAt` so the next opportunistic refresh still revalidates
   * against the server (catches the eventual catalog ↔ library mapping).
   */
  prependAppleMusicFavoriteTrack: (track: Track) => void;
  /** Mark a library load as in-flight (or finished). */
  setAppleMusicLibraryLoading: (loading: boolean) => void;
  /** Persist any error from the latest library fetch. */
  setAppleMusicLibraryError: (error: string | null) => void;
  /** Update the currently selected Apple Music song. */
  setAppleMusicCurrentSongId: (songId: string | null) => void;
  /**
   * Set or clear the Apple Music playback queue. Pass `null` to fall back
   * to the full library order for next/previous.
   */
  setAppleMusicPlaybackQueue: (queue: string[] | null) => void;
  /** Move to the next Apple Music track (respects shuffle/loop settings). */
  appleMusicNextTrack: () => void;
  /** Move to the previous Apple Music track (respects shuffle/loop). */
  appleMusicPreviousTrack: () => void;
  /** Cache the user's storefront for catalog API calls. */
  setAppleMusicStorefrontId: (storefrontId: string | null) => void;
  /** Live MusicKit now-playing snapshot (station / playlist queue air item). */
  setAppleMusicKitNowPlaying: (
    snapshot: AppleMusicKitNowPlaying | null
  ) => void;

  /** Persist the user's current menu navigation breadcrumb. */
  setIpodMenuBreadcrumb: (
    breadcrumb:
      | { title: string; displayTitle?: string; selectedIndex: number }[]
      | null
  ) => void;
  /** Persist whether the iPod was last in menu mode. */
  setIpodMenuMode: (menuMode: boolean | null) => void;
}

const CURRENT_IPOD_STORE_VERSION = 36; // Persist new uiVariant ("classic" | "modern") screen skin

// Helper function to get unplayed track IDs from history
function getUnplayedTrackIds(
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
function getRandomTrackIdAvoidingRecent(
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
function updatePlaybackHistory(
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
// DEBOUNCED LYRIC OFFSET SAVE
// ============================================================================

// Debounce timers for saving lyric offset (keyed by track ID)
const lyricOffsetSaveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

/**
 * Save lyric offset to server with debouncing.
 * Only saves if user is authenticated.
 * Allows updates for songs with empty createdBy (not shared by anyone).
 */
async function saveLyricOffsetToServer(
  trackId: string,
  lyricOffset: number
): Promise<boolean> {
  // Get auth state from chats store
  const { username, isAuthenticated } = useChatsStore.getState();
  
  // Skip if not authenticated
  if (!username || !isAuthenticated) {
    console.log(`[iPod Store] Skipping lyric offset save for ${trackId} - user not logged in`);
    return false;
  }

  console.log(`[iPod Store] Saving lyric offset for ${trackId}: ${lyricOffset}ms...`);
  
  try {
    const response = await abortableFetch(
      getApiUrl(`/api/songs/${encodeURIComponent(trackId)}`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lyricOffset,
        }),
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      }
    );

    if (response.status === 401) {
      console.warn(`[iPod Store] Unauthorized - user must be logged in to save lyric offset`);
      return false;
    }

    if (response.status === 403) {
      // Permission denied - song is owned by another user
      console.log(`[iPod Store] Cannot save lyric offset for ${trackId} - song owned by another user`);
      return false;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[iPod Store] Failed to save lyric offset for ${trackId}: ${response.status} - ${errorText}`);
      return false;
    }

    const data = await response.json();
    if (data.success) {
      console.log(`[iPod Store] ✓ Saved lyric offset for ${trackId}: ${lyricOffset}ms (by ${data.createdBy || username})`);
      return true;
    } else {
      console.warn(`[iPod Store] Server returned failure for ${trackId}:`, data);
      return false;
    }
  } catch (error) {
    console.error(`[iPod Store] Error saving lyric offset for ${trackId}:`, error);
    return false;
  }
}

// Store the last offset value for each track (to flush on demand)
const pendingLyricOffsets: Map<string, number> = new Map();

/**
 * Debounced wrapper for saving lyric offset.
 * Waits 2 seconds after the last change before saving.
 */
function debouncedSaveLyricOffset(trackId: string, lyricOffset: number): void {
  // Store the pending value
  pendingLyricOffsets.set(trackId, lyricOffset);
  
  // Clear any existing timer for this track
  const existingTimer = lyricOffsetSaveTimers.get(trackId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new timer
  const timer = setTimeout(() => {
    lyricOffsetSaveTimers.delete(trackId);
    pendingLyricOffsets.delete(trackId);
    saveLyricOffsetToServer(trackId, lyricOffset);
  }, 2000); // 2 second debounce

  lyricOffsetSaveTimers.set(trackId, timer);
}

/**
 * Immediately flush any pending lyric offset save for a track.
 * Call this when closing the sync mode to ensure changes are saved.
 * Returns a Promise that resolves when the save completes.
 */
export async function flushPendingLyricOffsetSave(trackId: string): Promise<void> {
  const existingTimer = lyricOffsetSaveTimers.get(trackId);
  const pendingOffset = pendingLyricOffsets.get(trackId);
  
  if (existingTimer && pendingOffset !== undefined) {
    // Clear the timer
    clearTimeout(existingTimer);
    lyricOffsetSaveTimers.delete(trackId);
    pendingLyricOffsets.delete(trackId);
    
    // Save immediately and wait for completion
    console.log(`[iPod Store] Flushing pending lyric offset save for ${trackId}: ${pendingOffset}ms`);
    await saveLyricOffsetToServer(trackId, pendingOffset);
  }
}

/**
 * Save lyrics source to server and clear translations/furigana.
 * Called when user selects a different lyrics source from search.
 * This clears cached translations and furigana since they're based on the old lyrics.
 */
async function saveLyricsSourceToServer(
  trackId: string,
  lyricsSource: LyricsSource | null
): Promise<void> {
  // Get auth state from chats store
  const { username, isAuthenticated } = useChatsStore.getState();
  
  // Skip if not authenticated
  if (!username || !isAuthenticated) {
    console.log(`[iPod Store] Skipping lyrics source save for ${trackId} - user not logged in`);
    return;
  }

  try {
    const response = await abortableFetch(
      getApiUrl(`/api/songs/${encodeURIComponent(trackId)}`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lyricsSource: lyricsSource || undefined,
          // Update song metadata from lyricsSource (KuGou has more accurate metadata)
          ...(lyricsSource && {
            title: lyricsSource.title,
            artist: lyricsSource.artist,
            album: lyricsSource.album,
          }),
          // Clear translations, furigana, and soramimi since lyrics changed
          clearTranslations: true,
          clearFurigana: true,
          clearSoramimi: true,
          clearLyrics: true,
        }),
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      }
    );

    if (response.status === 401) {
      console.warn(`[iPod Store] Unauthorized - user must be logged in to save lyrics source`);
      return;
    }

    if (response.status === 403) {
      // Permission denied - song is owned by another user
      console.log(`[iPod Store] Cannot save lyrics source for ${trackId} - song owned by another user`);
      return;
    }

    if (!response.ok) {
      console.warn(`[iPod Store] Failed to save lyrics source for ${trackId}: ${response.status}`);
      return;
    }

    const data = await response.json();
    console.log(`[iPod Store] Saved lyrics source for ${trackId}, cleared translations/furigana (by ${data.createdBy || username})`);
  } catch (error) {
    console.error(`[iPod Store] Error saving lyrics source for ${trackId}:`, error);
  }
}

export const useIpodStore = create<IpodState>()(
  persist(
    (set, get) => ({
      ...initialIpodData,
      // --- Actions ---
      setCurrentSongId: (songId) =>
        set((state) => {
          // Only update playback history if we're actually changing tracks
          if (songId !== state.currentSongId) {
            const newPlaybackHistory = state.currentSongId
              ? updatePlaybackHistory(state.playbackHistory, state.currentSongId)
              : state.playbackHistory;

            return {
              currentSongId: songId,
              playbackHistory: newPlaybackHistory,
              historyPosition: -1,
              currentLyrics: null, // Clear stale lyrics from previous song
              currentFuriganaMap: null, // Clear stale furigana from previous song
              // Snap playback position to the start of the new track so any
              // player wired to `elapsedTime` (e.g. AppleMusicPlayerBridge's
              // `resumeAtSeconds`) doesn't carry the previous song's offset
              // into the new song.
              elapsedTime: 0,
              totalTime: 0,
            };
          }
          return {};
        }),
      getCurrentTrack: () => {
        const state = get();
        if (!state.currentSongId) return state.tracks[0] ?? null;
        return state.tracks.find((t) => t.id === state.currentSongId) ?? null;
      },
      getCurrentIndex: () => {
        const state = get();
        return getIndexFromSongId(state.tracks, state.currentSongId);
      },
      toggleLoopCurrent: () =>
        set((state) => ({ loopCurrent: !state.loopCurrent })),
      toggleLoopAll: () => set((state) => ({ loopAll: !state.loopAll })),
      toggleShuffle: () =>
        set((state) => {
          const newShuffleState = !state.isShuffled;
          return {
            isShuffled: newShuffleState,
            // Clear playback history when turning shuffle on to start fresh
            playbackHistory: newShuffleState ? [] : state.playbackHistory,
            historyPosition: newShuffleState ? -1 : state.historyPosition,
          };
        }),
      togglePlay: () => {
        // Prevent playback when offline
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          return;
        }
        set((state) => ({ isPlaying: !state.isPlaying }));
      },
      setIsPlaying: (playing) => {
        // Prevent starting playback when offline
        if (playing && typeof navigator !== "undefined" && !navigator.onLine) {
          return;
        }
        set({ isPlaying: playing });
      },
      toggleVideo: () => {
        // Prevent turning on video when offline
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          return;
        }
        set((state) => ({ showVideo: !state.showVideo }));
      },
      setDisplayMode: (mode) => set({ displayMode: mode }),
      toggleBacklight: () =>
        set((state) => ({ backlightOn: !state.backlightOn })),
      toggleLcdFilter: () =>
        set((state) => ({ lcdFilterOn: !state.lcdFilterOn })),
      toggleFullScreen: () =>
        set((state) => ({ isFullScreen: !state.isFullScreen })),
      setTheme: (theme) => set({ theme }),
      setUiVariant: (variant) => set({ uiVariant: variant }),
      addTrack: (track) =>
        set((state) => ({
          tracks: [
            {
              ...track,
              createdAt: track.createdAt ?? Date.now(),
              importOrder: track.importOrder ?? 0,
              updatedAt: track.updatedAt ?? Date.now(),
            },
            ...state.tracks,
          ],
          currentSongId: track.id,
          currentLyrics: null,
          currentFuriganaMap: null,
          isPlaying: true,
          libraryState: "loaded",
          playbackHistory: [], // Clear playback history when adding new tracks
          historyPosition: -1,
        })),
      removeTrackById: (trackId) =>
        set((state) => {
          const idx = state.tracks.findIndex((t) => t.id === trackId);
          if (idx < 0) return {};
          const filtered = state.tracks.filter((t) => t.id !== trackId);
          let nextSongId = state.currentSongId;
          if (state.currentSongId === trackId) {
            if (filtered.length === 0) {
              nextSongId = null;
            } else {
              nextSongId = filtered[Math.min(idx, filtered.length - 1)]!.id;
            }
          }
          return {
            tracks: filtered,
            currentSongId: nextSongId,
            currentLyrics: null,
            currentFuriganaMap: null,
            isPlaying: filtered.length === 0 ? false : state.isPlaying,
            playbackHistory:
              filtered.length === 0
                ? []
                : state.playbackHistory.filter((id) => id !== trackId),
          };
        }),
      clearLibrary: () =>
        set({
          tracks: [],
          currentSongId: null,
          currentLyrics: null,
          currentFuriganaMap: null,
          isPlaying: false,
          libraryState: "cleared",
          playbackHistory: [],
          historyPosition: -1,
          elapsedTime: 0,
          totalTime: 0,
        }),
      resetLibrary: async () => {
        const { tracks, version } = await loadDefaultTracks();
        set({
          tracks,
          currentSongId: tracks[0]?.id ?? null,
          currentLyrics: null,
          currentFuriganaMap: null,
          isPlaying: false,
          libraryState: "loaded",
          lastKnownVersion: version,
          playbackHistory: [],
          historyPosition: -1,
          elapsedTime: 0,
          totalTime: 0,
        });
      },
      nextTrack: () =>
        set((state) => {
          if (state.tracks.length === 0)
            return {
              currentSongId: null,
              currentLyrics: null,
              currentFuriganaMap: null,
            };

          // Add current track to history before moving to next
          let newPlaybackHistory = state.playbackHistory;
          if (state.currentSongId && !state.loopCurrent) {
            newPlaybackHistory = updatePlaybackHistory(
              state.playbackHistory,
              state.currentSongId
            );
          }

          let nextSongId: string | null;

          if (state.loopCurrent) {
            // If looping current track, stay on the same track
            nextSongId = state.currentSongId;
          } else if (state.isShuffled) {
            // Shuffle mode: pick a random track avoiding recent ones
            nextSongId = getRandomTrackIdAvoidingRecent(
              state.tracks,
              newPlaybackHistory,
              state.currentSongId
            );
          } else {
            // Sequential mode
            const currentIndex = getIndexFromSongId(state.tracks, state.currentSongId);
            const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % state.tracks.length;

            // If we've reached the end and loop all is off, stop
            if (!state.loopAll && nextIndex === 0 && currentIndex !== -1) {
              const lastSongId =
                state.tracks[state.tracks.length - 1]?.id ?? null;
              const isSameTrack = lastSongId === state.currentSongId;
              return {
                currentSongId: lastSongId,
                currentLyrics: isSameTrack ? state.currentLyrics : null,
                currentFuriganaMap: isSameTrack ? state.currentFuriganaMap : null,
                isPlaying: false,
                ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
              };
            }
            nextSongId = state.tracks[nextIndex]?.id ?? null;
          }

          const isSameTrack = nextSongId === state.currentSongId;
          return {
            currentSongId: nextSongId,
            currentLyrics: isSameTrack ? state.currentLyrics : null,
            currentFuriganaMap: isSameTrack ? state.currentFuriganaMap : null,
            isPlaying: true,
            playbackHistory: newPlaybackHistory,
            historyPosition: -1, // Always reset to end when moving forward
            // Reset playback position so the new track starts at 0 instead
            // of inheriting the previous track's elapsedTime.
            ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
          };
        }),
      previousTrack: () =>
        set((state) => {
          if (state.tracks.length === 0)
            return {
              currentSongId: null,
              currentLyrics: null,
              currentFuriganaMap: null,
            };

          let prevSongId: string | null;
          let newPlaybackHistory = state.playbackHistory;

          if (state.isShuffled && state.playbackHistory.length > 0) {
            // In shuffle mode, go back to the last played track from history
            const lastTrackId = state.playbackHistory[state.playbackHistory.length - 1];
            const lastTrackExists = state.tracks.some((track) => track.id === lastTrackId);

            if (lastTrackExists && lastTrackId !== state.currentSongId) {
              // Found the previous track in history
              prevSongId = lastTrackId;
              // Remove it from history since we're going back to it
              newPlaybackHistory = state.playbackHistory.slice(0, -1);
            } else {
              // No valid history, pick a random track
              prevSongId = getRandomTrackIdAvoidingRecent(
                state.tracks,
                state.playbackHistory,
                state.currentSongId
              );
            }
          } else {
            // Sequential mode or no history
            const currentIndex = getIndexFromSongId(state.tracks, state.currentSongId);
            const prevIndex = currentIndex <= 0 
              ? state.tracks.length - 1 
              : currentIndex - 1;
            prevSongId = state.tracks[prevIndex]?.id ?? null;
          }

          const isSameTrack = prevSongId === state.currentSongId;
          return {
            currentSongId: prevSongId,
            currentLyrics: isSameTrack ? state.currentLyrics : null,
            currentFuriganaMap: isSameTrack ? state.currentFuriganaMap : null,
            isPlaying: true,
            playbackHistory: newPlaybackHistory,
            historyPosition: -1,
            // Reset playback position so the new track starts at 0 instead
            // of inheriting the previous track's elapsedTime.
            ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
          };
        }),
      setShowVideo: (show) => set({ showVideo: show }),
      toggleLyrics: () => {
        set((state) => ({ showLyrics: !state.showLyrics }));
        emitCloudSyncDomainChange("settings");
      },
      refreshLyrics: () =>
        set((state) => ({
          lyricsRefetchTrigger: state.lyricsRefetchTrigger + 1,
          currentLyrics: null,
          currentFuriganaMap: null,
        })),
      clearLyricsCache: () => {
        const state = get();
        const currentTrack = state.getCurrentTrack();
        
        // Clear server-side cache for translations, furigana, and soramimi
        if (currentTrack?.id) {
          abortableFetch(getApiUrl(`/api/songs/${currentTrack.id}`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "clear-cached-data",
              clearTranslations: true,
              clearFurigana: true,
              clearSoramimi: true,
            }),
            timeout: 15000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }).catch((err) => {
            console.error("[iPod Store] Failed to clear server cache:", err);
          });
        }
        
        // Clear local state and trigger refetch
        set((s) => ({
          lyricsRefetchTrigger: s.lyricsRefetchTrigger + 1,
          lyricsCacheBustTrigger: s.lyricsCacheBustTrigger + 1,
          currentLyrics: null,
          currentFuriganaMap: null,
        }));
      },
      setCurrentFuriganaMap: (map) => set({ currentFuriganaMap: map }),
      adjustLyricOffset: (trackIndex, deltaMs) => {
        // Validate before calling set() to avoid unnecessary state updates
        const state = get();
        const sourceTracks =
          state.librarySource === "appleMusic"
            ? state.appleMusicTracks
            : state.tracks;
        if (
          trackIndex < 0 ||
          trackIndex >= sourceTracks.length ||
          Number.isNaN(deltaMs)
        ) {
          return;
        }

        const current = sourceTracks[trackIndex];
        const newOffset = (current.lyricOffset || 0) + deltaMs;

        if (state.librarySource === "appleMusic") {
          set((s) => ({
            appleMusicTracks: s.appleMusicTracks.map((track, i) =>
              i === trackIndex ? { ...track, lyricOffset: newOffset } : track
            ),
          }));
        } else {
          set((s) => ({
            tracks: s.tracks.map((track, i) =>
              i === trackIndex ? { ...track, lyricOffset: newOffset } : track
            ),
          }));
        }

        // Persist server-side. The endpoint accepts both YouTube (11-char)
        // and Apple Music (`am:<id>`) keys via the relaxed validator.
        debouncedSaveLyricOffset(current.id, newOffset);
      },
      setLyricOffset: (trackIndex, offsetMs) => {
        // Validate before calling set() to avoid unnecessary state updates
        const state = get();
        const sourceTracks =
          state.librarySource === "appleMusic"
            ? state.appleMusicTracks
            : state.tracks;
        if (
          trackIndex < 0 ||
          trackIndex >= sourceTracks.length ||
          Number.isNaN(offsetMs)
        ) {
          return;
        }

        const trackId = sourceTracks[trackIndex].id;

        if (state.librarySource === "appleMusic") {
          set((s) => ({
            appleMusicTracks: s.appleMusicTracks.map((track, i) =>
              i === trackIndex ? { ...track, lyricOffset: offsetMs } : track
            ),
          }));
        } else {
          set((s) => ({
            tracks: s.tracks.map((track, i) =>
              i === trackIndex ? { ...track, lyricOffset: offsetMs } : track
            ),
          }));
        }

        debouncedSaveLyricOffset(trackId, offsetMs);
      },
      setLyricsAlignment: (alignment) => {
        if (get().lyricsAlignment === alignment) {
          return;
        }
        set({ lyricsAlignment: alignment });
        emitCloudSyncDomainChange("settings");
      },
      setLyricsFont: (font) => {
        if (get().lyricsFont === font) {
          return;
        }
        set({ lyricsFont: font });
        emitCloudSyncDomainChange("settings");
      },
      setRomanization: (settings) => {
        const nextRomanization = { ...get().romanization, ...settings };
        if (areRomanizationSettingsEqual(get().romanization, nextRomanization)) {
          return;
        }
        set({ romanization: nextRomanization });
        emitCloudSyncDomainChange("settings");
      },
      toggleRomanization: () => {
        set((state) => ({
          romanization: { ...state.romanization, enabled: !state.romanization.enabled },
        }));
        emitCloudSyncDomainChange("settings");
      },
      setLyricsTranslationLanguage: (language) => {
        if (get().lyricsTranslationLanguage === language) {
          return;
        }
        set({
          lyricsTranslationLanguage: language,
        });
        emitCloudSyncDomainChange("settings");
      },
      importLibrary: (json: string) => {
        try {
          const importedTracks = JSON.parse(json) as Track[];
          if (!Array.isArray(importedTracks)) {
            throw new Error("Invalid library format");
          }
          // Validate each track has required fields
          for (const track of importedTracks) {
            if (!track.id || !track.url || !track.title) {
              throw new Error("Invalid track format");
            }
          }
          set({
            tracks: importedTracks,
            currentSongId: importedTracks[0]?.id ?? null,
            currentLyrics: null,
            currentFuriganaMap: null,
            isPlaying: false,
            libraryState: "loaded",
            playbackHistory: [], // Clear playback history when importing library
            historyPosition: -1,
          });
        } catch (error) {
          console.error("Failed to import library:", error);
          throw error;
        }
      },
      exportLibrary: () => {
        const { tracks } = get();
        return JSON.stringify(tracks, null, 2);
      },
      initializeLibrary: async () => {
        const current = get();
        // Only initialize if the library is in uninitialized state
        if (current.libraryState === "uninitialized") {
          const { tracks, version } = await loadDefaultTracks();
          set({
            tracks,
            currentSongId: tracks[0]?.id ?? null,
            currentLyrics: null,
            currentFuriganaMap: null,
            libraryState: "loaded",
            lastKnownVersion: version,
            playbackHistory: [], // Clear playback history when initializing library
            historyPosition: -1,
          });
        }
      },
      addTrackFromVideoId: async (urlOrId: string, autoPlay: boolean = true): Promise<Track | null> => {
        // Extract video ID from various URL formats
        const extractVideoId = (input: string): string | null => {
          // If it's already a video ID (11 characters, alphanumeric + hyphens/underscores)
          if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
            return input;
          }

          try {
            const url = new URL(input);
            const publicOrigin = new URL(getAppPublicOrigin());
            const isRyosShareHost =
              url.hostname === "os.ryo.lu" ||
              url.host === publicOrigin.host ||
              (typeof window !== "undefined" &&
                url.host === window.location.host);

            // Handle ryOS share URLs like /ipod/:id or /karaoke/:id on any configured host
            if (
              isRyosShareHost &&
              (url.pathname.startsWith("/ipod/") || url.pathname.startsWith("/karaoke/"))
            ) {
              return url.pathname.split("/")[2] || null;
            }

            // Handle YouTube URLs
            if (
              url.hostname.includes("youtube.com") ||
              url.hostname.includes("youtu.be")
            ) {
              // Standard YouTube URL: youtube.com/watch?v=VIDEO_ID
              const vParam = url.searchParams.get("v");
              if (vParam) return vParam;

              // Short YouTube URL: youtu.be/VIDEO_ID
              if (url.hostname === "youtu.be") {
                return url.pathname.slice(1) || null;
              }

              // Embedded, shorts, or other YouTube formats
              const pathMatch = url.pathname.match(
                /\/(?:embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})/
              );
              if (pathMatch) return pathMatch[1];
            }

            return null;
          } catch {
            // Not a valid URL, might be just a video ID
            return /^[a-zA-Z0-9_-]{11}$/.test(input) ? input : null;
          }
        };

        const videoId = extractVideoId(urlOrId);
        if (!videoId) {
          throw new Error("Invalid YouTube URL or video ID");
        }

        // Check if track already exists in library - skip fetching metadata if so
        const existingTrack = get().tracks.find((track) => track.id === videoId);
        if (existingTrack) {
          console.log(`[iPod Store] Track ${videoId} already exists in library, skipping metadata fetch`);
          // Set as current track and optionally autoplay
          const currentState = get();
          const isSameTrack = currentState.currentSongId === videoId;
          set({
            currentSongId: videoId,
            currentLyrics: isSameTrack ? currentState.currentLyrics : null,
            currentFuriganaMap: isSameTrack
              ? currentState.currentFuriganaMap
              : null,
            isPlaying: autoPlay,
          });
          return existingTrack;
        }

        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // Check song metadata cache first before fetching from external APIs
        try {
          const cachedMetadata = await getCachedSongMetadata(videoId);
          if (cachedMetadata) {
            console.log(`[iPod Store] Using cached metadata for ${videoId}`);
            const newTrack: Track = {
              id: videoId,
              url: youtubeUrl,
              title: cachedMetadata.title,
              artist: cachedMetadata.artist,
              album: cachedMetadata.album,
              cover: cachedMetadata.cover,
              lyricOffset: cachedMetadata.lyricOffset ?? 500,
              lyricsSource: cachedMetadata.lyricsSource,
              createdAt: cachedMetadata.createdAt,
              importOrder: cachedMetadata.importOrder,
              updatedAt: cachedMetadata.updatedAt,
            };

            try {
              get().addTrack(newTrack);
              if (!autoPlay) {
                set({ isPlaying: false });
              }
              return newTrack;
            } catch (error) {
              console.error("Error adding track from cache to store:", error);
              return null;
            }
          }
        } catch (error) {
          console.warn(`[iPod Store] Failed to check song metadata cache for ${videoId}, falling back to API:`, error);
        }

        // Cache miss - fetch metadata from external APIs
        let rawTitle = `Video ID: ${videoId}`; // Default title
        let authorName: string | undefined = undefined; // Store author_name

        try {
          // Fetch oEmbed data
          const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
            youtubeUrl
          )}&format=json`;
          const oembedResponse = await abortableFetch(oembedUrl, {
            timeout: 15000,
            throwOnHttpError: false,
            credentials: "omit",
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          });

          if (oembedResponse.ok) {
            const oembedData = await oembedResponse.json();
            rawTitle = oembedData.title || rawTitle;
            authorName = oembedData.author_name; // Extract author_name
          } else {
            throw new Error(
              `Failed to fetch video info (${oembedResponse.status}). Please check the YouTube URL.`
            );
          }
        } catch (error) {
          console.error(`Error fetching oEmbed data for ${urlOrId}:`, error);
          throw error; // Re-throw to be handled by caller
        }

        const trackInfo = {
          title: rawTitle,
          artist: undefined as string | undefined,
          album: undefined as string | undefined,
          cover: undefined as string | undefined,
          lyricsSource: undefined as {
            hash: string;
            albumId: string | number;
            title: string;
            artist: string;
            album?: string;
          } | undefined,
        };

        // Single call to fetch-lyrics with returnMetadata: searches Kugou, fetches lyrics+cover, returns metadata
        // This consolidates search + fetch into one call
        try {
          const fetchResponse = await abortableFetch(
            getApiUrl(`/api/songs/${videoId}`),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "fetch-lyrics",
                title: rawTitle,
                returnMetadata: true,
              }),
              timeout: 15000,
              throwOnHttpError: false,
              retry: { maxAttempts: 1, initialDelayMs: 250 },
            }
          );

          if (fetchResponse.ok) {
            const fetchData = await fetchResponse.json();
            
            // Use metadata from server (Kugou source) if available
            if (fetchData.metadata?.lyricsSource) {
              const meta = fetchData.metadata;
              console.log(`[iPod Store] Got metadata from Kugou for ${videoId}:`, {
                title: meta.title,
                artist: meta.artist,
                cover: meta.cover,
              });
              
              trackInfo.title = meta.title || trackInfo.title;
              trackInfo.artist = meta.artist;
              trackInfo.album = meta.album;
              trackInfo.cover = meta.cover;
              trackInfo.lyricsSource = meta.lyricsSource;
            }
          }
        } catch (error) {
          console.warn(`[iPod Store] Failed to fetch lyrics for ${videoId}:`, error);
        }

        // If no Kugou match found (no lyricsSource), fall back to AI title parsing
        if (!trackInfo.lyricsSource) {
          console.log(`[iPod Store] No Kugou match for ${videoId}, falling back to AI parse`);
          try {
            // Call /api/parse-title
            const parseResponse = await abortableFetch(
              getApiUrl("/api/parse-title"),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: rawTitle,
                  author_name: authorName,
                }),
                timeout: 15000,
                throwOnHttpError: false,
                retry: { maxAttempts: 1, initialDelayMs: 250 },
              }
            );

            if (parseResponse.ok) {
              const parsedData = await parseResponse.json();
              trackInfo.title = parsedData.title || rawTitle;
              trackInfo.artist = parsedData.artist;
              trackInfo.album = parsedData.album;
            } else {
              console.warn(
                `Failed to parse title with AI (status: ${parseResponse.status}), using raw title from oEmbed/default.`
              );
            }
          } catch (error) {
            console.error("Error calling /api/parse-title:", error);
          }
        }

        const newTrack: Track = {
          id: videoId,
          url: youtubeUrl,
          title: trackInfo.title,
          artist: trackInfo.artist,
          album: trackInfo.album,
          cover: trackInfo.cover,
          lyricOffset: 500, // Default 500ms offset for new tracks
          lyricsSource: trackInfo.lyricsSource,
        };

        try {
          get().addTrack(newTrack); // Add track to the store
          // If autoPlay is false (e.g., for iOS), pause after adding
          if (!autoPlay) {
            set({ isPlaying: false });
          }
          return newTrack;
        } catch (error) {
          console.error("Error adding track to store:", error);
          return null;
        }
      },

      syncLibrary: async () => {
        try {
          // Force refresh to get latest tracks from server (bypass cache)
          const { tracks: serverTracks, version: serverVersion } =
            await loadDefaultTracks(true);
          const current = get();
          const wasEmpty = current.tracks.length === 0;

          // Create a map of server tracks by ID for efficient lookup
          const serverTrackMap = new Map(
            serverTracks.map((track) => [track.id, track])
          );

          let newTracksAdded = 0;
          let tracksUpdated = 0;

          // Process existing tracks: merge server timestamps + metadata when on server
          const updatedTracks = current.tracks.map((currentTrack) => {
            const serverTrack = serverTrackMap.get(currentTrack.id);
            if (serverTrack) {
              // Track exists on server, check if metadata needs updating
              const hasMetadataChanges =
                currentTrack.title !== serverTrack.title ||
                currentTrack.artist !== serverTrack.artist ||
                currentTrack.album !== serverTrack.album ||
                currentTrack.cover !== serverTrack.cover ||
                currentTrack.url !== serverTrack.url ||
                currentTrack.lyricOffset !== serverTrack.lyricOffset;

              // Check if we should update lyricsSource:
              // - Server has lyricsSource but user doesn't have one yet
              // - Server has a different lyricsSource (compare by hash)
              const shouldUpdateLyricsSource =
                serverTrack.lyricsSource && (
                  !currentTrack.lyricsSource ||
                  currentTrack.lyricsSource.hash !== serverTrack.lyricsSource.hash
                );

              const mergedCreatedAt = Math.max(
                currentTrack.createdAt ?? 0,
                serverTrack.createdAt ?? 0
              );
              const mergedUpdatedAt = Math.max(
                currentTrack.updatedAt ?? 0,
                serverTrack.updatedAt ?? 0
              );
              const mergedBase = {
                ...currentTrack,
                createdAt: mergedCreatedAt || undefined,
                updatedAt: mergedUpdatedAt || undefined,
                importOrder: serverTrack.importOrder ?? currentTrack.importOrder,
              };

              if (hasMetadataChanges || shouldUpdateLyricsSource) {
                tracksUpdated++;
                return {
                  ...mergedBase,
                  title: serverTrack.title,
                  artist: serverTrack.artist,
                  album: serverTrack.album,
                  cover: serverTrack.cover,
                  url: serverTrack.url,
                  lyricOffset: serverTrack.lyricOffset,
                  ...(shouldUpdateLyricsSource && {
                    lyricsSource: serverTrack.lyricsSource,
                  }),
                };
              }
              return mergedBase;
            }
            return currentTrack;
          });

          // Find tracks that are on the server but not in the user's library
          const existingIds = new Set(current.tracks.map((track) => track.id));
          const tracksToAdd = serverTracks.filter(
            (track) => !existingIds.has(track.id)
          );
          newTracksAdded = tracksToAdd.length;

          // Union then sort like GET /api/songs (newest first, then importOrder)
          let finalTracks = sortTracksLikeServerOrder([
            ...tracksToAdd,
            ...updatedTracks,
          ]);

          // Fetch metadata for tracks not in the default library
          // These are user-added tracks that might have updated metadata in Redis
          const tracksNotInDefaultLibrary = finalTracks.filter(
            (track) => !serverTrackMap.has(track.id)
          );

          if (tracksNotInDefaultLibrary.length > 0) {
            console.log(`[iPod Store] Fetching metadata for ${tracksNotInDefaultLibrary.length} tracks not in default library`);
            
            try {
              // Batch fetch metadata for tracks not in default library
              const idsToFetch = tracksNotInDefaultLibrary.map((t) => t.id).join(",");
              const response = await abortableFetch(
                getApiUrl(`/api/songs?ids=${encodeURIComponent(idsToFetch)}&include=metadata`),
                {
                  method: "GET",
                  headers: { "Content-Type": "application/json" },
                  timeout: 15000,
                  throwOnHttpError: false,
                  retry: { maxAttempts: 1, initialDelayMs: 250 },
                }
              );

              if (response.ok) {
                const data = await response.json();
                const fetchedSongs = data.songs || [];
                type FetchedSongMetadata = {
                  id: string;
                  title?: string;
                  artist?: string;
                  album?: string;
                  cover?: string;
                  lyricOffset?: number;
                  lyricsSource?: LyricsSource;
                  createdAt?: number;
                  importOrder?: number;
                  updatedAt?: number;
                };
                const fetchedMap = new Map<string, FetchedSongMetadata>(
                  fetchedSongs.map((s: FetchedSongMetadata) => [s.id, s])
                );

                // Update tracks with fetched metadata
                finalTracks = finalTracks.map((track) => {
                  const fetched = fetchedMap.get(track.id);
                  if (fetched) {
                    // Check if lyricsSource should be updated (new or different hash)
                    const shouldUpdateLyricsSource =
                      fetched.lyricsSource && (
                        !track.lyricsSource ||
                        track.lyricsSource.hash !== fetched.lyricsSource.hash
                      );

                    // Check if any metadata has changed
                    const hasChanges =
                      (fetched.title && fetched.title !== track.title) ||
                      (fetched.artist && fetched.artist !== track.artist) ||
                      (fetched.album && fetched.album !== track.album) ||
                      (fetched.cover && fetched.cover !== track.cover) ||
                      (fetched.lyricOffset !== undefined && fetched.lyricOffset !== track.lyricOffset) ||
                      shouldUpdateLyricsSource;

                    if (hasChanges) {
                      tracksUpdated++;
                      return {
                        ...track,
                        // Update with server metadata, preserving existing values if server doesn't have them
                        title: fetched.title || track.title,
                        artist: fetched.artist ?? track.artist,
                        album: fetched.album ?? track.album,
                        cover: fetched.cover ?? track.cover,
                        lyricOffset: fetched.lyricOffset ?? track.lyricOffset,
                        createdAt: Math.max(
                          track.createdAt ?? 0,
                          fetched.createdAt ?? 0
                        ) || undefined,
                        importOrder: fetched.importOrder ?? track.importOrder,
                        updatedAt: Math.max(
                          track.updatedAt ?? 0,
                          fetched.updatedAt ?? 0
                        ) || undefined,
                        // Update lyricsSource from server if it's new or different
                        ...(shouldUpdateLyricsSource && {
                          lyricsSource: fetched.lyricsSource,
                        }),
                      };
                    }
                  }
                  const mergedCreated = Math.max(
                    track.createdAt ?? 0,
                    fetched?.createdAt ?? 0
                  );
                  const mergedUpdated = Math.max(
                    track.updatedAt ?? 0,
                    fetched?.updatedAt ?? 0
                  );
                  return {
                    ...track,
                    createdAt: mergedCreated || undefined,
                    importOrder: fetched?.importOrder ?? track.importOrder,
                    updatedAt: mergedUpdated || undefined,
                  };
                });
              }
            } catch (error) {
              console.warn(`[iPod Store] Failed to fetch metadata for user tracks:`, error);
            }
          }

          finalTracks = sortTracksLikeServerOrder(finalTracks);

          const orderChanged =
            finalTracks.length !== current.tracks.length ||
            finalTracks.some((t, i) => t.id !== current.tracks[i]?.id);

          // Update store if there were any changes
          if (newTracksAdded > 0 || tracksUpdated > 0 || orderChanged) {
            const nextCurrentSongId =
              wasEmpty && finalTracks.length > 0
                ? finalTracks[0]?.id ?? null
                : current.currentSongId;
            const isSameTrack = nextCurrentSongId === current.currentSongId;
            set({
              tracks: finalTracks,
              lastKnownVersion: serverVersion,
              libraryState: "loaded",
              // If library was empty and we added tracks, set first song as current
              currentSongId: nextCurrentSongId,
              currentLyrics: isSameTrack ? current.currentLyrics : null,
              currentFuriganaMap: isSameTrack ? current.currentFuriganaMap : null,
              // Reset playing state if we're setting a new current track
              isPlaying:
                wasEmpty && finalTracks.length > 0 ? false : current.isPlaying,
            });
          } else {
            // Even if no changes, update the version and state
            set({
              lastKnownVersion: serverVersion,
              libraryState: "loaded",
            });
          }

          return {
            newTracksAdded,
            tracksUpdated,
            totalTracks: finalTracks.length,
          };
        } catch (error) {
          console.error("Error syncing library:", error);
          throw error;
        }
      },
      setTrackLyricsSource: (trackId, lyricsSource) => {
        set((state) => {
          const tracks = state.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  lyricsSource: lyricsSource || undefined,
                  // Update track metadata from lyricsSource (KuGou has more accurate metadata)
                  ...(lyricsSource && {
                    title: lyricsSource.title,
                    artist: lyricsSource.artist,
                    album: lyricsSource.album || track.album,
                  }),
                }
              : track
          );
          return { tracks };
        });
        
        // Save to server and clear translations/furigana
        saveLyricsSourceToServer(trackId, lyricsSource);
      },
      clearTrackLyricsSource: (trackId) => {
        set((state) => {
          const tracks = state.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  lyricsSource: undefined,
                }
              : track
          );
          return { tracks };
        });
        
        // Save to server (clearing the source) and clear translations/furigana
        saveLyricsSourceToServer(trackId, null);
      },
      setElapsedTime: (time) => set({ elapsedTime: time }),
      setTotalTime: (time) => set({ totalTime: time }),

      // -----------------------------------------------------------------
      // Apple Music actions
      // -----------------------------------------------------------------
      setLibrarySource: (source) => {
        if (get().librarySource === source) return;
        // Pause and reset transient playback state so the YouTube /
        // Apple Music players don't fight for the audio element when
        // we hot-swap libraries.
        set({
          librarySource: source,
          isPlaying: false,
          elapsedTime: 0,
          totalTime: 0,
          currentLyrics: null,
          currentFuriganaMap: null,
          appleMusicKitNowPlaying: null,
        });
      },
      setAppleMusicTracks: (tracks) => {
        const loadedAt = Date.now();
        let storefrontIdAtSave: string | null = null;
        let tracksToSave = tracks;
        set((state) => {
          const incomingIds = new Set(tracks.map((track) => track.id));
          const previousTracksById = new Map(
            state.appleMusicTracks.map((track) => [track.id, track] as const)
          );
          const retainedQueueTracks = (
            normalizeAppleMusicPlaybackQueue(state.appleMusicPlaybackQueue) ?? []
          ).reduce<Track[]>((acc, id) => {
            const track = previousTracksById.get(id);
            if (track !== undefined && !incomingIds.has(track.id)) {
              acc.push(track);
            }
            return acc;
          }, []);
          const currentTrack =
            state.appleMusicCurrentSongId &&
            !incomingIds.has(state.appleMusicCurrentSongId)
              ? previousTracksById.get(state.appleMusicCurrentSongId)
              : null;
          const retainedTracksById = new Map<string, Track>();
          for (const track of retainedQueueTracks) {
            retainedTracksById.set(track.id, track);
          }
          if (currentTrack) {
            retainedTracksById.set(currentTrack.id, currentTrack);
          }
          const nextTracks = [...tracks, ...retainedTracksById.values()];
          const validIds = new Set(nextTracks.map((track) => track.id));
          const stillValidCurrent =
            state.appleMusicCurrentSongId &&
            validIds.has(state.appleMusicCurrentSongId)
              ? state.appleMusicCurrentSongId
              : nextTracks[0]?.id ?? null;
          storefrontIdAtSave = state.appleMusicStorefrontId;
          tracksToSave = nextTracks;
          return {
            appleMusicTracks: nextTracks,
            appleMusicCurrentSongId: stillValidCurrent,
            appleMusicLibraryLoadedAt: loadedAt,
            appleMusicLibraryLoading: false,
            appleMusicLibraryError: null,
          };
        });
        tracksToSave = tracksToSave.filter(
          (track) => !isAppleMusicCollectionTrack(track)
        );
        // Persist to IndexedDB so the next mount can re-hydrate without
        // a network round-trip. Fire-and-forget — failures are logged
        // by the cache helper and the in-memory copy still works.
        void saveAppleMusicLibrary({
          tracks: tracksToSave,
          loadedAt,
          storefrontId: storefrontIdAtSave,
        });
      },
      setAppleMusicPlaylists: (playlists, loadedAt) =>
        set({
          appleMusicPlaylists: playlists,
          // `null` is reserved for "never synced". When the caller doesn't
          // pass a timestamp, treat this as a fresh sync (default behavior
          // for opportunistic / foreground refresh paths).
          appleMusicPlaylistsLoadedAt:
            loadedAt === undefined ? Date.now() : loadedAt,
        }),
      setAppleMusicPlaylistTracks: (playlistId, tracks) =>
        set((state) => ({
          appleMusicPlaylistTracks: {
            ...state.appleMusicPlaylistTracks,
            [playlistId]: tracks,
          },
          appleMusicPlaylistTracksLoadedAt: {
            ...state.appleMusicPlaylistTracksLoadedAt,
            [playlistId]: Date.now(),
          },
          appleMusicPlaylistTracksLoading: {
            ...state.appleMusicPlaylistTracksLoading,
            [playlistId]: false,
          },
        })),
      setAppleMusicPlaylistTracksLoading: (playlistId, loading) =>
        set((state) => ({
          appleMusicPlaylistTracksLoading: {
            ...state.appleMusicPlaylistTracksLoading,
            [playlistId]: loading,
          },
        })),
      setAppleMusicRecentlyAddedTracks: (tracks, loadedAt) =>
        set({
          appleMusicRecentlyAddedTracks: tracks,
          appleMusicRecentlyAddedLoadedAt:
            loadedAt === undefined ? Date.now() : loadedAt,
          appleMusicRecentlyAddedLoading: false,
        }),
      setAppleMusicRecentlyAddedLoading: (loading) =>
        set({ appleMusicRecentlyAddedLoading: loading }),
      setAppleMusicFavoriteTracks: (tracks, loadedAt) =>
        set({
          appleMusicFavoriteTracks: tracks,
          appleMusicFavoriteTracksLoadedAt:
            loadedAt === undefined ? Date.now() : loadedAt,
          appleMusicFavoritesLoading: false,
        }),
      setAppleMusicFavoritesLoading: (loading) =>
        set({ appleMusicFavoritesLoading: loading }),
      prependAppleMusicFavoriteTrack: (track) =>
        set((state) => ({
          appleMusicFavoriteTracks: [
            track,
            ...state.appleMusicFavoriteTracks.filter((t) => t.id !== track.id),
          ],
        })),
      setAppleMusicLibraryLoading: (loading) =>
        set({ appleMusicLibraryLoading: loading }),
      setAppleMusicLibraryError: (error) =>
        set({
          appleMusicLibraryError: error,
          appleMusicLibraryLoading: false,
        }),
      setAppleMusicCurrentSongId: (songId) =>
        set((state) => {
          if (state.appleMusicCurrentSongId === songId) return {};
          // Reset transient progress + lyrics whenever the active track changes.
          return {
            appleMusicCurrentSongId: songId,
            appleMusicKitNowPlaying: null,
            currentLyrics: null,
            currentFuriganaMap: null,
            elapsedTime: 0,
            totalTime: 0,
          };
        }),
      setAppleMusicPlaybackQueue: (queue) =>
        set({
          appleMusicPlaybackQueue: normalizeAppleMusicPlaybackQueue(queue),
        }),
      appleMusicNextTrack: () =>
        set((state) => {
          // Resolve the active queue: when a contextual queue is set
          // (e.g. user opened an Artist / Album / Playlist and tapped a
          // song), step through that ordered list. Otherwise fall back
          // to the full library so behaviour matches the old menu flow.
          const queueTracks = resolveAppleMusicQueueTracks(state);

          if (queueTracks.length === 0) {
            return {
              appleMusicCurrentSongId: null,
              currentLyrics: null,
              currentFuriganaMap: null,
            };
          }

          let nextSongId: string | null;

          if (state.loopCurrent) {
            nextSongId = state.appleMusicCurrentSongId;
          } else if (state.isShuffled) {
            // Lightweight shuffle — avoid the current track when possible.
            const others = queueTracks.filter(
              (t) => t.id !== state.appleMusicCurrentSongId
            );
            const pool = others.length > 0 ? others : queueTracks;
            nextSongId = pool[Math.floor(Math.random() * pool.length)]?.id ?? null;
          } else {
            const currentIndex = queueTracks.findIndex(
              (t) => t.id === state.appleMusicCurrentSongId
            );
            const nextIndex =
              currentIndex === -1
                ? 0
                : (currentIndex + 1) % queueTracks.length;
            if (!state.loopAll && nextIndex === 0 && currentIndex !== -1) {
              const lastSongId =
                queueTracks[queueTracks.length - 1]?.id ?? null;
              const isSameTrack = lastSongId === state.appleMusicCurrentSongId;
              return {
                appleMusicCurrentSongId: lastSongId,
                isPlaying: false,
                ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
              };
            }
            nextSongId = queueTracks[nextIndex]?.id ?? null;
          }

          const isSameTrack = nextSongId === state.appleMusicCurrentSongId;
          return {
            appleMusicCurrentSongId: nextSongId,
            currentLyrics: isSameTrack ? state.currentLyrics : null,
            currentFuriganaMap: isSameTrack ? state.currentFuriganaMap : null,
            isPlaying: true,
            // Reset playback position so the new track starts at 0 instead
            // of inheriting the previous track's elapsedTime — otherwise the
            // AppleMusicPlayerBridge resumes the new song from the previous
            // song's current time (visible as a mid-song start in Apple
            // Music mode).
            ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
          };
        }),
      appleMusicPreviousTrack: () =>
        set((state) => {
          const queueTracks = resolveAppleMusicQueueTracks(state);

          if (queueTracks.length === 0) {
            return {
              appleMusicCurrentSongId: null,
              currentLyrics: null,
              currentFuriganaMap: null,
            };
          }

          let prevSongId: string | null;

          if (state.isShuffled) {
            const others = queueTracks.filter(
              (t) => t.id !== state.appleMusicCurrentSongId
            );
            const pool = others.length > 0 ? others : queueTracks;
            prevSongId = pool[Math.floor(Math.random() * pool.length)]?.id ?? null;
          } else {
            const currentIndex = queueTracks.findIndex(
              (t) => t.id === state.appleMusicCurrentSongId
            );
            const prevIndex =
              currentIndex <= 0 ? queueTracks.length - 1 : currentIndex - 1;
            prevSongId = queueTracks[prevIndex]?.id ?? null;
          }

          const isSameTrack = prevSongId === state.appleMusicCurrentSongId;
          return {
            appleMusicCurrentSongId: prevSongId,
            currentLyrics: isSameTrack ? state.currentLyrics : null,
            currentFuriganaMap: isSameTrack ? state.currentFuriganaMap : null,
            isPlaying: true,
            // Reset playback position so the new track starts at 0 instead
            // of inheriting the previous track's elapsedTime.
            ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
          };
        }),
      setAppleMusicStorefrontId: (storefrontId) =>
        set({ appleMusicStorefrontId: storefrontId }),
      setAppleMusicKitNowPlaying: (snapshot) =>
        set({ appleMusicKitNowPlaying: snapshot }),
      setIpodMenuBreadcrumb: (breadcrumb) =>
        set({ ipodMenuBreadcrumb: breadcrumb }),
      setIpodMenuMode: (menuMode) => set({ ipodMenuMode: menuMode }),
    }),
    {
      name: "ryos:ipod", // Unique name for localStorage persistence
      version: CURRENT_IPOD_STORE_VERSION, // Set the current version
      partialize: (state) => ({
        tracks: state.tracks,
        currentSongId: state.currentSongId,
        loopAll: state.loopAll,
        loopCurrent: state.loopCurrent,
        isShuffled: state.isShuffled,
        theme: state.theme,
        uiVariant: state.uiVariant,
        lcdFilterOn: state.lcdFilterOn,
        showLyrics: state.showLyrics,
        lyricsAlignment: state.lyricsAlignment,
        lyricsFont: state.lyricsFont,
        displayMode: state.displayMode,
        // NOTE: koreanDisplay and japaneseFurigana removed from persistence
        // They are deprecated and migrated to romanization settings
        romanization: state.romanization,
        lyricsTranslationLanguage: state.lyricsTranslationLanguage,
        isFullScreen: state.isFullScreen,
        libraryState: state.libraryState,
        lastKnownVersion: state.lastKnownVersion,
        // Apple Music: persist user choice, last-played track, and the
        // compact contextual queue id list. The library itself goes to
        // IndexedDB (see `appleMusicLibraryCache`) because it can easily
        // exceed localStorage's 5–10MB per-origin quota for users with
        // large libraries. The hook re-hydrates `appleMusicTracks` on mount.
        librarySource: state.librarySource,
        appleMusicCurrentSongId: state.appleMusicCurrentSongId,
        appleMusicPlaybackQueue: state.appleMusicPlaybackQueue,
        // Persist navigation breadcrumb so reopening the iPod returns the
        // user to the same menu (and cursor position) they left.
        ipodMenuBreadcrumb: state.ipodMenuBreadcrumb,
        ipodMenuMode: state.ipodMenuMode,
      }),
      migrate: (persistedState, version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let state = persistedState as any;

        // Migrate liquid -> water (Liquid display mode removed, replaced by Water)
        if (state.displayMode === "liquid") {
          state.displayMode = "water";
        }

        // If the persisted version is older than the current version, update defaults
        if (version < CURRENT_IPOD_STORE_VERSION) {
          console.log(
            `Migrating iPod store from version ${version} to ${CURRENT_IPOD_STORE_VERSION}`
          );
          
          // Migrate old romanization settings to new unified format
          const oldJapaneseFurigana = state.japaneseFurigana as string | undefined;
          
          const romanization: RomanizationSettings = state.romanization ?? {
            enabled: true,
            japaneseFurigana: oldJapaneseFurigana === JapaneseFurigana.On || oldJapaneseFurigana === "on" || oldJapaneseFurigana === undefined,
            japaneseRomaji: false,
            korean: true,
            chinese: false,
            soramimi: false,
            soramamiTargetLanguage: "zh-TW",
            pronunciationOnly: false,
          };
          
          // Migrate old chineseSoramimi/soramimi to new unified soramimi + soramamiTargetLanguage
          if (state.romanization) {
            const oldChineseSoramimi = state.romanization.chineseSoramimi;
            const oldEnglishSoramimi = state.romanization.soramimi;
            
            // If either old flag was enabled, enable new soramimi and set appropriate target
            if (oldChineseSoramimi || oldEnglishSoramimi) {
              state.romanization.soramimi = true;
              // Prefer English if it was enabled, otherwise Chinese
              state.romanization.soramamiTargetLanguage = oldEnglishSoramimi ? "en" : "zh-TW";
            } else {
              state.romanization.soramimi = state.romanization.soramimi ?? false;
              state.romanization.soramamiTargetLanguage = state.romanization.soramamiTargetLanguage ?? "zh-TW";
            }
            // Remove old properties
            delete state.romanization.chineseSoramimi;
          }
          
          // Ensure existing romanization settings have pronunciationOnly
          if (state.romanization && state.romanization.pronunciationOnly === undefined) {
            state.romanization.pronunciationOnly = false;
          }

          // Turn on Korean romanization for all users upgrading to this version (new default)
          if (state.romanization && state.romanization.korean === false) {
            state.romanization.korean = true;
          }

          const shouldUpgradeLegacyDefaultLyricsFont =
            version < 31 &&
            (state.lyricsFont === undefined || state.lyricsFont === LyricsFont.Serif);

          // Migrate currentIndex to currentSongId (will be null, library will re-initialize)
          state = {
            ...state,
            tracks: [],
            currentSongId: null, // Reset - library will re-initialize
            isPlaying: false,
            isShuffled: state.isShuffled,
            showLyrics: state.showLyrics ?? true,
            lyricsAlignment: state.lyricsAlignment ?? LyricsAlignment.Alternating,
            lyricsFont: shouldUpgradeLegacyDefaultLyricsFont
              ? LyricsFont.SansSerif
              : state.lyricsFont ?? LyricsFont.SansSerif,
            displayMode: state.displayMode ?? DisplayMode.Video,
            koreanDisplay: state.koreanDisplay ?? KoreanDisplay.Original,
            japaneseFurigana: state.japaneseFurigana ?? JapaneseFurigana.On,
            romanization,
            lyricsTranslationLanguage: state.lyricsTranslationLanguage ?? LYRICS_TRANSLATION_AUTO,
            libraryState: "uninitialized" as LibraryState,
            lastKnownVersion: state.lastKnownVersion ?? 0,
          };
        }

        return {
          tracks: state.tracks,
          currentSongId: state.currentSongId,
          loopAll: state.loopAll,
          loopCurrent: state.loopCurrent,
          isShuffled: state.isShuffled,
          theme: state.theme,
          uiVariant:
            state.uiVariant === "modern" || state.uiVariant === "classic"
              ? state.uiVariant
              : "modern",
          lcdFilterOn: state.lcdFilterOn,
          showLyrics: state.showLyrics,
          lyricsAlignment: state.lyricsAlignment,
          lyricsFont: state.lyricsFont,
          displayMode: state.displayMode ?? DisplayMode.Video,
          koreanDisplay: state.koreanDisplay,
          japaneseFurigana: state.japaneseFurigana,
          romanization: state.romanization ?? initialIpodData.romanization,
          lyricsTranslationLanguage: state.lyricsTranslationLanguage,
          isFullScreen: state.isFullScreen,
          libraryState: state.libraryState,
          librarySource:
            (state.librarySource as LibrarySource) ?? "youtube",
          appleMusicCurrentSongId: state.appleMusicCurrentSongId ?? null,
          ipodMenuBreadcrumb: Array.isArray(state.ipodMenuBreadcrumb)
            ? state.ipodMenuBreadcrumb
            : null,
          ipodMenuMode:
            typeof state.ipodMenuMode === "boolean"
              ? state.ipodMenuMode
              : null,
        } as IpodState;
      },
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error("Error rehydrating iPod store:", error);
          } else if (state && state.libraryState === "uninitialized") {
            // Only auto-initialize if library state is uninitialized
            Promise.resolve(state.initializeLibrary()).catch((err) =>
              console.error("Initialization failed on rehydrate", err)
            );
          }
        };
      },
    }
  )
);

/**
 * Resolves the effective translation language.
 * If the stored value is "auto", returns the current ryOS locale language.
 * If null, returns null (meaning no translation / "Original").
 * Otherwise returns the stored language code.
 */
export function getEffectiveTranslationLanguage(storedValue: string | null): string | null {
  if (storedValue === LYRICS_TRANSLATION_AUTO) {
    return i18n.language;
  }
  return storedValue;
}

// ---------------------------------------------------------------------------
// HMR state preservation
//
// `partialize` deliberately excludes the Apple Music collections (they live in
// IndexedDB to escape localStorage's 5–10MB quota) along with a handful of
// transient runtime fields. That works fine for full page reloads — the
// `useAppleMusicLibrary` hook re-hydrates from IndexedDB on mount.
//
// Vite HMR is different: any edit to a file imported (transitively) by this
// store cascades invalidation through us, re-running `create()` with
// `initialIpodData` and wiping every non-`partialize`d field. The
// `useAppleMusicLibrary` subscriber will refill from IndexedDB on the next
// pass, but the user still sees a brief flash of empty library. Preserve the
// in-memory snapshot across HMR so the swap is invisible.
// ---------------------------------------------------------------------------
if (import.meta.hot) {
  const HMR_KEY = "ipodStoreSnapshot";
  const previousSnapshot = (
    import.meta.hot.data as { [HMR_KEY]?: Partial<IpodData> }
  )[HMR_KEY];
  if (previousSnapshot) {
    useIpodStore.setState(previousSnapshot);
  }
  import.meta.hot.dispose((data) => {
    const s = useIpodStore.getState();
    // Snapshot only data fields — not actions. The new module ships its own
    // action references; keeping the old ones would silently use stale
    // closures whenever the store implementation changes.
    const snapshot: Partial<IpodData> = {
      tracks: s.tracks,
      currentSongId: s.currentSongId,
      libraryState: s.libraryState,
      lastKnownVersion: s.lastKnownVersion,
      playbackHistory: s.playbackHistory,
      historyPosition: s.historyPosition,
      librarySource: s.librarySource,
      appleMusicTracks: s.appleMusicTracks,
      appleMusicPlaylists: s.appleMusicPlaylists,
      appleMusicPlaylistsLoadedAt: s.appleMusicPlaylistsLoadedAt,
      appleMusicPlaylistTracks: s.appleMusicPlaylistTracks,
      appleMusicPlaylistTracksLoadedAt: s.appleMusicPlaylistTracksLoadedAt,
      appleMusicPlaylistTracksLoading: {},
      appleMusicRecentlyAddedTracks: s.appleMusicRecentlyAddedTracks,
      appleMusicRecentlyAddedLoadedAt: s.appleMusicRecentlyAddedLoadedAt,
      appleMusicRecentlyAddedLoading: false,
      appleMusicFavoriteTracks: s.appleMusicFavoriteTracks,
      appleMusicFavoriteTracksLoadedAt: s.appleMusicFavoriteTracksLoadedAt,
      appleMusicFavoritesLoading: false,
      appleMusicCurrentSongId: s.appleMusicCurrentSongId,
      appleMusicPlaybackQueue: s.appleMusicPlaybackQueue,
      appleMusicLibraryLoadedAt: s.appleMusicLibraryLoadedAt,
      appleMusicLibraryError: s.appleMusicLibraryError,
      appleMusicStorefrontId: s.appleMusicStorefrontId,
      ipodMenuBreadcrumb: s.ipodMenuBreadcrumb,
      ipodMenuMode: s.ipodMenuMode,
    };
    (data as { [HMR_KEY]?: Partial<IpodData> })[HMR_KEY] = snapshot;
  });
}
