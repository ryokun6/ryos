import { create } from "zustand";
import { persist } from "zustand/middleware";

// Define the Track type (can be shared or defined here)
export interface Track {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
}

// Original video collection moved here
export const IPOD_DEFAULT_VIDEOS = [
  {
    id: "lXd1GHJPx-A",
    url: "https://www.youtube.com/watch?v=lXd1GHJPx-A",
    title: "Promise",
    artist: "Jagged Edge",
  },
  {
    id: "Y_AxRCNFT2g",
    url: "https://www.youtube.com/watch?v=Y_AxRCNFT2g",
    title: "Supernova (House Remix)",
    artist: "aespa (에스파)",
  },
  {
    id: "yP8nAoFi6JY",
    url: "https://www.youtube.com/watch?v=yP8nAoFi6JY",
    title: "Supernatural (Miami Bass Remix)",
    artist: "NewJeans (뉴진스)",
  },
  {
    id: "1FNI1i7H1Kc",
    url: "https://www.youtube.com/watch?v=1FNI1i7H1Kc",
    title: "The Chase (R&B Remix)",
    artist: "Hearts2Hearts (하츠투하츠)",
  },
  {
    id: "LVLOwwGVVZ0",
    url: "https://www.youtube.com/watch?v=LVLOwwGVVZ0",
    title: "Right Now (R&B Remix)",
    artist: "NewJeans (뉴진스)",
  },
  {
    id: "AGaTzDTnYGY",
    url: "https://www.youtube.com/watch?v=AGaTzDTnYGY",
    title: "How Sweet (UK Garage Remix)",
    artist: "NewJeans (뉴진스)",
  },
  {
    id: "XJWqHmY-g9U",
    url: "https://www.youtube.com/watch?v=XJWqHmY-g9U",
    title: "Telephone Number",
    artist: "Junko Ohashi (大橋純子)",
  },
  {
    id: "f3zVbOMyzgE",
    url: "https://www.youtube.com/watch?v=f3zVbOMyzgE",
    title: "UP&DOWN",
    artist: "LIM JISOO (임지수)",
  },
  {
    id: "zt0Me5qyK4g",
    url: "https://www.youtube.com/watch?v=zt0Me5qyK4g",
    title: "춤 (Dance)",
    artist: "OFFONOFF",
  },
  {
    id: "T6YVgEpRU6Q",
    url: "https://www.youtube.com/watch?v=T6YVgEpRU6Q",
    title: "LEFT RIGHT",
    artist: "XG",
  },
  {
    id: "QiYOkmrI1jg",
    url: "https://www.youtube.com/watch?v=QiYOkmrI1jg",
    title: "IYKYK",
    artist: "XG",
  },
  {
    id: "b9MZLrVU3EQ",
    url: "https://www.youtube.com/watch?v=b9MZLrVU3EQ",
    title: "BAD BITCHES (feat. Kehlani)",
    artist: "Destin Conrad",
  },
  {
    id: "_wgeHqXr4Hc",
    url: "https://www.youtube.com/watch?v=_wgeHqXr4Hc",
    title: "나를 위해 (For Days to Come)",
    artist: "Crush (크러쉬)",
  },
  {
    id: "zzDpTWCGofU",
    url: "https://www.youtube.com/watch?v=zzDpTWCGofU",
    title: "Nirvana Blues",
    artist: "Colde (콜드)",
  },
  {
    id: "6vDi9S2ZDYA",
    url: "https://www.youtube.com/watch?v=6vDi9S2ZDYA",
    title: "ETA (R&B Remix)",
    artist: "NewJeans (뉴진스)",
  },
  {
    id: "PO8",
    url: "https://www.youtube.com/watch?v=HB4Rp2KKeu4",
    title: "野子",
    artist: "PO8",
  },
  {
    id: "z-xfGoabprU",
    url: "https://www.youtube.com/watch?v=z-xfGoabprU",
    title: "BEBE",
    artist: "STAYC (스테이씨)",
  },
  {
    id: "aFrQIJ5cbRc",
    url: "https://www.youtube.com/watch?v=aFrQIJ5cbRc",
    title: "Know About Me",
    artist: "NMIXX (엔믹스)",
  },
  {
    id: "hJ9Wp3PO3c8",
    url: "https://www.youtube.com/watch?v=hJ9Wp3PO3c8",
    title: "Butterfly",
    artist: "Hearts2Hearts (하츠투하츠)",
  },
  {
    id: "PICpEtPHyZI",
    url: "https://www.youtube.com/watch?v=PICpEtPHyZI",
    title: "Damn Right",
    artist: "JENNIE",
  },
  {
    id: "osNYssIep5w",
    url: "https://www.youtube.com/watch?v=osNYssIep5w",
    title: "Mantra (House Remix)",
    artist: "JENNIE",
  },
  {
    id: "DskqpUrvlmw",
    url: "https://www.youtube.com/watch?v=DskqpUrvlmw",
    title: "GPT",
    artist: "STAYC (스테이씨)",
  },
  {
    id: "Rk6aQvlmsWo",
    url: "https://www.youtube.com/watch?v=Rk6aQvlmsWo",
    title: "Dandelion",
    artist: "grentperez & Ruel",
  },
  {
    id: "Rf-ctwR7P-M",
    url: "https://www.youtube.com/watch?v=Rf-ctwR7P-M",
    title: "마음대로 (Control Me)",
    artist: "Colde (콜드)",
  },
  {
    id: "36wVOzmsywo",
    url: "https://www.youtube.com/watch?v=36wVOzmsywo",
    title: "FRR (오래오래)",
    artist: "george (죠지)",
    },
  {
    id: "FonjL7DQAUQ",
    url: "https://www.youtube.com/watch?v=FonjL7DQAUQ",
    title: "海浪 (Waves)",
    artist: "deca joins",
  },
  {
    id: "3SoYkCAzMBk",
    url: "https://www.youtube.com/watch?v=3SoYkCAzMBk",
    title: "Can We Talk",
    artist: "Tevin Campbell",
  },
  {
    id: "ZncbtRo7RXs",
    url: "https://www.youtube.com/watch?v=ZncbtRo7RXs",
    title: "Supernatural (Part.1)",
    artist: "NewJeans (뉴진스)",
  },
  {
    id: "hgNJ_qy6LCw",
    url: "https://www.youtube.com/watch?v=hgNJ_qy6LCw",
    title: "ASAP",
    artist: "NJZ",
  },
  {
    id: "YYyskjq1vSc",
    url: "https://www.youtube.com/watch?v=YYyskjq1vSc",
    title: "New Jeans (2025)",
    artist: "NJZ",
  },
  {
    id: "WpqXjRrZqa0",
    url: "https://www.youtube.com/watch?v=WpqXjRrZqa0",
    title: "Cool with You (2025)",
    artist: "NJZ",
  },
  {
    id: "In7e1knX7rQ",
    url: "https://www.youtube.com/watch?v=In7e1knX7rQ",
    title: "ETA/MTLA (feat. E SENS 이센스)",
    artist: "NJZ",
  },
];

// Map default videos to tracks for the initial iPod state
const DEFAULT_TRACKS: Track[] = IPOD_DEFAULT_VIDEOS.map((video) => ({
  id: video.id,
  url: video.url,
  title: video.title,
  artist: video.artist,
  album: "Shared Playlist", // Add a default album or leave undefined
}));

interface IpodStoreState {
  tracks: Track[];
  originalOrder: Track[]; // Store the original order for unshuffling
  currentIndex: number;
  loopAll: boolean;
  loopCurrent: boolean;
  isShuffled: boolean;
  isPlaying: boolean;
  showVideo: boolean;
  backlightOn: boolean;
  theme: string; // 'classic' or 'black'
  lcdFilterOn: boolean;
  // actions
  setTracks: (tracks: Track[]) => void;
  setCurrentIndex: (index: number) => void;
  toggleLoopAll: () => void;
  toggleLoopCurrent: () => void;
  toggleShuffle: () => void;
  togglePlay: () => void;
  setIsPlaying: (val: boolean) => void;
  toggleVideo: () => void;
  toggleBacklight: () => void;
  setTheme: (theme: string) => void;
  toggleLcdFilter: () => void;
  addTrack: (track: Track) => void;
  clearLibrary: () => void;
  resetLibrary: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
}

const CURRENT_IPOD_STORE_VERSION = 6; // Define the current version

export const useIpodStore = create<IpodStoreState>()(
  persist(
    (set, get) => ({
      tracks: DEFAULT_TRACKS,
      originalOrder: DEFAULT_TRACKS, // Initialize original order
      currentIndex: 0,
      loopAll: true, // Default loop all to true
      loopCurrent: false,
      isShuffled: true, // Default shuffle to true
      isPlaying: false,
      showVideo: false,
      backlightOn: true, // Default backlight to on
      theme: "classic", // Default theme
      lcdFilterOn: true, // Default LCD filter to on
      // --- Actions ---
      setTracks: (tracks) => set({ tracks }), // Basic setter, might need adjustment for originalOrder
      setCurrentIndex: (index) => set({ currentIndex: index }),
      toggleLoopAll: () =>
        set((state) => ({ loopAll: !state.loopAll, loopCurrent: false })), // Ensure only one loop mode active
      toggleLoopCurrent: () =>
        set((state) => ({ loopCurrent: !state.loopCurrent, loopAll: false })), // Ensure only one loop mode active
      toggleShuffle: () => {
        const currentIsShuffled = get().isShuffled;
        const currentOriginalOrder = get().originalOrder;
        const currentTracks = get().tracks;
        const currentPlayingTrackId = currentTracks[get().currentIndex]?.id;

        let newTracks: Track[];
        let newCurrentIndex = 0;

        if (currentIsShuffled) {
          // If unshuffling, restore original order
          newTracks = [...currentOriginalOrder];
        } else {
          // If shuffling, shuffle the original order
          newTracks = [...currentOriginalOrder].sort(() => Math.random() - 0.5);
        }

        // Find the index of the currently playing track in the new list
        const playingIndex = newTracks.findIndex(
          (track) => track.id === currentPlayingTrackId
        );
        if (playingIndex !== -1) {
          newCurrentIndex = playingIndex;
        } else if (newTracks.length > 0) {
          // Fallback if the playing track is somehow not found (e.g., after clearing)
          newCurrentIndex = 0;
        }

        set({
          isShuffled: !currentIsShuffled,
          tracks: newTracks,
          currentIndex: newCurrentIndex,
        });
      },
      togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
      setIsPlaying: (val) => set({ isPlaying: val }),
      toggleVideo: () => {
        // Only allow showing video if playing, but always allow hiding
        if (!get().showVideo && !get().isPlaying) {
            return; // Don't show video if paused
        }
        set((state) => ({ showVideo: !state.showVideo }));
      },
      toggleBacklight: () => set((state) => ({ backlightOn: !state.backlightOn })),
      setTheme: (theme) => set({ theme }),
      toggleLcdFilter: () => set((state) => ({ lcdFilterOn: !state.lcdFilterOn })),
      addTrack: (track) =>
        set((state) => {
          const newTracks = [...state.tracks, track];
          const newOriginalOrder = state.isShuffled
            ? [...state.originalOrder, track] // Add to original order even if shuffled
            : newTracks; // If not shuffled, new tracks are the new original order
          return {
            tracks: newTracks,
            originalOrder: newOriginalOrder,
            currentIndex: newTracks.length - 1, // Play the new track
            isPlaying: true, // Start playing automatically
          };
        }),
      clearLibrary: () =>
        set({
          tracks: [],
          originalOrder: [],
          currentIndex: 0,
          isPlaying: false,
        }),
      resetLibrary: () =>
        set({
          tracks: DEFAULT_TRACKS,
          originalOrder: DEFAULT_TRACKS,
          currentIndex: 0,
          isPlaying: false,
          isShuffled: false, // Also reset shuffle state
        }),
      nextTrack: () => {
        set((state) => {
          if (state.tracks.length === 0) return {};
          let nextIndex = state.currentIndex + 1;
          if (nextIndex >= state.tracks.length) {
            if (state.loopAll) {
              nextIndex = 0;
            } else {
              return { isPlaying: false }; // Stop playing if not looping and at the end
            }
          }
          return { currentIndex: nextIndex, isPlaying: true };
        });
      },
      previousTrack: () => {
        set((state) => {
          if (state.tracks.length === 0) return {};
          let prevIndex = state.currentIndex - 1;
          if (prevIndex < 0) {
            if (state.loopAll) {
              prevIndex = state.tracks.length - 1;
            } else {
              prevIndex = 0; // Go to first track but don't loop from start
            }
          }
          return { currentIndex: prevIndex, isPlaying: true };
        });
      },
    }),
    {
      name: "ryos:ipod", // Unique name for localStorage persistence
      version: CURRENT_IPOD_STORE_VERSION, // Set the current version
      partialize: (state) => ({
        // Keep tracks and originalOrder here initially for migration
        tracks: state.tracks,
        originalOrder: state.originalOrder,
        currentIndex: state.currentIndex,
        loopAll: state.loopAll,
        loopCurrent: state.loopCurrent,
        isShuffled: state.isShuffled,
        theme: state.theme,
        lcdFilterOn: state.lcdFilterOn,
      }),
      migrate: (persistedState, version) => {
        let state = persistedState as IpodStoreState; // Type assertion

        // If the persisted version is older than the current version, update defaults
        if (version < CURRENT_IPOD_STORE_VERSION) {
          console.log(
            `Migrating iPod store from version ${version} to ${CURRENT_IPOD_STORE_VERSION}`
          );
          state = {
            ...state, // Keep other persisted state
            tracks: DEFAULT_TRACKS, // Update to new defaults
            originalOrder: DEFAULT_TRACKS, // Update to new defaults
            currentIndex: 0, // Reset index
            // Reset other potentially conflicting state if necessary
            isPlaying: false,
            isShuffled: state.isShuffled, // Keep shuffle preference maybe? Or reset? Let's keep it for now.
          };
        }
        // Clean up potentially outdated fields if needed in future migrations
        // Example: delete state.someOldField;

        // Ensure the returned state matches the latest IpodStoreState structure
        // Remove fields not present in the latest partialize if necessary
        const partializedState = {
          tracks: state.tracks,
          originalOrder: state.originalOrder,
          currentIndex: state.currentIndex,
          loopAll: state.loopAll,
          loopCurrent: state.loopCurrent,
          isShuffled: state.isShuffled,
          theme: state.theme,
          lcdFilterOn: state.lcdFilterOn,
        };


        return partializedState as IpodStoreState; // Return the potentially migrated state
      },
      // Optional: Re-add partialize here if you want to exclude tracks/originalOrder AFTER migration
      // This prevents large defaults from always being in storage if they are static
      // partialize: (state) => ({
      //   currentIndex: state.currentIndex,
      //   loopAll: state.loopAll,
      //   loopCurrent: state.loopCurrent,
      //   isShuffled: state.isShuffled,
      //   theme: state.theme,
      //   lcdFilterOn: state.lcdFilterOn,
      //   // Exclude tracks and originalOrder if they match defaults and you want to save space
      // }),
    }
  )
); 