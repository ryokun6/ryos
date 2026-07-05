import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type ReactPlayer from "react-player";
import { useIpodStore } from "@/stores/useIpodStore";
import { useTrackSwitchGuard } from "@/shared/media/useTrackSwitchGuard";
import { ipodLog } from "../logging";

type MusicKitLike = {
  currentPlaybackTime?: number;
  pause?: () => void;
} | null;

export function useIpodPlayback(options: {
  isWindowOpen: boolean;
  isFullScreen: boolean;
  musicKitInstanceRef: React.MutableRefObject<MusicKitLike>;
}) {
  const { isWindowOpen, isFullScreen, musicKitInstanceRef } = options;
  // NOTE: deliberately no `elapsedTime` subscription here. The playback clock
  // updates ~20x/sec; subscribing would re-run the entire iPod logic hook on
  // every tick. Leaf components use `useIpodElapsedTime()` instead, and logic
  // callbacks read `useIpodStore.getState().elapsedTime` on demand.
  const [totalTime, setTotalTime] = useState(0);
  const playerRef = useRef<ReactPlayer | null>(null);
  const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);
  const lastTrackedSongRef = useRef<{ trackId: string; elapsedTime: number } | null>(null);
  const skipOperationRef = useRef(false);
  const userHasInteractedRef = useRef(false);
  const { isTrackSwitchingRef, trackSwitchTimeoutRef, startTrackSwitch } =
    useTrackSwitchGuard({
      onGuardEnd: () => ipodLog.debug("Ended track-switch guard"),
    });

  const pauseBeforeWindowClose = useCallback(() => {
    const store = useIpodStore.getState();
    const activePlayer = isFullScreen
      ? fullScreenPlayerRef.current
      : playerRef.current;
    const playerTime = activePlayer?.getCurrentTime?.();
    const internalPlayer = (
      activePlayer as unknown as
        | {
            getInternalPlayer?: () => unknown;
          }
        | null
        | undefined
    )?.getInternalPlayer?.();
    const musicKitTime =
      typeof (internalPlayer as { currentPlaybackTime?: unknown } | null)
        ?.currentPlaybackTime === "number"
        ? (internalPlayer as { currentPlaybackTime: number }).currentPlaybackTime
        : typeof musicKitInstanceRef.current?.currentPlaybackTime === "number"
          ? musicKitInstanceRef.current.currentPlaybackTime
          : undefined;
    const currentTime =
      typeof playerTime === "number" && Number.isFinite(playerTime)
        ? playerTime
        : musicKitTime;
    ipodLog.debug("Pausing playback before window closes", {
      librarySource: store.librarySource,
      currentTrackId:
        store.librarySource === "appleMusic"
          ? store.appleMusicCurrentSongId
          : store.currentSongId,
      playbackRequested: store.playbackRequested,
      isPlaying: store.isPlaying,
      playerTime,
      musicKitTime,
      resolvedTime: currentTime,
      isFullScreen,
    });

    if (typeof currentTime === "number" && Number.isFinite(currentTime)) {
      store.setElapsedTime(Math.max(0, currentTime));
    }

    if (store.playbackRequested) {
      store.setIsPlaying(false);
    }

    if (store.librarySource === "appleMusic") {
      const maybeMusicKit =
        (internalPlayer as { pause?: () => void } | null | undefined) ??
        musicKitInstanceRef.current;
      try {
        maybeMusicKit?.pause?.();
      } catch (err) {
        ipodLog.warn("Could not pause Apple Music before window closed", {
          error: err,
        });
      }
    }
  }, [isFullScreen, musicKitInstanceRef]);

  useLayoutEffect(() => {
    if (!isWindowOpen) pauseBeforeWindowClose();
  }, [isWindowOpen, pauseBeforeWindowClose]);

  return {
    totalTime,
    setTotalTime,
    playerRef,
    fullScreenPlayerRef,
    lastTrackedSongRef,
    skipOperationRef,
    userHasInteractedRef,
    isTrackSwitchingRef,
    trackSwitchTimeoutRef,
    startTrackSwitch,
    pauseBeforeWindowClose,
  };
}
