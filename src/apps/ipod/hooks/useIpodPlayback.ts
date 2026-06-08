import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type ReactPlayer from "react-player";
import { useIpodStore } from "@/stores/useIpodStore";

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
  const elapsedTime = useIpodStore((state) => state.elapsedTime);
  const [totalTime, setTotalTime] = useState(0);
  const playerRef = useRef<ReactPlayer | null>(null);
  const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);
  const lastTrackedSongRef = useRef<{ trackId: string; elapsedTime: number } | null>(null);
  const skipOperationRef = useRef(false);
  const userHasInteractedRef = useRef(false);
  const isTrackSwitchingRef = useRef(false);
  const trackSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    elapsedTime,
    totalTime,
    setTotalTime,
    playerRef,
    fullScreenPlayerRef,
    lastTrackedSongRef,
    skipOperationRef,
    userHasInteractedRef,
    isTrackSwitchingRef,
    trackSwitchTimeoutRef,
    pauseBeforeWindowClose,
  };
}
