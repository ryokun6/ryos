import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useIpodStore, Track } from "./useIpodStore";

interface KaraokeData {
  currentIndex: number;
  isPlaying: boolean;
  loopCurrent: boolean;
  loopAll: boolean;
  isShuffled: boolean;
  shuffleOrder: number[];
  isFullScreen: boolean;
}

export interface KaraokeState extends KaraokeData {
  // Getters
  getCurrentTrack: () => Track | null;
  
  // Actions
  setCurrentIndex: (index: number) => void;
  togglePlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  toggleLoopCurrent: () => void;
  toggleLoopAll: () => void;
  toggleShuffle: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  toggleFullScreen: () => void;
  setFullScreen: (fullScreen: boolean) => void;
}

const initialKaraokeData: KaraokeData = {
  currentIndex: 0,
  isPlaying: false,
  loopCurrent: false,
  loopAll: true,
  isShuffled: false,
  shuffleOrder: [],
  isFullScreen: false,
};

const CURRENT_KARAOKE_STORE_VERSION = 1;

// Helper function to generate shuffle order
const generateShuffleOrder = (length: number): number[] => {
  const order = [...Array(length).keys()];
  // Fisher-Yates shuffle
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

export const useKaraokeStore = create<KaraokeState>()(
  persist(
    (set, get) => ({
      ...initialKaraokeData,

      // Getter to get current track from iPod library
      getCurrentTrack: () => {
        const { currentIndex } = get();
        const tracks = useIpodStore.getState().tracks;
        if (currentIndex >= 0 && currentIndex < tracks.length) {
          return tracks[currentIndex];
        }
        return null;
      },

      setCurrentIndex: (index) => set({ currentIndex: index }),

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

      toggleLoopCurrent: () => set((state) => ({ loopCurrent: !state.loopCurrent })),

      toggleLoopAll: () => set((state) => ({ loopAll: !state.loopAll })),

      toggleShuffle: () =>
        set((state) => {
          const newShuffleState = !state.isShuffled;
          const tracks = useIpodStore.getState().tracks;
          return {
            isShuffled: newShuffleState,
            shuffleOrder: newShuffleState ? generateShuffleOrder(tracks.length) : [],
          };
        }),

      nextTrack: () =>
        set((state) => {
          const tracks = useIpodStore.getState().tracks;
          if (tracks.length === 0) return { currentIndex: -1 };

          let next: number;

          if (state.loopCurrent) {
            // Stay on current track
            next = state.currentIndex;
          } else if (state.isShuffled && state.shuffleOrder.length > 0) {
            // Shuffle mode
            const currentShuffleIndex = state.shuffleOrder.indexOf(state.currentIndex);
            const nextShuffleIndex = (currentShuffleIndex + 1) % state.shuffleOrder.length;
            next = state.shuffleOrder[nextShuffleIndex];
          } else {
            // Sequential mode
            next = state.currentIndex + 1;
            if (next >= tracks.length) {
              if (state.loopAll) {
                next = 0;
              } else {
                // Stop at end
                return { currentIndex: tracks.length - 1, isPlaying: false };
              }
            }
          }

          return { currentIndex: next, isPlaying: true };
        }),

      previousTrack: () =>
        set((state) => {
          const tracks = useIpodStore.getState().tracks;
          if (tracks.length === 0) return { currentIndex: -1 };

          let prev: number;

          if (state.isShuffled && state.shuffleOrder.length > 0) {
            // Shuffle mode - go back in shuffle order
            const currentShuffleIndex = state.shuffleOrder.indexOf(state.currentIndex);
            const prevShuffleIndex =
              currentShuffleIndex === 0
                ? state.shuffleOrder.length - 1
                : currentShuffleIndex - 1;
            prev = state.shuffleOrder[prevShuffleIndex];
          } else {
            // Sequential mode
            prev = state.currentIndex - 1;
            if (prev < 0) {
              if (state.loopAll) {
                prev = tracks.length - 1;
              } else {
                prev = 0;
              }
            }
          }

          return { currentIndex: prev, isPlaying: true };
        }),

      toggleFullScreen: () => set((state) => ({ isFullScreen: !state.isFullScreen })),

      setFullScreen: (fullScreen) => set({ isFullScreen: fullScreen }),
    }),
    {
      name: "ryos:karaoke",
      version: CURRENT_KARAOKE_STORE_VERSION,
      partialize: (state) => ({
        currentIndex: state.currentIndex,
        loopCurrent: state.loopCurrent,
        loopAll: state.loopAll,
        isShuffled: state.isShuffled,
        isFullScreen: state.isFullScreen,
        // Don't persist isPlaying or shuffleOrder
      }),
      migrate: (persistedState, version) => {
        const state = persistedState as KaraokeState;
        if (version < CURRENT_KARAOKE_STORE_VERSION) {
          console.log(
            `Migrating Karaoke store from version ${version} to ${CURRENT_KARAOKE_STORE_VERSION}`
          );
          return {
            ...state,
            isPlaying: false,
            shuffleOrder: [],
          };
        }
        return state;
      },
    }
  )
);
