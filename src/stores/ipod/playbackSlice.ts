import type { DisplayMode } from "@/types/lyrics";
import type { IpodBacklightTimeout, IpodGet, IpodSet } from "./types";
import {
  getIndexFromSongId,
  getRandomTrackIdAvoidingRecent,
  shouldUpdatePlaybackTime,
  updatePlaybackHistory,
} from "./shared";

export function createPlaybackSlice(set: IpodSet, get: IpodGet) {
  return {
    setCurrentSongId: (songId: string | null) =>
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
            // Snap playback position to the start of the new track so any
            // player wired to `elapsedTime` (e.g. AppleMusicPlayerBridge's
            // `resumeAtSeconds`) doesn't carry the previous song's offset
            // into the new song.
            elapsedTime: 0,
            totalTime: 0,
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
    setIsPlaying: (playing: boolean) => {
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
    setShowVideo: (show: boolean) => {
      if (show && typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }
      set({ showVideo: show });
    },
    setDisplayMode: (mode: DisplayMode) => set({ displayMode: mode }),
    toggleBacklight: () =>
      set((state) => ({ backlightOn: !state.backlightOn })),
    setBacklightTimeout: (timeout: IpodBacklightTimeout) =>
      set({ backlightTimeout: timeout }),
    toggleLcdFilter: () =>
      set((state) => ({ lcdFilterOn: !state.lcdFilterOn })),
    toggleFullScreen: () =>
      set((state) => ({ isFullScreen: !state.isFullScreen })),
    setTheme: (theme: "classic" | "black" | "u2") => set({ theme }),
    setUiVariant: (variant: "classic" | "modern") => set({ uiVariant: variant }),
    nextTrack: () =>
      set((state) => {
        if (state.tracks.length === 0)
          return {
            currentSongId: null,
            currentLyrics: null,
            currentFuriganaMap: null,
          };

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
            const lastSongId =
              state.tracks[state.tracks.length - 1]?.id ?? null;
            const isSameTrack = lastSongId === state.currentSongId;
            return {
              currentSongId: lastSongId,
              currentLyrics: isSameTrack ? state.currentLyrics : null,
              currentFuriganaMap: isSameTrack ? state.currentFuriganaMap : null,
              isPlaying: false,
              ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
            };
          }
          nextSongId = state.tracks[nextIndex]?.id ?? null;
        }

        const isSameTrack = nextSongId === state.currentSongId;
        return {
          currentSongId: nextSongId,
          currentLyrics: isSameTrack ? state.currentLyrics : null,
          currentFuriganaMap: isSameTrack ? state.currentFuriganaMap : null,
          isPlaying: true,
          playbackHistory: newPlaybackHistory,
          historyPosition: -1, // Always reset to end when moving forward
          // Reset playback position so the new track starts at 0 instead
          // of inheriting the previous track's elapsedTime.
          ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
        };
      }),
    previousTrack: () =>
      set((state) => {
        if (state.tracks.length === 0)
          return {
            currentSongId: null,
            currentLyrics: null,
            currentFuriganaMap: null,
          };

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

        const isSameTrack = prevSongId === state.currentSongId;
        return {
          currentSongId: prevSongId,
          currentLyrics: isSameTrack ? state.currentLyrics : null,
          currentFuriganaMap: isSameTrack ? state.currentFuriganaMap : null,
          isPlaying: true,
          playbackHistory: newPlaybackHistory,
          historyPosition: -1,
          // Reset playback position so the new track starts at 0 instead
          // of inheriting the previous track's elapsedTime.
          ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
        };
      }),
    setElapsedTime: (time: number) =>
      set((state) =>
        shouldUpdatePlaybackTime(state.elapsedTime, time)
          ? { elapsedTime: time }
          : state
      ),
    setTotalTime: (time: number) =>
      set((state) =>
        shouldUpdatePlaybackTime(state.totalTime, time)
          ? { totalTime: time }
          : state
      ),
  };
}
