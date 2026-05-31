import { useCallback, type RefObject } from "react";
import type ReactPlayer from "react-player";

export function useTvTogglePlay({
  isPlaying,
  togglePlay,
  playerRef,
  fullScreenPlayerRef,
}: {
  isPlaying: boolean;
  togglePlay: () => void;
  playerRef: RefObject<ReactPlayer | null>;
  fullScreenPlayerRef: RefObject<ReactPlayer | null>;
}) {
  return useCallback(() => {
    if (!isPlaying) {
      const playYt = (player: ReactPlayer | null) => {
        const internal = player?.getInternalPlayer?.();
        if (internal && typeof internal.playVideo === "function") {
          try {
            internal.playVideo();
          } catch {
            // Defensive: YT iframe may not be ready yet on first open.
          }
        }
      };
      playYt(playerRef.current);
      playYt(fullScreenPlayerRef.current);
    }
    togglePlay();
  }, [isPlaying, togglePlay, playerRef, fullScreenPlayerRef]);
}
