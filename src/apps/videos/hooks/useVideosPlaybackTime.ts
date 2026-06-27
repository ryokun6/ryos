import { useVideoStore } from "@/stores/useVideoStore";

/**
 * Narrow subscriptions to the Videos playback clock.
 *
 * The clock updates ~1x/sec while a video plays. Reading it from
 * `useVideosLogic` (whose state the top-level component subscribes to) would
 * re-render the entire Videos tree on every tick, so only the leaf components
 * that display time — the seek bar fill and the LCD time readout — call these
 * hooks.
 *
 * `playedSeconds` is fine-grained (smooth seek-bar fill); `elapsedTime` is the
 * floored-second value that flips at most ~1x/sec (LCD readout).
 */
export function useVideosPlayedSeconds(): number {
  return useVideoStore((s) => s.playedSeconds);
}

export function useVideosElapsedTime(): number {
  return useVideoStore((s) => s.elapsedTime);
}
