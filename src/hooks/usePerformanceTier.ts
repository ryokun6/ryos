import { useCallback, useSyncExternalStore } from "react";
import {
  getPerformanceTier,
  type PerformanceTier,
} from "@/utils/performanceTier";

/**
 * Reactive {@link PerformanceTier} for the current device.
 *
 * Hardware capabilities are probed once and cached; this hook re-evaluates the
 * tier when the pointer type or viewport changes (e.g. plugging in a mouse,
 * device rotation) so the touch/mobile classification stays correct.
 */
export function usePerformanceTier(): PerformanceTier {
  const subscribe = useCallback((callback: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)")
        : null;
    window.addEventListener("resize", callback);
    mql?.addEventListener?.("change", callback);
    return () => {
      window.removeEventListener("resize", callback);
      mql?.removeEventListener?.("change", callback);
    };
  }, []);

  const getSnapshot = useCallback(() => getPerformanceTier(), []);
  const getServerSnapshot = useCallback((): PerformanceTier => "full", []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
