import { useCallback, useSyncExternalStore } from "react";

export function useIsPhone(breakpoint = 640) {
  const getSnapshot = useCallback(() => {
    const hasTouchScreen =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const hasSmallScreen = window.innerWidth < breakpoint;
    // Only consider it a phone if it has both touch screen and small screen
    return hasTouchScreen && hasSmallScreen;
  }, [breakpoint]);

  const subscribe = useCallback(
    (callback: () => void) => {
      window.addEventListener("resize", callback);
      return () => window.removeEventListener("resize", callback);
    },
    []
  );

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}