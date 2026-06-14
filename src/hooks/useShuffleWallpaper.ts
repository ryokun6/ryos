import { useEffect, useRef } from "react";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { loadWallpaperManifest } from "@/utils/wallpapers";
import {
  SHUFFLE_INTERVAL_MS,
  getShuffleCandidatePaths,
  isShuffleWallpaper,
  parseShuffleDescriptor,
  pickRandomCandidate,
} from "@/utils/dynamicWallpaper";

/**
 * Drives shuffle wallpapers: when `currentWallpaper` is a `shuffle://…`
 * descriptor, resolve a random asset from that category and rotate to a new
 * random one every {@link SHUFFLE_INTERVAL_MS}. The concrete asset is written
 * to the store's runtime `wallpaperSource` so the desktop, menubar tint, and
 * accent sampling all see a real image while the persisted selection stays the
 * shuffle descriptor.
 */
export function useShuffleWallpaper() {
  const currentWallpaper = useDisplaySettingsStore((s) => s.currentWallpaper);
  const wallpaperSource = useDisplaySettingsStore((s) => s.wallpaperSource);
  const setRuntimeWallpaperSource = useDisplaySettingsStore(
    (s) => s.setRuntimeWallpaperSource
  );

  // Keep the latest resolved source in a ref so the rotation can avoid
  // immediately repeating the current pick without re-subscribing.
  const currentSourceRef = useRef(wallpaperSource);
  currentSourceRef.current = wallpaperSource;

  useEffect(() => {
    if (!isShuffleWallpaper(currentWallpaper)) return;
    const target = parseShuffleDescriptor(currentWallpaper);
    if (!target) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const rotate = (candidates: string[]) => {
      const next = pickRandomCandidate(candidates, currentSourceRef.current);
      if (next) setRuntimeWallpaperSource(next);
    };

    loadWallpaperManifest()
      .then((manifest) => {
        if (cancelled) return;
        const candidates = getShuffleCandidatePaths(manifest, target);
        if (candidates.length === 0) return;

        // Resolve immediately if the runtime source isn't already one of the
        // category's assets (e.g. fresh selection or stale descriptor).
        if (!candidates.includes(currentSourceRef.current)) {
          rotate(candidates);
        }

        intervalId = setInterval(() => rotate(candidates), SHUFFLE_INTERVAL_MS);
      })
      .catch((err) =>
        console.error("Failed to load manifest for shuffle wallpaper", err)
      );

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
    // Re-run when the descriptor changes (category switch / disable).
  }, [currentWallpaper, setRuntimeWallpaperSource]);
}
