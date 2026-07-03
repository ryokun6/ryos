import { useEffect, useRef } from "react";
import { formatSecondsAsMinutesSeconds } from "@/utils/timeFormat";
import type { TrackSwitchGuard } from "./useTrackSwitchGuard";

interface LyricOffsetTrack {
  id: string;
  lyricOffset?: number;
}

/**
 * Where playback should start for a track's lyric offset. Only a negative
 * offset produces a positive seek target; targets under 1s start from 0.
 * Formula: lyricsTime = playerTime + (lyricOffset / 1000); when
 * lyricsTime = 0, playerTime = -lyricOffset / 1000.
 */
export function getLyricOffsetSeekTarget(lyricOffset: number): number | null {
  const seekTarget = -lyricOffset / 1000;
  return lyricOffset < 0 && seekTarget >= 1 ? seekTarget : null;
}

/**
 * MediaCore track-change guard + negative-lyric-offset auto-seek (Phase 4).
 *
 * On every track change (from any source — AI tools, shared URLs, menu
 * selections) the iPod and Karaoke apps arm the track-switch guard, reset
 * the playback clock, and — when the new track has a negative lyric offset —
 * seek to where lyrics time hits 0 once the player has loaded.
 *
 * Formula: lyricsTime = playerTime + (lyricOffset / 1000); when
 * lyricsTime = 0, playerTime = -lyricOffset / 1000. Only negative offsets
 * produce a positive seek target, and targets under 1s just start from 0.
 */
export function useLyricOffsetTrackChange(args: {
  currentIndex: number;
  tracks: readonly LyricOffsetTrack[];
  isFullScreen: boolean;
  guard: TrackSwitchGuard;
  getActivePlayer: () => { seekTo: (seconds: number) => void } | null;
  setElapsedTime: (seconds: number) => void;
  showStatus: (message: string) => void;
  /** Optional app-specific debug logging on each track change. */
  onTrackChange?: (info: {
    previousIndex: number | null;
    currentIndex: number;
    trackId: string | null;
    lyricOffset: number;
  }) => void;
}): void {
  const {
    currentIndex,
    tracks,
    isFullScreen,
    guard,
    getActivePlayer,
    setElapsedTime,
    showStatus,
    onTrackChange,
  } = args;
  const { isTrackSwitchingRef, trackSwitchTimeoutRef } = guard;
  // Using null as the initial value ensures the first render triggers the
  // auto-skip check.
  const prevCurrentIndexRef = useRef<number | null>(null);
  const onTrackChangeRef = useRef(onTrackChange);
  onTrackChangeRef.current = onTrackChange;

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (prevCurrentIndexRef.current !== currentIndex) {
      const newTrack = tracks[currentIndex];
      const newLyricOffset = newTrack?.lyricOffset ?? 0;
      onTrackChangeRef.current?.({
        previousIndex: prevCurrentIndexRef.current,
        currentIndex,
        trackId: newTrack?.id ?? null,
        lyricOffset: newLyricOffset,
      });

      isTrackSwitchingRef.current = true;
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }

      const seekTarget = getLyricOffsetSeekTarget(newLyricOffset);

      if (seekTarget !== null) {
        setElapsedTime(seekTarget);

        timeoutId = setTimeout(() => {
          isTrackSwitchingRef.current = false;
          const activePlayer = getActivePlayer();
          if (activePlayer) {
            activePlayer.seekTo(seekTarget);
            showStatus(`▶ ${formatSecondsAsMinutesSeconds(seekTarget)}`);
          }
        }, 2000);
        trackSwitchTimeoutRef.current = timeoutId;
      } else {
        // Start from the beginning for positive/zero or small negative offsets.
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
    // isFullScreen re-arms the effect so the deferred seek targets the active
    // player, matching the historical per-app effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentIndex,
    tracks,
    isFullScreen,
    getActivePlayer,
    setElapsedTime,
    showStatus,
  ]);
}
