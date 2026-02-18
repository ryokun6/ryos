import { useCallback, useSyncExternalStore } from "react";

const subscribe = (callback: () => void) => {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
};

const getServerSnapshot = () => false;

const hasTouch = () =>
  "ontouchstart" in window || navigator.maxTouchPoints > 0;

/** Touch OR small screen — true for tablets and phones */
export function useIsMobile(breakpoint = 768) {
  const getSnapshot = useCallback(
    () => hasTouch() || window.innerWidth < breakpoint,
    [breakpoint]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Touch AND small screen — true only for phone-sized devices */
export function useIsPhone(breakpoint = 640) {
  const getSnapshot = useCallback(
    () => hasTouch() && window.innerWidth < breakpoint,
    [breakpoint]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
