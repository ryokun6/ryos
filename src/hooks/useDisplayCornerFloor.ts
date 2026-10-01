import { useCallback, useSyncExternalStore } from "react";
import {
  displayCornerFloorMediaQuery,
  shouldApplyDisplayCornerFloor,
} from "@/components/layout/menu-bar/menubarEdgePadding";

function readDisplayCornerFloor(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  const coarseTouch = window.matchMedia(displayCornerFloorMediaQuery()).matches;
  return shouldApplyDisplayCornerFloor({
    coarseTouch,
    viewportWidth: window.innerWidth,
  });
}

/**
 * True on a wide coarse-touch viewport (iPhone Duo open pose, iPad).
 * False on desktop browsers and on phone-width layouts, including closed Duo.
 */
export function useDisplayCornerFloor(): boolean {
  const subscribe = useCallback((callback: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return () => {};
    }
    const media = window.matchMedia(displayCornerFloorMediaQuery());
    media.addEventListener("change", callback);
    window.addEventListener("resize", callback);
    return () => {
      media.removeEventListener("change", callback);
      window.removeEventListener("resize", callback);
    };
  }, []);

  const getSnapshot = useCallback(() => readDisplayCornerFloor(), []);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
