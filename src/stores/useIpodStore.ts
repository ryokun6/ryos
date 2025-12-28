import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LyricsAlignment, ChineseVariant, KoreanDisplay, JapaneseFurigana, LyricsFont, RomanizationSettings } from "@/types/lyrics";
import { LyricLine } from "@/types/lyrics";
import type { FuriganaSegment } from "@/utils/romanization";
import { getApiUrl } from "@/utils/platform";
import { getCachedSongMetadata, listAllCachedSongMetadata } from "@/utils/songMetadataCache";
import i18n from "@/lib/i18n";
import { useChatsStore } from "./useChatsStore";

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
  /** The ID of the currently playing song */
  currentSongId: string | null;
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
  currentSongId: null,
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
  lyricsFont: LyricsFont.Rounded,
  chineseVariant: ChineseVariant.Traditional,
  koreanDisplay: KoreanDisplay.Original,
  japaneseFurigana: JapaneseFurigana.On,
  romanization: {
    enabled: true,
    japaneseFurigana: true,
    japaneseRomaji: false,
    korean: false,
    chinese: false,
    chineseSoramimi: false,
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
};

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

const CURRENT_IPOD_STORE_VERSION = 26; // Add chineseSoramimi to romanization settings

// Helper function to get unplayed track IDs from history
function getUnplayedTrackIds(
  tracks: Track[],
  playbackHistory: string[]
): string[] {
  const playedIds = new Set(playbackHistory);
  return tracks.map((track) => track.id).filter((id) => !playedIds.has(id));
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
  const availableIds = tracks
    .map((track) => track.id)
    .filter((id) => !recentIds.has(id) && id !== currentSongId);

  if (availableIds.length > 0) {
    return availableIds[Math.floor(Math.random() * availableIds.length)];
  }

  // If all tracks have been played recently, just pick any track except current
  const allIdsExceptCurrent = tracks
    .map((track) => track.id)
    .filter((id) => id !== currentSongId);

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
  // Get auth credentials from chats store
  const { username, authToken } = useChatsStore.getState();
  
  // Skip if not authenticated
  if (!username || !authToken) {
    console.log(`[iPod Store] Skipping lyric offset save for ${trackId} - user not logged in`);
    return false;
  }

  console.log(`[iPod Store] Saving lyric offset for ${trackId}: ${lyricOffset}ms...`);
  
  try {
    const response = await fetch(getApiUrl(`/api/song/${encodeURIComponent(trackId)}`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        "X-Username": username,
      },
      body: JSON.stringify({
        lyricOffset,
      }),
    });

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
  // Get auth credentials from chats store
  const { username, authToken } = useChatsStore.getState();
  
  // Skip if not authenticated
  if (!username || !authToken) {
    console.log(`[iPod Store] Skipping lyrics source save for ${trackId} - user not logged in`);
    return;
  }

  try {
    const response = await fetch(getApiUrl(`/api/song/${encodeURIComponent(trackId)}`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        "X-Username": username,
      },
      body: JSON.stringify({
        lyricsSource: lyricsSource || undefined,
        // Update song metadata from lyricsSource (KuGou has more accurate metadata)
        ...(lyricsSource && {
          title: lyricsSource.title,
          artist: lyricsSource.artist,
          album: lyricsSource.album,
        }),
        // Clear translations and furigana since lyrics changed
        clearTranslations: true,
        clearFurigana: true,
        clearLyrics: true,
      }),
    });

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
          currentSongId: track.id,
          isPlaying: true,
          libraryState: "loaded",
          playbackHistory: [], // Clear playback history when adding new tracks
          historyPosition: -1,
        })),
      clearLibrary: () =>
        set({
          tracks: [],
          currentSongId: null,
          isPlaying: false,
          libraryState: "cleared",
          playbackHistory: [], // Clear playback history when clearing library
          historyPosition: -1,
        }),
      resetLibrary: async () => {
        const { tracks, version } = await loadDefaultTracks();
        set({
          tracks,
          currentSongId: tracks[0]?.id ?? null,
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
            return { currentSongId: null };

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
              return {
                currentSongId: state.tracks[state.tracks.length - 1]?.id ?? null,
                isPlaying: false,
              };
            }
            nextSongId = state.tracks[nextIndex]?.id ?? null;
          }

          return {
            currentSongId: nextSongId,
            isPlaying: true,
            playbackHistory: newPlaybackHistory,
            historyPosition: -1, // Always reset to end when moving forward
          };
        }),
      previousTrack: () =>
        set((state) => {
          if (state.tracks.length === 0)
            return { currentSongId: null };

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

          return {
            currentSongId: prevSongId,
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
      clearLyricsCache: () => {
        const state = get();
        const currentTrack = state.getCurrentTrack();
        
        // Clear server-side cache for translations and furigana
        if (currentTrack?.id) {
          fetch(getApiUrl(`/api/song/${currentTrack.id}`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "clear-cached-data",
              clearTranslations: true,
              clearFurigana: true,
            }),
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
        if (
          trackIndex < 0 ||
          trackIndex >= state.tracks.length ||
          Number.isNaN(deltaMs)
        ) {
          return;
        }

        const current = state.tracks[trackIndex];
        const newOffset = (current.lyricOffset || 0) + deltaMs;

        // Only update the single track that changed using map
        set((s) => ({
          tracks: s.tracks.map((track, i) =>
            i === trackIndex ? { ...track, lyricOffset: newOffset } : track
          ),
        }));

        // Side effect moved outside set() for cleaner separation
        debouncedSaveLyricOffset(current.id, newOffset);
      },
      setLyricOffset: (trackIndex, offsetMs) => {
        // Validate before calling set() to avoid unnecessary state updates
        const state = get();
        if (
          trackIndex < 0 ||
          trackIndex >= state.tracks.length ||
          Number.isNaN(offsetMs)
        ) {
          return;
        }

        const trackId = state.tracks[trackIndex].id;

        // Only update the single track that changed using map
        set((s) => ({
          tracks: s.tracks.map((track, i) =>
            i === trackIndex ? { ...track, lyricOffset: offsetMs } : track
          ),
        }));

        // Side effect moved outside set() for cleaner separation
        debouncedSaveLyricOffset(trackId, offsetMs);
      },
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
            currentSongId: importedTracks[0]?.id ?? null,
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
          set({
            currentSongId: videoId,
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
              currentSongId:
                wasEmpty && finalTracks.length > 0 
                  ? finalTracks[0]?.id ?? null 
                  : current.currentSongId,
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
        lcdFilterOn: state.lcdFilterOn,
        showLyrics: state.showLyrics,
        lyricsAlignment: state.lyricsAlignment,
        lyricsFont: state.lyricsFont,
        chineseVariant: state.chineseVariant,
        koreanDisplay: state.koreanDisplay,
        japaneseFurigana: state.japaneseFurigana,
        romanization: state.romanization,
        lyricsTranslationLanguage: state.lyricsTranslationLanguage,
        isFullScreen: state.isFullScreen,
        libraryState: state.libraryState,
        lastKnownVersion: state.lastKnownVersion,
      }),
      migrate: (persistedState, version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let state = persistedState as any;

        // If the persisted version is older than the current version, update defaults
        if (version < CURRENT_IPOD_STORE_VERSION) {
          console.log(
            `Migrating iPod store from version ${version} to ${CURRENT_IPOD_STORE_VERSION}`
          );
          
          // Migrate old romanization settings to new unified format
          const oldKoreanDisplay = state.koreanDisplay as string | undefined;
          const oldJapaneseFurigana = state.japaneseFurigana as string | undefined;
          
          const romanization: RomanizationSettings = state.romanization ?? {
            enabled: true,
            japaneseFurigana: oldJapaneseFurigana === JapaneseFurigana.On || oldJapaneseFurigana === "on" || oldJapaneseFurigana === undefined,
            japaneseRomaji: false,
            korean: oldKoreanDisplay === KoreanDisplay.Romanized || oldKoreanDisplay === "romanized",
            chinese: false,
            chineseSoramimi: false,
            pronunciationOnly: false,
          };
          
          // Ensure existing romanization settings have chineseSoramimi
          if (state.romanization && state.romanization.chineseSoramimi === undefined) {
            state.romanization.chineseSoramimi = false;
          }
          
          // Ensure existing romanization settings have pronunciationOnly
          if (state.romanization && state.romanization.pronunciationOnly === undefined) {
            state.romanization.pronunciationOnly = false;
          }

          // Migrate currentIndex to currentSongId (will be null, library will re-initialize)
          state = {
            ...state,
            tracks: [],
            currentSongId: null, // Reset - library will re-initialize
            isPlaying: false,
            isShuffled: state.isShuffled,
            showLyrics: state.showLyrics ?? true,
            lyricsAlignment: state.lyricsAlignment ?? LyricsAlignment.Alternating,
            lyricsFont: state.lyricsFont ?? LyricsFont.Rounded,
            chineseVariant: state.chineseVariant ?? ChineseVariant.Traditional,
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
          lcdFilterOn: state.lcdFilterOn,
          showLyrics: state.showLyrics,
          lyricsAlignment: state.lyricsAlignment,
          lyricsFont: state.lyricsFont,
          chineseVariant: state.chineseVariant,
          koreanDisplay: state.koreanDisplay,
          japaneseFurigana: state.japaneseFurigana,
          romanization: state.romanization ?? initialIpodData.romanization,
          lyricsTranslationLanguage: state.lyricsTranslationLanguage,
          isFullScreen: state.isFullScreen,
          libraryState: state.libraryState,
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
