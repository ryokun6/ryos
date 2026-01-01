import { create } from "zustand";
import { createPersistedStore, type PersistedStoreMeta } from "./persistAdapter";
import { useIpodStore, Track } from "./useIpodStore";

/** Helper to get current index from song ID */
function getIndexFromSongId(tracks: Track[], songId: string | null): number {
  if (!songId || tracks.length === 0) return -1;
  const index = tracks.findIndex((t) => t.id === songId);
  return index >= 0 ? index : -1;
}

/** Get a random song ID avoiding the current song */
function getRandomSongId(tracks: Track[], currentSongId: string | null): string | null {
  if (tracks.length === 0) return null;
  if (tracks.length === 1) return tracks[0].id;
  
  const availableIds = tracks.map((t) => t.id).filter((id) => id !== currentSongId);
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

export interface KaraokeState extends KaraokeData, PersistedStoreMeta {
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
  createPersistedStore(
    (set, get) => ({
      ...initialKaraokeData,
      _updatedAt: Date.now(),

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

      setCurrentSongId: (songId) => set({ currentSongId: songId, _updatedAt: Date.now() }),

      togglePlay: () => {
        // Prevent playback when offline
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          return;
        }
        set((state) => ({ isPlaying: !state.isPlaying, _updatedAt: Date.now() }));
      },

      setIsPlaying: (playing) => {
        // Prevent starting playback when offline
        if (playing && typeof navigator !== "undefined" && !navigator.onLine) {
          return;
        }
        set({ isPlaying: playing, _updatedAt: Date.now() });
      },

      toggleLoopCurrent: () =>
        set((state) => ({ loopCurrent: !state.loopCurrent, _updatedAt: Date.now() })),

      toggleLoopAll: () => set((state) => ({ loopAll: !state.loopAll, _updatedAt: Date.now() })),

      toggleShuffle: () =>
        set((state) => ({
          isShuffled: !state.isShuffled,
          playbackHistory: !state.isShuffled ? [] : state.playbackHistory,
          _updatedAt: Date.now(),
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
            _updatedAt: Date.now(),
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
            _updatedAt: Date.now(),
          };
        }),

      toggleFullScreen: () =>
        set((state) => ({ isFullScreen: !state.isFullScreen, _updatedAt: Date.now() })),

      setFullScreen: (fullScreen) => set({ isFullScreen: fullScreen, _updatedAt: Date.now() }),
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
        _updatedAt: state._updatedAt,
        // Don't persist isPlaying or playbackHistory
      }),
      migrate: (persistedState, version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = persistedState as any;
        if (version < CURRENT_KARAOKE_STORE_VERSION) {
          console.log(
            `Migrating Karaoke store from version ${version} to ${CURRENT_KARAOKE_STORE_VERSION}`
          );
          const migrated = {
            ...state,
            currentSongId: null, // Reset - will pick first track
            isPlaying: false,
            playbackHistory: [],
          };
          if (!migrated._updatedAt) migrated._updatedAt = Date.now();
          return migrated;
        }
        if (!state._updatedAt) state._updatedAt = Date.now();
        return state;
      },
    }
  )
);
