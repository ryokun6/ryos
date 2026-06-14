import { useCallback, useEffect, useRef } from "react";
import type ReactPlayer from "react-player";
import type { Track } from "@/stores/useIpodStore";

/**
 * Shared YouTube/ReactPlayer playback machinery for media apps (iPod + Karaoke).
 *
 * Only the *mechanical* pieces that were duplicated near-verbatim live here:
 * - the dual player refs (window + fullscreen) and the track-switch guard,
 * - the negative-lyric-offset auto-seek on track change,
 * - the position sync when toggling between the window and fullscreen players.
 *
 * App-specific handlers (`handlePlay` / `handlePause` / `handleProgress` /
 * `handleTrackEnd` / seek) intentionally stay in each app: they differ in
 * analytics namespace, status glyphs, Apple Music, and Karaoke's listen-session
 * remote-control paths, so unifying them would be a leaky abstraction.
 */

export interface MediaPlayerRefs {
  playerRef: React.MutableRefObject<ReactPlayer | null>;
  fullScreenPlayerRef: React.MutableRefObject<ReactPlayer | null>;
  isTrackSwitchingRef: React.MutableRefObject<boolean>;
  trackSwitchTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  userHasInteractedRef: React.MutableRefObject<boolean>;
  /**
   * Mark a track switch as in-progress and auto-clear it after 2s so the
   * window/fullscreen players' transient play/pause events are ignored while
   * the new video loads.
   */
  startTrackSwitch: () => void;
}

/**
 * Owns the two ReactPlayer refs + the track-switch guard shared by both apps.
 * iPod composes this inside `useIpodPlayback` (which adds MusicKit-specific
 * refs + `pauseBeforeWindowClose`); Karaoke uses it directly.
 */
export function useMediaPlayerRefs(): MediaPlayerRefs {
  const playerRef = useRef<ReactPlayer | null>(null);
  const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);
  const isTrackSwitchingRef = useRef(false);
  const trackSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userHasInteractedRef = useRef(false);

  const startTrackSwitch = useCallback(() => {
    isTrackSwitchingRef.current = true;
    if (trackSwitchTimeoutRef.current) {
      clearTimeout(trackSwitchTimeoutRef.current);
    }
    // Allow 2 seconds for YouTube to load before accepting play/pause events.
    trackSwitchTimeoutRef.current = setTimeout(() => {
      isTrackSwitchingRef.current = false;
    }, 2000);
  }, []);

  return {
    playerRef,
    fullScreenPlayerRef,
    isTrackSwitchingRef,
    trackSwitchTimeoutRef,
    userHasInteractedRef,
    startTrackSwitch,
  };
}

export interface UseMediaTrackChangeResetParams {
  currentIndex: number;
  tracks: Track[];
  isFullScreen: boolean;
  playerRef: React.MutableRefObject<ReactPlayer | null>;
  fullScreenPlayerRef: React.MutableRefObject<ReactPlayer | null>;
  isTrackSwitchingRef: React.MutableRefObject<boolean>;
  trackSwitchTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  /** Sink for the playback clock (iPod / Karaoke store `setElapsedTime`). */
  setElapsedTime: (time: number) => void;
  /** Called with the seek target (seconds) after a negative-offset auto-seek. */
  onSeekStatus?: (seconds: number) => void;
}

/**
 * Reset the playback clock on track change and arm the track-switch guard.
 * Catches track changes from any source (AI tools, shared URLs, menu
 * selections). For tracks with a negative lyric offset, auto-seeks to where
 * lyrics time = 0 once the player is ready.
 */
export function useMediaTrackChangeReset({
  currentIndex,
  tracks,
  isFullScreen,
  playerRef,
  fullScreenPlayerRef,
  isTrackSwitchingRef,
  trackSwitchTimeoutRef,
  setElapsedTime,
  onSeekStatus,
}: UseMediaTrackChangeResetParams): void {
  // null initial value ensures the first render triggers the auto-skip check.
  const prevCurrentIndexRef = useRef<number | null>(null);
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (prevCurrentIndexRef.current !== currentIndex) {
      isTrackSwitchingRef.current = true;
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }

      const newTrack = tracks[currentIndex];
      const newLyricOffset = newTrack?.lyricOffset ?? 0;

      // For negative offset, auto-skip to where lyrics time = 0.
      // lyricsTime = playerTime + (lyricOffset / 1000); solve for lyricsTime = 0.
      // Only seek for a negative offset producing a target of at least 1s.
      const seekTarget = -newLyricOffset / 1000;

      if (newLyricOffset < 0 && seekTarget >= 1) {
        setElapsedTime(seekTarget);

        timeoutId = setTimeout(() => {
          isTrackSwitchingRef.current = false;
          const activePlayer = isFullScreen
            ? fullScreenPlayerRef.current
            : playerRef.current;
          if (activePlayer) {
            activePlayer.seekTo(seekTarget);
            onSeekStatus?.(seekTarget);
          }
        }, 2000);
        trackSwitchTimeoutRef.current = timeoutId;
      } else {
        // Start from the beginning for positive/zero/small-negative offsets.
        setElapsedTime(0);
        timeoutId = setTimeout(() => {
          isTrackSwitchingRef.current = false;
        }, 2000);
        trackSwitchTimeoutRef.current = timeoutId;
      }
    }
    prevCurrentIndexRef.current = currentIndex;
    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        if (trackSwitchTimeoutRef.current === timeoutId) {
          trackSwitchTimeoutRef.current = null;
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, tracks, isFullScreen, onSeekStatus, setElapsedTime]);
}

export interface UseMediaFullscreenSyncParams {
  isFullScreen: boolean;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  playerRef: React.MutableRefObject<ReactPlayer | null>;
  fullScreenPlayerRef: React.MutableRefObject<ReactPlayer | null>;
  isTrackSwitchingRef: React.MutableRefObject<boolean>;
  trackSwitchTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  /** Reads the current playback clock as a fallback when the player can't. */
  getElapsedTime: () => number;
  /**
   * Skip the seek-and-resume dance entirely (iPod Apple Music plays through a
   * single shared MusicKit instance, so there are never two iframes to sync).
   */
  skip?: boolean;
  /** Gate autoplay on entering fullscreen (iOS Safari blocks autoplay). */
  canAutoplay?: () => boolean;
  /**
   * When true, only resume on exit if the store isn't already playing
   * (avoids a redundant `setIsPlaying(true)` notification). iPod opts in.
   */
  guardRedundantResumeOnExit?: () => boolean;
  /** Side effect when fullscreen toggles (e.g. analytics). */
  onToggle?: (isOpen: boolean) => void;
}

/**
 * Sync playback position (and resume state) when toggling between the window
 * player and the fullscreen player.
 */
export function useMediaFullscreenSync({
  isFullScreen,
  isPlaying,
  setIsPlaying,
  playerRef,
  fullScreenPlayerRef,
  isTrackSwitchingRef,
  trackSwitchTimeoutRef,
  getElapsedTime,
  skip,
  canAutoplay,
  guardRedundantResumeOnExit,
  onToggle,
}: UseMediaFullscreenSyncParams): void {
  const prevFullScreenRef = useRef(isFullScreen);

  useEffect(() => {
    const timeoutIds = new Set<ReturnType<typeof setTimeout>>();
    const scheduleTimeout = (callback: () => void, delay: number) => {
      const timeoutId = setTimeout(() => {
        timeoutIds.delete(timeoutId);
        callback();
      }, delay);
      timeoutIds.add(timeoutId);
      return timeoutId;
    };

    if (isFullScreen !== prevFullScreenRef.current) {
      if (skip) {
        prevFullScreenRef.current = isFullScreen;
        return;
      }

      onToggle?.(isFullScreen);

      // Mark as track switching to prevent spurious play/pause events during sync.
      isTrackSwitchingRef.current = true;
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }

      if (isFullScreen) {
        // Entering fullscreen — sync position from window to fullscreen player.
        const currentTime =
          playerRef.current?.getCurrentTime() || getElapsedTime();
        const wasPlaying = isPlaying;

        // Wait for the fullscreen player to be ready before seeking.
        const checkAndSync = () => {
          const internalPlayer = fullScreenPlayerRef.current?.getInternalPlayer?.();
          if (
            internalPlayer &&
            typeof internalPlayer.getPlayerState === "function"
          ) {
            const playerState = internalPlayer.getPlayerState();
            // -1 = unstarted; wait for the player to be ready.
            if (playerState !== -1) {
              fullScreenPlayerRef.current?.seekTo(currentTime);
              if (wasPlaying && typeof internalPlayer.playVideo === "function") {
                if (!canAutoplay || canAutoplay()) {
                  internalPlayer.playVideo();
                }
              }
              trackSwitchTimeoutRef.current = scheduleTimeout(() => {
                isTrackSwitchingRef.current = false;
              }, 500);
              return;
            }
          }
          scheduleTimeout(checkAndSync, 100);
        };
        scheduleTimeout(checkAndSync, 100);
      } else {
        // Exiting fullscreen — sync position from fullscreen to window player.
        const currentTime =
          fullScreenPlayerRef.current?.getCurrentTime() || getElapsedTime();
        const wasPlaying = isPlaying;

        scheduleTimeout(() => {
          if (playerRef.current) {
            playerRef.current.seekTo(currentTime);
            const shouldResume =
              wasPlaying &&
              (!guardRedundantResumeOnExit || !guardRedundantResumeOnExit());
            if (shouldResume) {
              setIsPlaying(true);
            }
          }
          trackSwitchTimeoutRef.current = scheduleTimeout(() => {
            isTrackSwitchingRef.current = false;
          }, 500);
        }, 200);
      }
      prevFullScreenRef.current = isFullScreen;
    }
    return () => {
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutIds.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, isFullScreen, isPlaying, setIsPlaying]);
}
