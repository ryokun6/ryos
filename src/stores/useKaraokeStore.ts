import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SetStateAction } from "react";
import { DisplayMode } from "@/types/lyrics";
import { useIpodStore, Track } from "./useIpodStore";
import { shouldUpdatePlaybackTime } from "./playbackTime";
import { getIndexFromSongId } from "@/shared/media/mediaQueue";

/** Get a random song ID avoiding the current song */
function getRandomSongId(tracks: Track[], currentSongId: string | null): string | null {
  if (tracks.length === 0) return null;
  if (tracks.length === 1) return tracks[0].id;
  
  const availableIds = tracks.reduce<string[]>((acc, track) => {
    if (track.id !== currentSongId) {
      acc.push(track.id);
    }
    return acc;
  }, []);
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
  /** Ambient fullscreen “audience” reaction bursts – solo karaoke KTV vibes */
  karaokeKtvRoomFx: boolean;
  /** Playback history for shuffle mode (song IDs) */
  playbackHistory: string[];
  isFullScreen: boolean;
  /** Current playback position in seconds (not persisted, synced from ReactPlayer) */
  elapsedTime: number;
  /** Total duration of current track in seconds (not persisted, synced from ReactPlayer) */
  totalTime: number;
  /** Visual background mode (independent from iPod display mode) */
  displayMode: DisplayMode;
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
  toggleKaraokeKtvRoomFx: () => void;
  setKaraokeKtvRoomFx: (value: boolean) => void;
  setElapsedTime: (time: SetStateAction<number>) => void;
  setTotalTime: (time: number) => void;
  setDisplayMode: (mode: DisplayMode) => void;
}

const initialKaraokeData: KaraokeData = {
  currentSongId: null,
  isPlaying: false,
  loopCurrent: false,
  loopAll: true,
  isShuffled: false,
  karaokeKtvRoomFx: true,
  playbackHistory: [],
  isFullScreen: false,
  elapsedTime: 0,
  totalTime: 0,
  displayMode: DisplayMode.Video,
};

const CURRENT_KARAOKE_STORE_VERSION = 3; // Independent displayMode from iPod store

function readLegacyIpodDisplayMode(): DisplayMode {
  try {
    const ipodRaw = localStorage.getItem("ryos:ipod");
    if (!ipodRaw) return DisplayMode.Video;
    const parsed = JSON.parse(ipodRaw) as {
      state?: { displayMode?: string };
    };
    const mode = parsed.state?.displayMode;
    if (mode === "liquid") return DisplayMode.Water;
    if (
      mode === DisplayMode.Video ||
      mode === DisplayMode.Cover ||
      mode === DisplayMode.Landscapes ||
      mode === DisplayMode.Shader ||
      mode === DisplayMode.Mesh ||
      mode === DisplayMode.Water
    ) {
      return mode;
    }
  } catch {
    // ignore parse errors
  }
  return DisplayMode.Video;
}

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

      toggleKaraokeKtvRoomFx: () =>
        set((state) => ({ karaokeKtvRoomFx: !state.karaokeKtvRoomFx })),
      setKaraokeKtvRoomFx: (karaokeKtvRoomFx) => set({ karaokeKtvRoomFx }),

      setElapsedTime: (time) =>
        set((state) => {
          const next =
            typeof time === "function"
              ? (time as (prev: number) => number)(state.elapsedTime)
              : time;
          // Throttle high-frequency player progress ticks (same epsilon as
          // iPod) so subscribers don't re-render on every sub-frame update.
          return shouldUpdatePlaybackTime(state.elapsedTime, next)
            ? { elapsedTime: next }
            : state;
        }),
      setTotalTime: (time) => set({ totalTime: time }),

      setDisplayMode: (mode) => set({ displayMode: mode }),
    }),
    {
      name: "ryos:karaoke",
      version: CURRENT_KARAOKE_STORE_VERSION,
      partialize: (state) => ({
        currentSongId: state.currentSongId,
        loopCurrent: state.loopCurrent,
        loopAll: state.loopAll,
        isShuffled: state.isShuffled,
        karaokeKtvRoomFx: state.karaokeKtvRoomFx,
        isFullScreen: state.isFullScreen,
        displayMode: state.displayMode,
        // Don't persist isPlaying or playbackHistory
      }),
      migrate: (persistedState, version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let state = persistedState as any;
        if (version < 2) {
          console.log(
            `Migrating Karaoke store from version ${version} to ${CURRENT_KARAOKE_STORE_VERSION}`
          );
          state = {
            ...state,
            currentSongId: null,
            isPlaying: false,
            playbackHistory: [],
          };
        }
        if (version < 3) {
          state = {
            ...state,
            displayMode: state.displayMode ?? readLegacyIpodDisplayMode(),
          };
        }
        return state;
      },
    }
  )
);
