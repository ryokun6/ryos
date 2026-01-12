import { useCallback, useSyncExternalStore } from "react";

export function useIsMobile(breakpoint = 768) {
  const getSnapshot = useCallback(() => {
    const hasTouchScreen =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const hasSmallScreen = window.innerWidth < breakpoint;
    return hasTouchScreen || hasSmallScreen;
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
