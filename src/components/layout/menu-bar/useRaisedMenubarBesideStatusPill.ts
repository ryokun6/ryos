import { useCallback, useSyncExternalStore } from "react";
import {
  measureMenubarSafeTop,
  shouldRaiseMenubarBesideStatusPill,
} from "./menubarEdgePadding";

/**
 * Viewport width while the menubar row sits beside the system status pill
 * (inner display upright, iOS shell only), or 0 everywhere else. Re-read on
 * resize and orientation change, which is how a fold or rotation arrives.
 */
export function useRaisedMenubarBesideStatusPill(iosShell: boolean): number {
  const getSnapshot = useCallback(() => {
    if (!iosShell || typeof window === "undefined") return 0;
    const coarseTouch =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const viewportWidth = window.innerWidth;
    const raised = shouldRaiseMenubarBesideStatusPill({
      iosShell,
      coarseTouch,
      viewportWidth,
      viewportHeight: window.innerHeight,
      safeTop: measureMenubarSafeTop(),
    });
    return raised ? viewportWidth : 0;
  }, [iosShell]);

  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener("resize", callback);
    window.addEventListener("orientationchange", callback);
    return () => {
      window.removeEventListener("resize", callback);
      window.removeEventListener("orientationchange", callback);
    };
  }, []);

  const getServerSnapshot = useCallback(() => 0, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
