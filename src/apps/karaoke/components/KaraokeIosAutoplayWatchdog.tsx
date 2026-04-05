import { useEffect, type MutableRefObject } from "react";
import { useKaraokeStore } from "@/stores/useKaraokeStore";

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const isIOS = /iP(hone|od|ad)/.test(ua);
const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
const isIOSSafari = isIOS && isSafari;

interface KaraokeIosAutoplayWatchdogProps {
  listenSession: unknown;
  isListenSessionDj: boolean;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  showStatus: (message: string) => void;
  userHasInteractedRef: MutableRefObject<boolean>;
}

/**
 * Isolated subscription to elapsed time for iOS Safari blocked-autoplay detection.
 * Keeps high-frequency ticks out of KaraokeAppComponent / menu / toolbar.
 */
export function KaraokeIosAutoplayWatchdog({
  listenSession,
  isListenSessionDj,
  isPlaying,
  setIsPlaying,
  showStatus,
  userHasInteractedRef,
}: KaraokeIosAutoplayWatchdogProps) {
  const elapsedTime = useKaraokeStore((s) => s.elapsedTime);

  useEffect(() => {
    if (
      (listenSession && !isListenSessionDj) ||
      !isPlaying ||
      !isIOSSafari ||
      userHasInteractedRef.current
    ) {
      return;
    }

    const startElapsed = elapsedTime;
    const timer = setTimeout(() => {
      if (useKaraokeStore.getState().isPlaying && useKaraokeStore.getState().elapsedTime === startElapsed) {
        setIsPlaying(false);
        showStatus("⏸");
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [
    elapsedTime,
    isIOSSafari,
    isListenSessionDj,
    isPlaying,
    listenSession,
    setIsPlaying,
    showStatus,
    userHasInteractedRef,
  ]);

  return null;
}
