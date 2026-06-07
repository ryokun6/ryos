import {
  LyricsAlignment,
  KoreanDisplay,
  JapaneseFurigana,
  LyricsFont,
  RomanizationSettings,
  DisplayMode,
} from "@/types/lyrics";
import { LyricLine } from "@/types/lyrics";
import type { FuriganaSegment } from "@/utils/romanization";

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

export const IPOD_BACKLIGHT_TIMEOUT_OPTIONS = ["2s", "10s", "always-on", "off"] as const;
export type IpodBacklightTimeout = (typeof IPOD_BACKLIGHT_TIMEOUT_OPTIONS)[number];

/** User playlist from the Apple Music library. */
export interface AppleMusicPlaylist {
  id: string;
  globalId?: string;
  name: string;
  artworkUrl?: string;
  /** Editorial / user-visible description when the API supplies one. */
  description?: string;
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
  /** Cached boosted cover color for lyrics/title glow */
  coverColor?: string;
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

export type LibraryState = "uninitialized" | "loaded" | "cleared";

export const CURRENT_IPOD_STORE_VERSION = 40; // Default fullscreen/Karaoke lyrics style is Gold Glow

export interface IpodData {
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
  backlightTimeout: IpodBacklightTimeout;
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
  /** True while the Apple Music playlist *list* refresh is in flight.
   *  Drives the titlebar activity indicator on the Playlists menu so
   *  the user sees a spinner while the list is syncing (even when a
   *  cached list is already on screen, e.g. an opportunistic refresh). */
  appleMusicPlaylistsLoading: boolean;
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
    | {
        kind?: import("@/apps/ipod/types").IpodMenuKind;
        id?: string;
        title: string;
        displayTitle?: string;
        selectedIndex: number;
        modernMediaList?: boolean;
        /**
         * Mirrors {@link MenuHistoryEntry.alphabetic} so the wheel's
         * fast scroll-by-letter affordance survives reopening the
         * iPod at a deep menu level (Artists, Albums, the new All
         * Songs / Songs flows).
         */
        alphabetic?: boolean;
      }[]
    | null;
  /**
   * Whether the iPod was last in menu mode (true) or Now Playing mode
   * (false). Restored on open so reopening returns the user to the same
   * surface they left from.
   */
  ipodMenuMode: boolean | null;
}

export const initialIpodData: IpodData = {
  tracks: [],
  currentSongId: null,
  loopCurrent: false,
  loopAll: true,
  isShuffled: true,
  isPlaying: false,
  showVideo: false,
  displayMode: DisplayMode.Video,
  backlightOn: true,
  backlightTimeout: "2s",
  theme: "classic",
  uiVariant: "modern",
  lcdFilterOn: true,
  showLyrics: true,
  lyricsAlignment: LyricsAlignment.Alternating,
  lyricsFont: LyricsFont.GoldGlow,
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
  appleMusicPlaylistsLoading: false,
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
  setBacklightTimeout: (timeout: IpodBacklightTimeout) => void;
  toggleLcdFilter: () => void;
  toggleFullScreen: () => void;
  setTheme: (theme: "classic" | "black" | "u2") => void;
  /** Switch between the monochrome classic LCD and the iOS-6 modern skin. */
  setUiVariant: (variant: "classic" | "modern") => void;
  addTrack: (track: Track) => void;
  /** Cache a resolved cover glow color on any local copy of a track. */
  setTrackCoverColor: (trackId: string, coverColor: string) => void;
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
  adjustLyricOffset: (
    trackIndex: number,
    deltaMs: number,
    library?: IpodLibrarySelection
  ) => void;
  /** Set the lyric offset (in ms) for the track at the given index to an absolute value. */
  setLyricOffset: (
    trackIndex: number,
    offsetMs: number,
    library?: IpodLibrarySelection
  ) => void;
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
  /** Toggle the in-flight flag for the Apple Music playlist *list* refresh. */
  setAppleMusicPlaylistsLoading: (loading: boolean) => void;
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
      | {
          title: string;
          displayTitle?: string;
          selectedIndex: number;
          modernMediaList?: boolean;
          alphabetic?: boolean;
        }[]
      | null
  ) => void;
  /** Persist whether the iPod was last in menu mode. */
  setIpodMenuMode: (menuMode: boolean | null) => void;
}

export interface IpodChatContextTrack {
  id: string;
  url?: string;
  title: string;
  artist?: string;
  album?: string;
  source: LibrarySource;
}

export type IpodLibrarySelection = LibrarySource | "active";

export type IpodSet = (
  partial:
    | Partial<IpodState>
    | ((state: IpodState) => Partial<IpodState>)
) => void;

export type IpodGet = () => IpodState;
