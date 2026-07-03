import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SetStateAction } from "react";
import { DisplayMode } from "@/types/lyrics";
import { useIpodStore, Track } from "./useIpodStore";
import { shouldUpdatePlaybackTime } from "./playbackTime";
import {
  requestPlayback,
  resetPlaybackConfirmation,
  stopPlayback,
} from "@/shared/media/confirmedPlayback";
import {
  KARAOKE_NAVIGATION,
  computeNextNavigation,
  computePreviousNavigation,
  createTransportActions,
  findMediaIndexById,
} from "@/shared/media/transport";

interface KaraokeData {
  /** The ID of the currently playing song */
  currentSongId: string | null;
  /** Desired player state, including an in-flight play attempt. */
  playbackRequested: boolean;
  /** True only after ReactPlayer emits `onPlay`. */
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
  confirmPlayback: () => void;
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
  ...stopPlayback(),
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
        return findMediaIndexById(tracks, currentSongId);
      },

      setCurrentSongId: (songId) =>
        set((state) => ({
          currentSongId: songId,
          ...(songId !== state.currentSongId
            ? resetPlaybackConfirmation(state)
            : {}),
        })),

      ...createTransportActions<KaraokeState>(set, { guardOffline: true }),

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
          const decision = computeNextNavigation(
            {
              items: tracks,
              currentId: state.currentSongId,
              loopCurrent: state.loopCurrent,
              loopAll: state.loopAll,
              isShuffled: state.isShuffled,
              history: state.playbackHistory,
            },
            KARAOKE_NAVIGATION
          );

          if (decision.kind === "empty") {
            return { currentSongId: null, ...stopPlayback() };
          }
          if (decision.kind === "stop") {
            return { currentSongId: decision.id, ...stopPlayback() };
          }
          return {
            currentSongId: decision.id,
            ...requestPlayback(),
            playbackHistory: decision.history,
          };
        }),

      previousTrack: () =>
        set((state) => {
          const tracks = useIpodStore.getState().tracks;
          const decision = computePreviousNavigation(
            {
              items: tracks,
              currentId: state.currentSongId,
              loopCurrent: state.loopCurrent,
              loopAll: state.loopAll,
              isShuffled: state.isShuffled,
              history: state.playbackHistory,
            },
            KARAOKE_NAVIGATION
          );

          if (decision.kind === "empty") {
            return { currentSongId: null, ...stopPlayback() };
          }
          return {
            currentSongId: decision.id,
            ...requestPlayback(),
            playbackHistory: decision.history,
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
    }
  )
);
