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

// Original video collection moved here
export const IPOD_DEFAULT_VIDEOS = [
  {
    id: "jKnLSg83Nqc",
    url: "https://youtu.be/jKnLSg83Nqc?si=0mX3pYk0q98Ndoui",
    title: "ㅠ.ㅠ (You)",
    artist: "Crush",
    lyricOffset: 200,
  },
  {
    id: "hCg9tezGBWE",
    url: "https://youtu.be/hCg9tezGBWE?si=4KFJNVTDm6OA2kK8",
    title: "Magnetic",
    artist: "ILLIT",
    lyricOffset: -1200,
  },
  {
    id: "Q3K0TOvTOno",
    url: "https://youtu.be/Q3K0TOvTOno?si=_VbKas8ZYd9jpXiA",
    title: "How Sweet",
    artist: "NewJeans",
    lyricOffset: -10050,
  },
  {
    id: "ft70sAYrFyY",
    url: "https://youtu.be/ft70sAYrFyY?si=SJXlm-KRfgrMIODE",
    title: "Bubble Gum",
    artist: "NewJeans",
    lyricOffset: -9150,
  },
  {
    id: "-nEGVrzPaiU",
    url: "https://www.youtube.com/watch?v=-nEGVrzPaiU&pp=ygUPdGljayB0YWNrIGlsbGl0",
    title: "Tick-Tack",
    artist: "ILLIT",
    album: "",
    lyricOffset: -17150,
  },
  {
    id: "lXd1GHJPx-A",
    url: "https://www.youtube.com/watch?v=lXd1GHJPx-A",
    title: "Promise",
    artist: "Jagged Edge",
    album: "JE Heartbreak (Explicit)",
    lyricOffset: -6200,
  },
  {
    id: "Y_AxRCNFT2g",
    url: "https://www.youtube.com/watch?v=Y_AxRCNFT2g",
    title: "Supernova (House Remix)",
    artist: "aespa",
    album: "Armageddon",
    lyricOffset: -5200,
  },
  {
    id: "yP8nAoFi6JY",
    url: "https://www.youtube.com/watch?v=yP8nAoFi6JY",
    title: "Supernatural (Miami Bass Remix)",
    artist: "NewJeans",
    album: "Supernatural",
    lyricOffset: 22400,
  },
  {
    id: "1FNI1i7H1Kc",
    url: "https://www.youtube.com/watch?v=1FNI1i7H1Kc",
    title: "The Chase (R&B Remix)",
    artist: "Hearts2Hearts",
    album: "The Chase",
    lyricOffset: -6600,
  },
  {
    id: "LVLOwwGVVZ0",
    url: "https://www.youtube.com/watch?v=LVLOwwGVVZ0",
    title: "Right Now (R&B Remix)",
    artist: "NewJeans",
    album: "Supernatural",
    lyricOffset: -2400,
  },
  {
    id: "AGaTzDTnYGY",
    url: "https://www.youtube.com/watch?v=AGaTzDTnYGY",
    title: "How Sweet (UK Garage Remix)",
    artist: "NewJeans",
    album: "How Sweet",
    lyricOffset: 2400,
  },
  {
    id: "XJWqHmY-g9U",
    url: "https://www.youtube.com/watch?v=XJWqHmY-g9U",
    title: "Telephone Number",
    artist: "Junko Ohashi",
    album: "MAGICAL",
    lyricOffset: 2200,
  },
  {
    id: "f3zVbOMyzgE",
    url: "https://www.youtube.com/watch?v=f3zVbOMyzgE",
    title: "UP&DOWN",
    artist: "임지수",
    album: "UP&DOWN",
    lyricOffset: 1600,
  },
  {
    id: "zt0Me5qyK4g",
    url: "https://www.youtube.com/watch?v=zt0Me5qyK4g",
    title: "춤 (Dance)",
    artist: "OFFONOFF",
    album: "boy.",
    lyricOffset: 2200,
  },
  {
    id: "T6YVgEpRU6Q",
    url: "https://www.youtube.com/watch?v=T6YVgEpRU6Q",
    title: "LEFT RIGHT",
    artist: "XG",
    album: "NEW DNA",
    lyricOffset: -5050,
  },
  {
    id: "QiYOkmrI1jg",
    url: "https://www.youtube.com/watch?v=QiYOkmrI1jg",
    title: "IYKYK",
    artist: "XG",
    album: "IYKYK",
    lyricOffset: 1250,
  },
  {
    id: "_wgeHqXr4Hc",
    url: "https://www.youtube.com/watch?v=_wgeHqXr4Hc",
    title: "나를 위해 (For Days to Come)",
    artist: "Crush",
    album: "wonderego",
    lyricOffset: 1000,
  },
  {
    id: "zzDpTWCGofU",
    url: "https://www.youtube.com/watch?v=zzDpTWCGofU",
    title: "Nirvana Blues",
    artist: "Colde",
    album: "YIN",
    lyricOffset: 1800,
  },
  {
    id: "6vDi9S2ZDYA",
    url: "https://www.youtube.com/watch?v=6vDi9S2ZDYA",
    title: "ETA (R&B Remix)",
    artist: "NewJeans",
    album: "NewJeans 2nd EP 'Get Up'",
    lyricOffset: -4400,
  },
  {
    id: "5tcBJCouOmE",
    url: "https://youtu.be/5tcBJCouOmE",
    title: "Hype Boy",
    artist: "DEAN",
    album: "New Jeans",
    lyricOffset: 19250,
  },
  {
    id: "PO8",
    url: "https://www.youtube.com/watch?v=HB4Rp2KKeu4",
    title: "野子",
    artist: "PO8",
    album: "野子",
    lyricOffset: 2600,
  },
  {
    id: "z-xfGoabprU",
    url: "https://www.youtube.com/watch?v=z-xfGoabprU",
    title: "BEBE",
    artist: "STAYC",
    album: "BEBE",
    lyricOffset: 1650,
  },
  {
    id: "aFrQIJ5cbRc",
    url: "https://www.youtube.com/watch?v=aFrQIJ5cbRc",
    title: "Know About Me",
    artist: "NMIXX",
    album: "Fe3O4: FORWARD - EP",
    lyricOffset: -1500,
  },
  {
    id: "hJ9Wp3PO3c8",
    url: "https://www.youtube.com/watch?v=hJ9Wp3PO3c8",
    title: "Butterflies",
    artist: "Hearts2Hearts",
    album: "The Chase - Single",
    lyricOffset: -7000,
  },
  {
    id: "PICpEtPHyZI",
    url: "https://www.youtube.com/watch?v=PICpEtPHyZI",
    title: "Damn Right",
    artist: "JENNIE",
    album: "Ruby",
    lyricOffset: 1200,
  },
  {
    id: "osNYssIep5w",
    url: "https://www.youtube.com/watch?v=osNYssIep5w",
    title: "Mantra (House Remix)",
    artist: "JENNIE",
    album: "Ruby",
    lyricOffset: 2400,
  },
  {
    id: "DskqpUrvlmw",
    url: "https://www.youtube.com/watch?v=DskqpUrvlmw",
    title: "GPT",
    artist: "STAYC",
    album: "GPT - Single",
    lyricOffset: -1600,
  },
  {
    id: "Rk6aQvlmsWo",
    url: "https://www.youtube.com/watch?v=Rk6aQvlmsWo",
    title: "Dandelion (feat. Ruel)",
    artist: "grentperez",
    album: "Backflips in a Restaurant",
    lyricOffset: -8400,
  },
  {
    id: "36wVOzmsywo",
    url: "https://www.youtube.com/watch?v=36wVOzmsywo",
    title: "오래오래 (FRR)",
    artist: "george",
    album: "FRR",
    lyricOffset: -4300,
  },
  {
    id: "FonjL7DQAUQ",
    url: "https://www.youtube.com/watch?v=FonjL7DQAUQ",
    title: "海浪 (Waves)",
    artist: "deca joins",
    album: "Go Slow",
    lyricOffset: -7000,
  },
  {
    id: "3SoYkCAzMBk",
    url: "https://www.youtube.com/watch?v=3SoYkCAzMBk",
    title: "Can We Talk",
    artist: "Tevin Campbell",
    album: "I'm Ready",
    lyricOffset: -400,
  },
  {
    id: "ZncbtRo7RXs",
    url: "https://www.youtube.com/watch?v=ZncbtRo7RXs",
    title: "Supernatural (Part.1)",
    artist: "NewJeans",
    album: "Supernatural",
    lyricOffset: 1600,
  },
  {
    id: "hgNJ_qy6LCw",
    url: "https://www.youtube.com/watch?v=hgNJ_qy6LCw",
    title: "ASAP",
    artist: "NJZ",
    album: "NewJeans 2nd EP 'Get Up'",
    lyricOffset: 4400,
  },
  {
    id: "YYyskjq1vSc",
    url: "https://www.youtube.com/watch?v=YYyskjq1vSc",
    title: "New Jeans (2025)",
    artist: "NJZ",
    album: "NewJeans 2nd EP 'Get Up'",
    lyricOffset: -29800,
  },
  {
    id: "WpqXjRrZqa0",
    url: "https://www.youtube.com/watch?v=WpqXjRrZqa0",
    title: "Cool with You (2025)",
    artist: "NJZ",
    album: "NewJeans 2nd EP 'Get Up'",
    lyricOffset: 16200,
  },
  {
    id: "In7e1knX7rQ",
    url: "https://www.youtube.com/watch?v=In7e1knX7rQ",
    title: "ETA (feat. E SENS 이센스)",
    artist: "NJZ",
    album: "NewJeans 2nd EP 'Get Up'",
    lyricOffset: -7850,
  },
];

// Map default videos to tracks for the initial iPod state
const DEFAULT_TRACKS: Track[] = IPOD_DEFAULT_VIDEOS.map((video) => ({
  id: video.id,
  url: video.url,
  title: video.title,
  artist: video.artist,
  album: video.album ?? "", // Retain album if provided
  // Ensure lyricOffset is carried over if present in the default video list
  lyricOffset: (video as Partial<Track>).lyricOffset,
}));

interface IpodData {
  tracks: Track[];
  currentIndex: number;
  loopCurrent: boolean;
  loopAll: boolean;
  isShuffled: boolean;
  isPlaying: boolean;
  showVideo: boolean;
  backlightOn: boolean;
  theme: "classic" | "black";
  lcdFilterOn: boolean;
  showLyrics: boolean;
  lyricsAlignment: LyricsAlignment;
  chineseVariant: ChineseVariant;
  koreanDisplay: KoreanDisplay;
  lyricsTranslationRequest: { language: string; songId: string } | null;
  currentLyrics: { lines: LyricLine[] } | null;
  isFullScreen: boolean;
  /** Current playback position in seconds */
  elapsedTime: number;
}

const initialIpodData: IpodData = {
  tracks: DEFAULT_TRACKS,
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
  lyricsAlignment: LyricsAlignment.FocusThree,
  chineseVariant: ChineseVariant.Traditional,
  koreanDisplay: KoreanDisplay.Original,
  lyricsTranslationRequest: null,
  currentLyrics: null,
  isFullScreen: false,
  elapsedTime: 0,
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
  setTheme: (theme: "classic" | "black") => void;
  addTrack: (track: Track) => void;
  clearLibrary: () => void;
  resetLibrary: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  setShowVideo: (show: boolean) => void;
  toggleLyrics: () => void;
  /** Update the current playback position in seconds */
  setElapsedTime: (time: number) => void;
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
}

const CURRENT_IPOD_STORE_VERSION = 11; // Incremented version for new state

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
      toggleVideo: () => set((state) => ({ showVideo: !state.showVideo })),
      toggleBacklight: () =>
        set((state) => ({ backlightOn: !state.backlightOn })),
  toggleLcdFilter: () =>
        set((state) => ({ lcdFilterOn: !state.lcdFilterOn })),
      toggleFullScreen: () =>
        set((state) => ({ isFullScreen: !state.isFullScreen })),
      setElapsedTime: (time) => set({ elapsedTime: time }),
      setTheme: (theme) => set({ theme }),
      addTrack: (track) =>
        set((state) => ({
          tracks: [track, ...state.tracks],
          currentIndex: 0,
          isPlaying: true,
          lyricsTranslationRequest: null,
        })),
      clearLibrary: () =>
        set({
          tracks: [],
          currentIndex: -1,
          isPlaying: false,
          lyricsTranslationRequest: null,
        }),
      resetLibrary: () =>
        set({
          tracks: DEFAULT_TRACKS,
          currentIndex: 0,
          isPlaying: false,
          lyricsTranslationRequest: null,
        }),
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
        chineseVariant: state.chineseVariant,
        koreanDisplay: state.koreanDisplay,
        isFullScreen: state.isFullScreen,
      }),
      migrate: (persistedState, version) => {
        let state = persistedState as IpodState; // Type assertion

        // If the persisted version is older than the current version, update defaults
        if (version < CURRENT_IPOD_STORE_VERSION) {
          console.log(
            `Migrating iPod store from version ${version} to ${CURRENT_IPOD_STORE_VERSION}`
          );
          state = {
            ...state, // Keep other persisted state
            tracks: DEFAULT_TRACKS, // Update to new defaults
            currentIndex: 0, // Reset index
            // Reset other potentially conflicting state if necessary
            isPlaying: false,
            isShuffled: state.isShuffled, // Keep shuffle preference maybe? Or reset? Let's keep it for now.
            showLyrics: state.showLyrics ?? true, // Add default for migration
            lyricsAlignment:
              state.lyricsAlignment ?? LyricsAlignment.FocusThree,
            chineseVariant: state.chineseVariant ?? ChineseVariant.Traditional,
            koreanDisplay: state.koreanDisplay ?? KoreanDisplay.Original,
            lyricsTranslationRequest: null, // Ensure this is not carried from old persisted state
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
          chineseVariant: state.chineseVariant,
          koreanDisplay: state.koreanDisplay,
          isFullScreen: state.isFullScreen,
        };

        return partializedState as IpodState; // Return the potentially migrated state
      },
    }
  )
);
