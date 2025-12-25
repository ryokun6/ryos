import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LyricsAlignment, ChineseVariant, KoreanDisplay, JapaneseFurigana, LyricsFont, RomanizationSettings } from "@/types/lyrics";
import { LyricLine } from "@/types/lyrics";
import type { FuriganaSegment } from "@/utils/romanization";
import { getApiUrl } from "@/utils/platform";
import { getCachedSongMetadata, listAllCachedSongMetadata } from "@/utils/songMetadataCache";
import i18n from "@/lib/i18n";

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

// Define the Track type (can be shared or defined here)
export interface Track {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  /** Offset in milliseconds to adjust lyrics timing for this track (positive = lyrics earlier) */
  lyricOffset?: number;
  /** Selected lyrics source from Kugou (user override) */
  lyricsSource?: LyricsSource;
}

type LibraryState = "uninitialized" | "loaded" | "cleared";

interface IpodData {
  tracks: Track[];
  currentIndex: number;
  loopCurrent: boolean;
  loopAll: boolean;
  isShuffled: boolean;
  isPlaying: boolean;
  showVideo: boolean;
  backlightOn: boolean;
  theme: "classic" | "black" | "u2";
  lcdFilterOn: boolean;
  showLyrics: boolean;
  lyricsAlignment: LyricsAlignment;
  lyricsFont: LyricsFont;
  chineseVariant: ChineseVariant;
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
}

// ============================================================================
// CACHING FOR iPod TRACKS
// ============================================================================

// In-memory cache for iPod tracks data
let cachedIpodData: { tracks: Track[]; version: number } | null = null;
let ipodDataPromise: Promise<{ tracks: Track[]; version: number }> | null = null;

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
        lyricOffset: song.lyricOffset,
        lyricsSource: song.lyricsSource,
      }));
      // Use the latest createdAt timestamp as version (or 1 if empty)
      const version = cachedSongs.length > 0 
        ? Math.max(...cachedSongs.map((s) => s.createdAt || 1))
        : 1;
      cachedIpodData = { tracks, version };
      return cachedIpodData;
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
  currentIndex: 0,
  loopCurrent: false,
  loopAll: true,
  isShuffled: true,
  isPlaying: false,
  showVideo: false,
  backlightOn: true,
  theme: "classic",
  lcdFilterOn: true,
  showLyrics: true,
  lyricsAlignment: LyricsAlignment.Alternating,
  lyricsFont: LyricsFont.Serif,
  chineseVariant: ChineseVariant.Traditional,
  koreanDisplay: KoreanDisplay.Original,
  japaneseFurigana: JapaneseFurigana.On,
  romanization: {
    enabled: true,
    japaneseFurigana: true,
    japaneseRomaji: false,
    korean: false,
    chinese: false,
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
};

export interface IpodState extends IpodData {
  setCurrentIndex: (index: number) => void;
  toggleLoopCurrent: () => void;
  toggleLoopAll: () => void;
  toggleShuffle: () => void;
  togglePlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  toggleVideo: () => void;
  toggleBacklight: () => void;
  toggleLcdFilter: () => void;
  toggleFullScreen: () => void;
  setTheme: (theme: "classic" | "black" | "u2") => void;
  addTrack: (track: Track) => void;
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
  /** Set Chinese character variant */
  setChineseVariant: (variant: ChineseVariant) => void;
  /** Set Korean text display mode @deprecated Use setRomanization instead */
  setKoreanDisplay: (display: KoreanDisplay) => void;
  /** Set Japanese furigana display mode @deprecated Use setRomanization instead */
  setJapaneseFurigana: (mode: JapaneseFurigana) => void;
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
}

const CURRENT_IPOD_STORE_VERSION = 24; // Add unified romanization settings

// Helper function to get unplayed track IDs from history
function getUnplayedTrackIds(
  tracks: Track[],
  playbackHistory: string[]
): string[] {
  const playedIds = new Set(playbackHistory);
  return tracks.map((track) => track.id).filter((id) => !playedIds.has(id));
}

// Helper function to get a random track avoiding recently played songs
function getRandomTrackAvoidingRecent(
  tracks: Track[],
  playbackHistory: string[],
  currentIndex: number
): number {
  if (tracks.length === 0) return -1;
  if (tracks.length === 1) return 0;

  // Get unplayed tracks first (tracks that have never been played)
  const unplayedIds = getUnplayedTrackIds(tracks, playbackHistory);

  // If we have unplayed tracks, prioritize them
  if (unplayedIds.length > 0) {
    const availableUnplayed = unplayedIds.filter((id) => {
      const trackIndex = tracks.findIndex((track) => track.id === id);
      return trackIndex !== currentIndex;
    });

    if (availableUnplayed.length > 0) {
      const randomUnplayedId =
        availableUnplayed[Math.floor(Math.random() * availableUnplayed.length)];
      return tracks.findIndex((track) => track.id === randomUnplayedId);
    }
  }

  // If no unplayed tracks, avoid recently played ones
  // Keep a reasonable history size to avoid (e.g., half the playlist or 10 tracks, whichever is smaller)
  const avoidCount = Math.min(Math.floor(tracks.length / 2), 10);
  const recentTrackIds = playbackHistory.slice(-avoidCount);
  const recentIds = new Set(recentTrackIds);

  // Find tracks that haven't been played recently
  const availableIndices = tracks
    .map((_, index) => index)
    .filter((index) => {
      const trackId = tracks[index].id;
      return !recentIds.has(trackId) && index !== currentIndex;
    });

  if (availableIndices.length > 0) {
    return availableIndices[
      Math.floor(Math.random() * availableIndices.length)
    ];
  }

  // If all tracks have been played recently, just pick any track except current
  const allIndicesExceptCurrent = tracks
    .map((_, index) => index)
    .filter((index) => index !== currentIndex);

  if (allIndicesExceptCurrent.length > 0) {
    return allIndicesExceptCurrent[
      Math.floor(Math.random() * allIndicesExceptCurrent.length)
    ];
  }

  // Fallback: return current index if it's the only option
  return currentIndex;
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

export const useIpodStore = create<IpodState>()(
  persist(
    (set, get) => ({
      ...initialIpodData,
      // --- Actions ---
      setCurrentIndex: (index) =>
        set((state) => {
          // Only update playback history if we're actually changing tracks
          if (
            index !== state.currentIndex &&
            index >= 0 &&
            index < state.tracks.length
          ) {
            const currentTrackId = state.tracks[state.currentIndex]?.id;
            const newPlaybackHistory = currentTrackId
              ? updatePlaybackHistory(state.playbackHistory, currentTrackId)
              : state.playbackHistory;

            return {
              currentIndex: index,
              playbackHistory: newPlaybackHistory,
              historyPosition: -1,
            };
          }

          return {
            currentIndex: index,
          };
        }),
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
      toggleBacklight: () =>
        set((state) => ({ backlightOn: !state.backlightOn })),
      toggleLcdFilter: () =>
        set((state) => ({ lcdFilterOn: !state.lcdFilterOn })),
      toggleFullScreen: () =>
        set((state) => ({ isFullScreen: !state.isFullScreen })),
      setTheme: (theme) => set({ theme }),
      addTrack: (track) =>
        set((state) => ({
          tracks: [track, ...state.tracks],
          currentIndex: 0,
          isPlaying: true,
          libraryState: "loaded",
          playbackHistory: [], // Clear playback history when adding new tracks
          historyPosition: -1,
        })),
      clearLibrary: () =>
        set({
          tracks: [],
          currentIndex: -1,
          isPlaying: false,
          libraryState: "cleared",
          playbackHistory: [], // Clear playback history when clearing library
          historyPosition: -1,
        }),
      resetLibrary: async () => {
        const { tracks, version } = await loadDefaultTracks();
        set({
          tracks,
          currentIndex: tracks.length > 0 ? 0 : -1,
          isPlaying: false,
          libraryState: "loaded",
          lastKnownVersion: version,
          playbackHistory: [], // Clear playback history when resetting library
          historyPosition: -1,
        });
      },
      nextTrack: () =>
        set((state) => {
          if (state.tracks.length === 0)
            return { currentIndex: -1 };

          // Add current track to history before moving to next
          const currentTrackId = state.tracks[state.currentIndex]?.id;
          let newPlaybackHistory = state.playbackHistory;
          if (currentTrackId && !state.loopCurrent) {
            newPlaybackHistory = updatePlaybackHistory(
              state.playbackHistory,
              currentTrackId
            );
          }

          let next: number;

          if (state.loopCurrent) {
            // If looping current track, stay on the same track
            next = state.currentIndex;
          } else if (state.isShuffled) {
            // Shuffle mode: pick a random track avoiding recent ones
            next = getRandomTrackAvoidingRecent(
              state.tracks,
              newPlaybackHistory,
              state.currentIndex
            );
          } else {
            // Sequential mode
            next = (state.currentIndex + 1) % state.tracks.length;

            // If we've reached the end and loop all is off, stop
            if (!state.loopAll && next === 0) {
              return {
                currentIndex: state.tracks.length - 1,
                isPlaying: false,
              };
            }
          }

          return {
            currentIndex: next,
            isPlaying: true,
            playbackHistory: newPlaybackHistory,
            historyPosition: -1, // Always reset to end when moving forward
          };
        }),
      previousTrack: () =>
        set((state) => {
          if (state.tracks.length === 0)
            return { currentIndex: -1 };

          let prev: number;
          let newPlaybackHistory = state.playbackHistory;

          if (state.isShuffled && state.playbackHistory.length > 0) {
            // In shuffle mode, go back to the last played track from history
            const lastTrackId =
              state.playbackHistory[state.playbackHistory.length - 1];
            const lastTrackIndex = state.tracks.findIndex(
              (track) => track.id === lastTrackId
            );

            if (
              lastTrackIndex !== -1 &&
              lastTrackIndex !== state.currentIndex
            ) {
              // Found the previous track in history
              prev = lastTrackIndex;
              // Remove it from history since we're going back to it
              newPlaybackHistory = state.playbackHistory.slice(0, -1);
            } else {
              // No valid history, pick a random track
              prev = getRandomTrackAvoidingRecent(
                state.tracks,
                state.playbackHistory,
                state.currentIndex
              );
            }
          } else {
            // Sequential mode or no history
            prev =
              (state.currentIndex - 1 + state.tracks.length) %
              state.tracks.length;
          }

          return {
            currentIndex: prev,
            isPlaying: true,
            playbackHistory: newPlaybackHistory,
            historyPosition: -1,
          };
        }),
      setShowVideo: (show) => set({ showVideo: show }),
      toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
      refreshLyrics: () =>
        set((state) => ({
          lyricsRefetchTrigger: state.lyricsRefetchTrigger + 1,
          currentLyrics: null,
          currentFuriganaMap: null,
        })),
      clearLyricsCache: () =>
        set((state) => ({
          lyricsRefetchTrigger: state.lyricsRefetchTrigger + 1,
          lyricsCacheBustTrigger: state.lyricsCacheBustTrigger + 1,
          currentLyrics: null,
          currentFuriganaMap: null,
        })),
      setCurrentFuriganaMap: (map) => set({ currentFuriganaMap: map }),
      adjustLyricOffset: (trackIndex, deltaMs) =>
        set((state) => {
          if (
            trackIndex < 0 ||
            trackIndex >= state.tracks.length ||
            Number.isNaN(deltaMs)
          ) {
            return {} as Partial<IpodState>;
          }

          const tracks = [...state.tracks];
          const current = tracks[trackIndex];
          const newOffset = (current.lyricOffset || 0) + deltaMs;

          tracks[trackIndex] = {
            ...current,
            lyricOffset: newOffset,
          };

          return { tracks } as Partial<IpodState>;
        }),
      setLyricOffset: (trackIndex, offsetMs) =>
        set((state) => {
          if (
            trackIndex < 0 ||
            trackIndex >= state.tracks.length ||
            Number.isNaN(offsetMs)
          ) {
            return {} as Partial<IpodState>;
          }

          const tracks = [...state.tracks];
          tracks[trackIndex] = {
            ...tracks[trackIndex],
            lyricOffset: offsetMs,
          };

          return { tracks } as Partial<IpodState>;
        }),
      setLyricsAlignment: (alignment) => set({ lyricsAlignment: alignment }),
      setLyricsFont: (font) => set({ lyricsFont: font }),
      setChineseVariant: (variant) => set({ chineseVariant: variant }),
      setKoreanDisplay: (display) => set({ koreanDisplay: display }),
      setJapaneseFurigana: (mode) => set({ japaneseFurigana: mode }),
      setRomanization: (settings) =>
        set((state) => ({
          romanization: { ...state.romanization, ...settings },
        })),
      toggleRomanization: () =>
        set((state) => ({
          romanization: { ...state.romanization, enabled: !state.romanization.enabled },
        })),
      setLyricsTranslationLanguage: (language) =>
        set({
          lyricsTranslationLanguage: language,
        }),
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
            currentIndex: importedTracks.length > 0 ? 0 : -1,
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
            currentIndex: tracks.length > 0 ? 0 : -1,
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

            // Handle os.ryo.lu/ipod/:id or os.ryo.lu/karaoke/:id format
            if (
              url.hostname === "os.ryo.lu" &&
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

              // Embedded or other YouTube formats
              const pathMatch = url.pathname.match(
                /\/(?:embed\/|v\/)?([a-zA-Z0-9_-]{11})/
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
          const existingIndex = get().tracks.findIndex((track) => track.id === videoId);
          set({
            currentIndex: existingIndex,
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
              lyricOffset: cachedMetadata.lyricOffset ?? 500,
              lyricsSource: cachedMetadata.lyricsSource,
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
          const oembedResponse = await fetch(oembedUrl);

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
          lyricsSource: undefined as {
            hash: string;
            albumId: string | number;
            title: string;
            artist: string;
            album?: string;
          } | undefined,
        };

        // First, try searching Kugou for lyrics using the YouTube title
        // If found with a good match, use Kugou's metadata (more accurate for songs)
        try {
          const searchResponse = await fetch(getApiUrl(`/api/song/${videoId}`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "search-lyrics",
              query: rawTitle,
            }),
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const results = searchData.results || [];
            
            // If we have a result with a reasonable score (> 0.3), use its metadata
            if (results.length > 0 && results[0].score > 0.3) {
              const bestMatch = results[0];
              console.log(`[iPod Store] Found Kugou match for ${videoId}:`, {
                title: bestMatch.title,
                artist: bestMatch.artist,
                score: bestMatch.score,
              });
              
              trackInfo.title = bestMatch.title;
              trackInfo.artist = bestMatch.artist;
              trackInfo.album = bestMatch.album;
              trackInfo.lyricsSource = {
                hash: bestMatch.hash,
                albumId: bestMatch.albumId,
                title: bestMatch.title,
                artist: bestMatch.artist,
                album: bestMatch.album,
              };
            } else {
              console.log(`[iPod Store] No good Kugou match for ${videoId}, falling back to AI parse`);
            }
          }
        } catch (error) {
          console.warn(`[iPod Store] Failed to search Kugou for ${videoId}:`, error);
        }

        // If no Kugou match found, fall back to AI title parsing
        if (!trackInfo.lyricsSource) {
          try {
            // Call /api/parse-title
            const parseResponse = await fetch(getApiUrl("/api/parse-title"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: rawTitle,
                author_name: authorName,
              }),
            });

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

          // Process existing tracks: update metadata if track exists on server
          const updatedTracks = current.tracks.map((currentTrack) => {
            const serverTrack = serverTrackMap.get(currentTrack.id);
            if (serverTrack) {
              // Track exists on server, check if metadata needs updating
              const hasMetadataChanges =
                currentTrack.title !== serverTrack.title ||
                currentTrack.artist !== serverTrack.artist ||
                currentTrack.album !== serverTrack.album ||
                currentTrack.url !== serverTrack.url ||
                currentTrack.lyricOffset !== serverTrack.lyricOffset;

              // Check if we should update lyricsSource:
              // - Server has lyricsSource but user doesn't have one yet
              const shouldUpdateLyricsSource =
                serverTrack.lyricsSource && !currentTrack.lyricsSource;

              if (hasMetadataChanges || shouldUpdateLyricsSource) {
                tracksUpdated++;
                // Update with server metadata but preserve any user customizations we want to keep
                return {
                  ...currentTrack,
                  title: serverTrack.title,
                  artist: serverTrack.artist,
                  album: serverTrack.album,
                  url: serverTrack.url,
                  lyricOffset: serverTrack.lyricOffset,
                  // Only set lyricsSource from server if user doesn't have one
                  ...(shouldUpdateLyricsSource && {
                    lyricsSource: serverTrack.lyricsSource,
                  }),
                };
              }
            }
            // Return unchanged track (either no server version or no changes)
            return currentTrack;
          });

          // Find tracks that are on the server but not in the user's library
          const existingIds = new Set(current.tracks.map((track) => track.id));
          const tracksToAdd = serverTracks.filter(
            (track) => !existingIds.has(track.id)
          );
          newTracksAdded = tracksToAdd.length;

          // Combine new tracks (at top) with updated existing tracks
          const finalTracks = [...tracksToAdd, ...updatedTracks];

          // Update store if there were any changes
          if (newTracksAdded > 0 || tracksUpdated > 0) {
            set({
              tracks: finalTracks,
              lastKnownVersion: serverVersion,
              libraryState: "loaded",
              // If library was empty and we added tracks, set first song as current
              currentIndex:
                wasEmpty && finalTracks.length > 0 ? 0 : current.currentIndex,
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
      setTrackLyricsSource: (trackId, lyricsSource) =>
        set((state) => {
          const tracks = state.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  lyricsSource: lyricsSource || undefined,
                }
              : track
          );
          return { tracks };
        }),
      clearTrackLyricsSource: (trackId) =>
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
        }),
    }),
    {
      name: "ryos:ipod", // Unique name for localStorage persistence
      version: CURRENT_IPOD_STORE_VERSION, // Set the current version
      partialize: (state) => ({
        // Keep tracks and originalOrder here initially for migration
        tracks: state.tracks,
        currentIndex: state.currentIndex,
        loopAll: state.loopAll,
        loopCurrent: state.loopCurrent,
        isShuffled: state.isShuffled,
        theme: state.theme,
        lcdFilterOn: state.lcdFilterOn,
        showLyrics: state.showLyrics, // Persist lyrics visibility
        lyricsAlignment: state.lyricsAlignment,
        lyricsFont: state.lyricsFont, // Persist lyrics font style
        chineseVariant: state.chineseVariant,
        koreanDisplay: state.koreanDisplay, // Kept for backwards compatibility
        japaneseFurigana: state.japaneseFurigana, // Kept for backwards compatibility
        romanization: state.romanization, // New unified romanization settings
        lyricsTranslationLanguage: state.lyricsTranslationLanguage, // Persist translation language preference
        isFullScreen: state.isFullScreen,
        libraryState: state.libraryState,
        lastKnownVersion: state.lastKnownVersion,
      }),
      migrate: (persistedState, version) => {
        let state = persistedState as IpodState; // Type assertion

        // If the persisted version is older than the current version, update defaults
        if (version < CURRENT_IPOD_STORE_VERSION) {
          console.log(
            `Migrating iPod store from version ${version} to ${CURRENT_IPOD_STORE_VERSION}`
          );
          
          // Migrate old romanization settings to new unified format
          // Cast to string for legacy value comparison (old stores may have string values)
          const oldKoreanDisplay = state.koreanDisplay as string | undefined;
          const oldJapaneseFurigana = state.japaneseFurigana as string | undefined;
          
          // Create romanization settings from old values
          const romanization: RomanizationSettings = state.romanization ?? {
            enabled: true, // Default to enabled for backwards compatibility
            japaneseFurigana: oldJapaneseFurigana === JapaneseFurigana.On || oldJapaneseFurigana === "on" || oldJapaneseFurigana === undefined,
            japaneseRomaji: false, // New feature, default off
            korean: oldKoreanDisplay === KoreanDisplay.Romanized || oldKoreanDisplay === "romanized",
            chinese: false, // New feature, default off
          };
          
          state = {
            ...state,
            tracks: [],
            currentIndex: 0,
            isPlaying: false,
            isShuffled: state.isShuffled, // Keep shuffle preference maybe? Or reset? Let's keep it for now.
            showLyrics: state.showLyrics ?? true, // Add default for migration
            lyricsAlignment:
              state.lyricsAlignment ?? LyricsAlignment.Alternating,
            lyricsFont: state.lyricsFont ?? LyricsFont.Rounded,
            chineseVariant: state.chineseVariant ?? ChineseVariant.Traditional,
            koreanDisplay: state.koreanDisplay ?? KoreanDisplay.Original,
            japaneseFurigana: state.japaneseFurigana ?? JapaneseFurigana.On,
            romanization,
            lyricsTranslationLanguage: state.lyricsTranslationLanguage ?? LYRICS_TRANSLATION_AUTO, // Default to auto (ryOS locale)
            libraryState: "uninitialized" as LibraryState, // Reset to uninitialized on migration
            lastKnownVersion: state.lastKnownVersion ?? 0,
          };
        }
        // Clean up potentially outdated fields if needed in future migrations
        // Example: delete state.someOldField;

        // Ensure the returned state matches the latest IpodStoreState structure
        // Remove fields not present in the latest partialize if necessary
        const partializedState = {
          tracks: state.tracks,
          currentIndex: state.currentIndex,
          loopAll: state.loopAll,
          loopCurrent: state.loopCurrent,
          isShuffled: state.isShuffled,
          theme: state.theme,
          lcdFilterOn: state.lcdFilterOn,
          showLyrics: state.showLyrics, // Persist lyrics visibility
          lyricsAlignment: state.lyricsAlignment,
          lyricsFont: state.lyricsFont, // Persist lyrics font style
          chineseVariant: state.chineseVariant,
          koreanDisplay: state.koreanDisplay,
          japaneseFurigana: state.japaneseFurigana,
          romanization: state.romanization ?? initialIpodData.romanization,
          lyricsTranslationLanguage: state.lyricsTranslationLanguage, // Persist translation language preference
          isFullScreen: state.isFullScreen,
          libraryState: state.libraryState,
        };

        return partializedState as IpodState; // Return the potentially migrated state
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
