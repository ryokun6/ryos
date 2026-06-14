import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useIpodStore } from "@/stores/useIpodStore";
import { useMediaPlayerRefs } from "@/shared/media/useMediaPlayback";

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
  // Shared player refs + track-switch guard (also used by Karaoke).
  const {
    playerRef,
    fullScreenPlayerRef,
    isTrackSwitchingRef,
    trackSwitchTimeoutRef,
    userHasInteractedRef,
    startTrackSwitch,
  } = useMediaPlayerRefs();
  // iPod-only refs for analytics dedupe + skip-driven status suppression.
  const lastTrackedSongRef = useRef<{ trackId: string; elapsedTime: number } | null>(null);
  const skipOperationRef = useRef(false);

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

    if (typeof currentTime === "number" && Number.isFinite(currentTime)) {
      store.setElapsedTime(Math.max(0, currentTime));
    }

    if (store.isPlaying) {
      store.setIsPlaying(false);
    }

    if (store.librarySource === "appleMusic") {
      const maybeMusicKit =
        (internalPlayer as { pause?: () => void } | null | undefined) ??
        musicKitInstanceRef.current;
      try {
        maybeMusicKit?.pause?.();
      } catch (err) {
        console.warn("[apple music] pause before close failed", err);
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
