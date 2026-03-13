import { useSyncExternalStore, useCallback, useEffect } from "react";
import { debugLog } from "@/lib/debugLog";

/**
 * Hook that subscribes to a media query and returns whether it matches.
 * Uses useSyncExternalStore for proper React 18 concurrent mode support.
 *
 * @param query - The media query string to match (e.g., "(min-width: 768px)")
 * @returns true if the media query matches, false otherwise
 *
 * @example
 * const isMobile = useMediaQuery("(max-width: 767px)");
 * const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
 */
export function useMediaQuery(query: string): boolean {
  // Memoize the subscribe function based on the query
  const subscribe = useCallback(
    (callback: () => void) => {
      const mediaQuery = window.matchMedia(query);
      const handleChange = (event: MediaQueryListEvent) => {
        // #region agent log
        debugLog({
          hypothesisId: "A",
          location: "src/hooks/useMediaQuery.ts:handleChange",
          message: "media query change event",
          data: {
            query,
            innerWidth: window.innerWidth,
            matches: event.matches,
          },
        });
        // #endregion
        callback();
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    },
    [query]
  );

  // Memoize the getSnapshot function based on the query
  const getSnapshot = useCallback(() => {
    return window.matchMedia(query).matches;
  }, [query]);

  // Server snapshot always returns false (SSR)
  const getServerSnapshot = useCallback(() => false, []);

  const matches = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // #region agent log
    debugLog({
      hypothesisId: "A",
      location: "src/hooks/useMediaQuery.ts:useEffect",
      message: "media query snapshot observed",
      data: {
        query,
        innerWidth: window.innerWidth,
        matches,
      },
    });
    // #endregion
  }, [matches, query]);

  return matches;
}
