import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LyricsAlignment, ChineseVariant, KoreanDisplay } from "@/types/lyrics";
import { LyricLine } from "@/types/lyrics";

// Define the Track type (can be shared or defined here)
export interface Track {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  /** Offset in milliseconds to adjust lyrics timing for this track (positive = lyrics earlier) */
  lyricOffset?: number;
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
  /** Elapsed playback time in seconds */
  elapsedTime: number;
  showLyrics: boolean;
  lyricsAlignment: LyricsAlignment;
  chineseVariant: ChineseVariant;
  koreanDisplay: KoreanDisplay;
  lyricsTranslationRequest: { language: string; songId: string } | null;
  currentLyrics: { lines: LyricLine[] } | null;
  isFullScreen: boolean;
  libraryState: LibraryState;
}

async function loadDefaultTracks(): Promise<Track[]> {
  try {
    const res = await fetch("/data/ipod-videos.json");
    const data = await res.json();
    const videos: unknown[] = data.videos || data;
    return videos.map((v) => {
      const video = v as Record<string, unknown>;
      return {
        id: video.id as string,
        url: video.url as string,
        title: video.title as string,
        artist: video.artist as string | undefined,
        album: (video.album as string | undefined) ?? "",
        lyricOffset: video.lyricOffset as number | undefined,
      };
    });
  } catch (err) {
    console.error("Failed to load ipod-videos.json", err);
    return [];
  }
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
  elapsedTime: 0,
  showLyrics: true,
  lyricsAlignment: LyricsAlignment.FocusThree,
  chineseVariant: ChineseVariant.Traditional,
  koreanDisplay: KoreanDisplay.Original,
  lyricsTranslationRequest: null,
  currentLyrics: null,
  isFullScreen: false,
  libraryState: "uninitialized",
};

export interface IpodState extends IpodData {
  setCurrentIndex: (index: number) => void;
  toggleLoopCurrent: () => void;
  toggleLoopAll: () => void;
  toggleShuffle: () => void;
  togglePlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  setElapsedTime: (time: number) => void;
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
  /** Adjust the lyric offset (in ms) for the track at the given index. */
  adjustLyricOffset: (trackIndex: number, deltaMs: number) => void;
  /** Set lyrics alignment mode */
  setLyricsAlignment: (alignment: LyricsAlignment) => void;
  /** Set Chinese character variant */
  setChineseVariant: (variant: ChineseVariant) => void;
  /** Set Korean text display mode */
  setKoreanDisplay: (display: KoreanDisplay) => void;
  /** Set the target language for lyrics translation. Pass null to disable translation. */
  setLyricsTranslationRequest: (
    language: string | null,
    songId: string | null
  ) => void;
  /** Import library from JSON string */
  importLibrary: (json: string) => void;
  /** Export library to JSON string */
  exportLibrary: () => string;
  /** Adds a track from a YouTube video ID or URL, fetching metadata automatically */
  addTrackFromVideoId: (urlOrId: string) => Promise<Track | null>;
  /** Load the default library if no tracks exist */
  initializeLibrary: () => Promise<void>;
}

const CURRENT_IPOD_STORE_VERSION = 18; // Incremented version for new state

export const useIpodStore = create<IpodState>()(
  persist(
    (set, get) => ({
      ...initialIpodData,
      // --- Actions ---
      setCurrentIndex: (index) =>
        set({ currentIndex: index, lyricsTranslationRequest: null }),
      toggleLoopCurrent: () =>
        set((state) => ({ loopCurrent: !state.loopCurrent })),
      toggleLoopAll: () => set((state) => ({ loopAll: !state.loopAll })),
      toggleShuffle: () => set((state) => ({ isShuffled: !state.isShuffled })),
      togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setElapsedTime: (time) => set({ elapsedTime: time }),
      toggleVideo: () => set((state) => ({ showVideo: !state.showVideo })),
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
          lyricsTranslationRequest: null,
          libraryState: "loaded",
        })),
      clearLibrary: () =>
        set({
          tracks: [],
          currentIndex: -1,
          isPlaying: false,
          lyricsTranslationRequest: null,
          libraryState: "cleared",
        }),
      resetLibrary: async () => {
        const tracks = await loadDefaultTracks();
        set({
          tracks,
          currentIndex: tracks.length > 0 ? 0 : -1,
          isPlaying: false,
          lyricsTranslationRequest: null,
          libraryState: "loaded",
        });
      },
      nextTrack: () =>
        set((state) => {
          if (state.tracks.length === 0)
            return { currentIndex: -1, lyricsTranslationRequest: null };
          let next = state.isShuffled
            ? Math.floor(Math.random() * state.tracks.length)
            : (state.currentIndex + 1) % state.tracks.length;
          if (
            state.isShuffled &&
            next === state.currentIndex &&
            state.tracks.length > 1
          ) {
            // Ensure shuffle doesn't pick the same song if possible
            next = (next + 1) % state.tracks.length;
          }
          return {
            currentIndex: next,
            isPlaying: true,
            lyricsTranslationRequest: null,
          };
        }),
      previousTrack: () =>
        set((state) => {
          if (state.tracks.length === 0)
            return { currentIndex: -1, lyricsTranslationRequest: null };
          const prev = state.isShuffled
            ? Math.floor(Math.random() * state.tracks.length)
            : (state.currentIndex - 1 + state.tracks.length) %
              state.tracks.length;
          return {
            currentIndex: prev,
            isPlaying: true,
            lyricsTranslationRequest: null,
          };
        }),
      setShowVideo: (show) => set({ showVideo: show }),
      toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
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
      setLyricsAlignment: (alignment) => set({ lyricsAlignment: alignment }),
      setChineseVariant: (variant) => set({ chineseVariant: variant }),
      setKoreanDisplay: (display) => set({ koreanDisplay: display }),
      setLyricsTranslationRequest: (language, songId) =>
        set(
          language && songId
            ? { lyricsTranslationRequest: { language, songId } }
            : { lyricsTranslationRequest: null }
        ),
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
            lyricsTranslationRequest: null,
            libraryState: "loaded",
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
          const tracks = await loadDefaultTracks();
          set({
            tracks,
            currentIndex: tracks.length > 0 ? 0 : -1,
            libraryState: "loaded",
          });
        }
      },
      addTrackFromVideoId: async (urlOrId: string): Promise<Track | null> => {
        // Extract video ID from various URL formats
        const extractVideoId = (input: string): string | null => {
          // If it's already a video ID (11 characters, alphanumeric + hyphens/underscores)
          if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
            return input;
          }

          try {
            const url = new URL(input);

            // Handle os.ryo.lu/ipod/:id format
            if (
              url.hostname === "os.ryo.lu" &&
              url.pathname.startsWith("/ipod/")
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

        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
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
        };

        try {
          // Call /api/parse-title
          const parseResponse = await fetch("/api/parse-title", {
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

        const newTrack: Track = {
          id: videoId,
          url: youtubeUrl,
          title: trackInfo.title,
          artist: trackInfo.artist,
          album: trackInfo.album,
          lyricOffset: 1000, // Default 1 second offset for new tracks
        };

        try {
          get().addTrack(newTrack); // Add track to the store
          return newTrack;
        } catch (error) {
          console.error("Error adding track to store:", error);
          return null;
        }
      },
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
        elapsedTime: state.elapsedTime,
        showLyrics: state.showLyrics, // Persist lyrics visibility
        lyricsAlignment: state.lyricsAlignment,
        chineseVariant: state.chineseVariant,
        koreanDisplay: state.koreanDisplay,
        isFullScreen: state.isFullScreen,
        libraryState: state.libraryState,
      }),
      migrate: (persistedState, version) => {
        let state = persistedState as IpodState; // Type assertion

        // If the persisted version is older than the current version, update defaults
        if (version < CURRENT_IPOD_STORE_VERSION) {
          console.log(
            `Migrating iPod store from version ${version} to ${CURRENT_IPOD_STORE_VERSION}`
          );
          state = {
            ...state,
            tracks: [],
            currentIndex: 0,
            isPlaying: false,
            isShuffled: state.isShuffled, // Keep shuffle preference maybe? Or reset? Let's keep it for now.
            showLyrics: state.showLyrics ?? true, // Add default for migration
            lyricsAlignment:
              state.lyricsAlignment ?? LyricsAlignment.FocusThree,
            chineseVariant: state.chineseVariant ?? ChineseVariant.Traditional,
            koreanDisplay: state.koreanDisplay ?? KoreanDisplay.Original,
            lyricsTranslationRequest: null, // Ensure this is not carried from old persisted state
            elapsedTime: 0,
            libraryState: "uninitialized" as LibraryState, // Reset to uninitialized on migration
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
          elapsedTime: state.elapsedTime,
          showLyrics: state.showLyrics, // Persist lyrics visibility
          lyricsAlignment: state.lyricsAlignment,
          chineseVariant: state.chineseVariant,
          koreanDisplay: state.koreanDisplay,
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
