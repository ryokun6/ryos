import { useMemo, useEffect, useRef } from "react";
import { useDisplaySettingsStore, INDEXEDDB_PREFIX } from "@/stores/useDisplaySettingsStore";

/**
 * Hook exposing wallpaper state & helpers.
 * Under the hood, all state is managed by the global `useDisplaySettingsStore`.
 */
export function useWallpaper() {
  // State selectors from display settings store
  const currentWallpaper = useDisplaySettingsStore((s) => s.currentWallpaper);
  const wallpaperSource = useDisplaySettingsStore((s) => s.wallpaperSource);

  // Actions
  const setWallpaper = useDisplaySettingsStore((s) => s.setWallpaper);
  const loadCustomWallpapers = useDisplaySettingsStore((s) => s.loadCustomWallpapers);
  const getWallpaperData = useDisplaySettingsStore((s) => s.getWallpaperData);

  // Derived helper – detects whether the active wallpaper is a video
  const isVideoWallpaper = useMemo(() => {
    const path = wallpaperSource;
    return (
      path.endsWith(".mp4") ||
      path.includes("video/") ||
      (path.startsWith("https://") && /\.(mp4|webm|ogg)(\?|$)/.test(path))
    );
  }, [wallpaperSource]);

  // Ensure wallpaperSource is correctly resolved on first mount for custom wallpapers.
  // We attempt a single refresh per session if the persisted `wallpaperSource` might be stale
  // (e.g. an old `blob:` URL that no longer exists after a full page reload).
  const hasAttemptedRefresh = useRef(false);

  useEffect(() => {
    if (hasAttemptedRefresh.current) return;

    const isCustom = currentWallpaper.startsWith(INDEXEDDB_PREFIX);
    const sourceLooksStale =
      wallpaperSource === currentWallpaper || // Not resolved yet
      wallpaperSource.startsWith("blob:"); // Could be an invalid Object URL after reload

    if (isCustom && sourceLooksStale) {
      hasAttemptedRefresh.current = true; // Avoid infinite loops
      void setWallpaper(currentWallpaper);
    }
  }, [currentWallpaper, wallpaperSource, setWallpaper]);

  return {
    currentWallpaper,
    wallpaperSource,
    setWallpaper,
    isVideoWallpaper,
    loadCustomWallpapers,
    getWallpaperData,
    INDEXEDDB_PREFIX,
  } as const;
}
