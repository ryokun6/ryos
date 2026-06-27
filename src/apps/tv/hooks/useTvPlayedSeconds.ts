import { useTvStore } from "@/stores/useTvStore";

/**
 * Narrow subscription to the TV playback clock.
 *
 * `playedSeconds` updates ~1x/sec while a video plays. Reading it from
 * `useTvLogic` (or threading it through the controller) re-renders the entire
 * TV tree on every tick, so only the leaf that actually displays time-aligned
 * content — the MTV closed-caption overlay — should call this hook.
 *
 * Pass `enabled: false` while the consuming UI is hidden so the selector
 * returns a constant `0` and the leaf opts out of tick re-renders entirely.
 */
export function useTvPlayedSeconds(enabled: boolean = true): number {
  return useTvStore((s) => (enabled ? s.playedSeconds : 0));
}
