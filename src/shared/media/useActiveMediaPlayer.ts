import { useCallback } from "react";

/**
 * Selects the player instance that is currently visible — the fullscreen
 * portal player while fullscreen is active, the windowed player otherwise.
 * Shared by the media apps' seek / listen-sync / restart paths.
 */
export function useActiveMediaPlayer<T>(
  isFullScreen: boolean,
  playerRef: React.MutableRefObject<T | null>,
  fullScreenPlayerRef: React.MutableRefObject<T | null>
): () => T | null {
  return useCallback(
    () => (isFullScreen ? fullScreenPlayerRef.current : playerRef.current),
    [isFullScreen, playerRef, fullScreenPlayerRef]
  );
}
