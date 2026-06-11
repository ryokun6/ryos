import { useIpodStore } from "@/stores/useIpodStore";

/**
 * Narrow subscription to the iPod playback clock.
 *
 * `elapsedTime` updates ~20x/sec while a track plays. Subscribing to it from
 * `useIpodLogic` (or any other large hook) re-renders the entire iPod tree on
 * every tick, so only leaf components that actually display time should call
 * this hook.
 *
 * Pass `enabled: false` while the consuming UI is hidden (e.g. a closed
 * dialog) to opt out of tick re-renders entirely — the selector then returns
 * a constant `0`.
 */
export function useIpodElapsedTime(enabled: boolean = true): number {
  return useIpodStore((s) => (enabled ? s.elapsedTime : 0));
}
