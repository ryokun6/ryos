import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useIpodStore, Track } from "./useIpodStore";

/** Helper to get current index from song ID */
function getIndexFromSongId(tracks: Track[], songId: string | null): number {
  if (!songId || tracks.length === 0) return -1;
  const index = tracks.findIndex((t) => t.id === songId);
  return index >= 0 ? index : -1;
}

function getTrackIdsExcludingCurrent(
  tracks: Track[],
  currentSongId: string | null
): string[] {
  const ids: string[] = [];
  for (const track of tracks) {
    if (track.id !== currentSongId) {
      ids.push(track.id);
    }
  }
  return ids;
}

/** Get a random song ID avoiding the current song */
function getRandomSongId(tracks: Track[], currentSongId: string | null): string | null {
  if (tracks.length === 0) return null;
  if (tracks.length === 1) return tracks[0].id;
  
  const availableIds = getTrackIdsExcludingCurrent(tracks, currentSongId);
  if (availableIds.length === 0) return currentSongId;
  return availableIds[Math.floor(Math.random() * availableIds.length)];
}

interface KaraokeData {
  /** The ID of the currently playing song */
  currentSongId: string | null;
  isPlaying: boolean;
  loopCurrent: boolean;
  loopAll: boolean;
  isShuffled: boolean;
  /** Playback history for shuffle mode (song IDs) */
  playbackHistory: string[];
  isFullScreen: boolean;
}

export interface KaraokeState extends KaraokeData {
  // Getters
  getCurrentTrack: () => Track | null;
  getCurrentIndex: () => number;
  
  // Actions
  setCurrentSongId: (songId: string | null) => void;
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
  currentSongId: null,
  isPlaying: false,
  loopCurrent: false,
  loopAll: true,
  isShuffled: false,
  playbackHistory: [],
  isFullScreen: false,
};

const CURRENT_KARAOKE_STORE_VERSION = 2; // Updated for currentSongId

export const useKaraokeStore = create<KaraokeState>()(
  persist(
    (set, get) => ({
      ...initialKaraokeData,

      // Getter to get current track from iPod library
      getCurrentTrack: () => {
        const { currentSongId } = get();
        const tracks = useIpodStore.getState().tracks;
        if (!currentSongId) return tracks[0] ?? null;
        return tracks.find((t) => t.id === currentSongId) ?? null;
      },

      // Getter to get current index (computed from currentSongId)
      getCurrentIndex: () => {
        const { currentSongId } = get();
        const tracks = useIpodStore.getState().tracks;
        return getIndexFromSongId(tracks, currentSongId);
      },

      setCurrentSongId: (songId) => set({ currentSongId: songId }),

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
        set((state) => ({
          isShuffled: !state.isShuffled,
          playbackHistory: !state.isShuffled ? [] : state.playbackHistory,
        })),

      nextTrack: () =>
        set((state) => {
          const tracks = useIpodStore.getState().tracks;
          if (tracks.length === 0) return { currentSongId: null };

          let nextSongId: string | null;
          let newPlaybackHistory = state.playbackHistory;

          if (state.loopCurrent) {
            // Stay on current track
            nextSongId = state.currentSongId;
          } else if (state.isShuffled) {
            // Shuffle mode - add current to history and pick random
            if (state.currentSongId) {
              newPlaybackHistory = [...state.playbackHistory, state.currentSongId].slice(-50);
            }
            nextSongId = getRandomSongId(tracks, state.currentSongId);
          } else {
            // Sequential mode
            const currentIndex = getIndexFromSongId(tracks, state.currentSongId);
            const nextIndex = currentIndex === -1 ? 0 : currentIndex + 1;
            
            if (nextIndex >= tracks.length) {
              if (state.loopAll) {
                nextSongId = tracks[0]?.id ?? null;
              } else {
                // Stop at end
                return { 
                  currentSongId: tracks[tracks.length - 1]?.id ?? null, 
                  isPlaying: false 
                };
              }
            } else {
              nextSongId = tracks[nextIndex]?.id ?? null;
            }
          }

          return { 
            currentSongId: nextSongId, 
            isPlaying: true,
            playbackHistory: newPlaybackHistory,
          };
        }),

      previousTrack: () =>
        set((state) => {
          const tracks = useIpodStore.getState().tracks;
          if (tracks.length === 0) return { currentSongId: null };

          let prevSongId: string | null;
          let newPlaybackHistory = state.playbackHistory;

          if (state.isShuffled && state.playbackHistory.length > 0) {
            // Shuffle mode - go back in history
            const lastSongId = state.playbackHistory[state.playbackHistory.length - 1];
            if (lastSongId && tracks.some((t) => t.id === lastSongId)) {
              prevSongId = lastSongId;
              newPlaybackHistory = state.playbackHistory.slice(0, -1);
            } else {
              prevSongId = getRandomSongId(tracks, state.currentSongId);
            }
          } else {
            // Sequential mode
            const currentIndex = getIndexFromSongId(tracks, state.currentSongId);
            const prevIndex = currentIndex <= 0 ? tracks.length - 1 : currentIndex - 1;
            prevSongId = tracks[prevIndex]?.id ?? null;
          }

          return { 
            currentSongId: prevSongId, 
            isPlaying: true,
            playbackHistory: newPlaybackHistory,
          };
        }),

      toggleFullScreen: () => set((state) => ({ isFullScreen: !state.isFullScreen })),

      setFullScreen: (fullScreen) => set({ isFullScreen: fullScreen }),
    }),
    {
      name: "ryos:karaoke",
      version: CURRENT_KARAOKE_STORE_VERSION,
      partialize: (state) => ({
        currentSongId: state.currentSongId,
        loopCurrent: state.loopCurrent,
        loopAll: state.loopAll,
        isShuffled: state.isShuffled,
        isFullScreen: state.isFullScreen,
        // Don't persist isPlaying or playbackHistory
      }),
      migrate: (persistedState, version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = persistedState as any;
        if (version < CURRENT_KARAOKE_STORE_VERSION) {
          console.log(
            `Migrating Karaoke store from version ${version} to ${CURRENT_KARAOKE_STORE_VERSION}`
          );
          return {
            ...state,
            currentSongId: null, // Reset - will pick first track
            isPlaying: false,
            playbackHistory: [],
          };
        }
        return state;
      },
    }
  )
);
