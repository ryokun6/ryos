import { useSyncExternalStore, useCallback } from "react";

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
      mediaQuery.addEventListener("change", callback);
      return () => mediaQuery.removeEventListener("change", callback);
    },
    [query]
  );

  // Memoize the getSnapshot function based on the query
  const getSnapshot = useCallback(() => {
    return window.matchMedia(query).matches;
  }, [query]);

  // Server snapshot always returns false (SSR)
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
