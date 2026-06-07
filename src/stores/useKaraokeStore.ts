import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SetStateAction } from "react";
import { DisplayMode } from "@/types/lyrics";
import { useIpodStore, Track } from "./useIpodStore";
import {
  computeNextPlaylistId,
  computePreviousPlaylistId,
  getIndexFromId,
  toggleShufflePlaylistState,
} from "@/stores/helpers/createPlaylistStore";

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
        const tracks = useIpodStore.getState().tracks;
        return getIndexFromId(tracks, get().currentSongId);
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
        set((state) => toggleShufflePlaylistState(state)),

      nextTrack: () =>
        set((state) => {
          const tracks = useIpodStore.getState().tracks;
          const { nextId, playbackHistory, stopPlaying } = computeNextPlaylistId({
            items: tracks,
            currentId: state.currentSongId,
            loopAll: state.loopAll,
            loopCurrent: state.loopCurrent,
            isShuffled: state.isShuffled,
            playbackHistory: state.playbackHistory,
          });

          if (tracks.length === 0) {
            return { currentSongId: null };
          }

          return {
            currentSongId: nextId,
            isPlaying: stopPlaying ? false : true,
            playbackHistory,
          };
        }),

      previousTrack: () =>
        set((state) => {
          const tracks = useIpodStore.getState().tracks;
          const { prevId, playbackHistory } = computePreviousPlaylistId({
            items: tracks,
            currentId: state.currentSongId,
            isShuffled: state.isShuffled,
            playbackHistory: state.playbackHistory,
          });

          if (tracks.length === 0) {
            return { currentSongId: null };
          }

          return {
            currentSongId: prevId,
            isPlaying: true,
            playbackHistory,
          };
        }),

      toggleFullScreen: () => set((state) => ({ isFullScreen: !state.isFullScreen })),

      setFullScreen: (fullScreen) => set({ isFullScreen: fullScreen }),

      toggleKaraokeKtvRoomFx: () =>
        set((state) => ({ karaokeKtvRoomFx: !state.karaokeKtvRoomFx })),
      setKaraokeKtvRoomFx: (karaokeKtvRoomFx) => set({ karaokeKtvRoomFx }),

      setElapsedTime: (time) =>
        set((state) => ({
          elapsedTime:
            typeof time === "function" ? (time as (prev: number) => number)(state.elapsedTime) : time,
        })),
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
