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
 *
 * Rotation is wall-clock based rather than relying solely on `setInterval`:
 * browsers throttle (and during device sleep fully suspend) background-tab
 * timers, so a plain interval would silently stall while the tab is hidden.
 * We additionally rotate when the tab becomes visible/focused again if more
 * than {@link SHUFFLE_INTERVAL_MS} has elapsed since the last swap — so coming
 * back after being away always lands on a fresh wallpaper.
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
    let candidates: string[] = [];
    // Wall-clock timestamp of the last swap, used to catch up after the tab
    // (or the whole machine) was suspended and timers stopped firing.
    let lastRotateAt = Date.now();

    const rotate = () => {
      if (candidates.length === 0) return;
      const next = pickRandomCandidate(candidates, currentSourceRef.current);
      if (next) setRuntimeWallpaperSource(next);
      lastRotateAt = Date.now();
    };

    // On regaining visibility/focus, rotate if we're overdue. Guards against
    // background timers being throttled or suspended while the tab was hidden.
    const rotateIfOverdue = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRotateAt >= SHUFFLE_INTERVAL_MS) rotate();
    };

    loadWallpaperManifest()
      .then((manifest) => {
        if (cancelled) return;
        candidates = getShuffleCandidatePaths(manifest, target);
        if (candidates.length === 0) return;

        // Resolve immediately if the runtime source isn't already one of the
        // category's assets (e.g. fresh selection or stale descriptor).
        if (!candidates.includes(currentSourceRef.current)) {
          rotate();
        } else {
          // Already showing a category asset (e.g. restored from persistence):
          // treat it as freshly shown so the next swap is a full interval away.
          lastRotateAt = Date.now();
        }

        intervalId = setInterval(rotate, SHUFFLE_INTERVAL_MS);
      })
      .catch((err) =>
        console.error("Failed to load manifest for shuffle wallpaper", err)
      );

    document.addEventListener("visibilitychange", rotateIfOverdue);
    window.addEventListener("focus", rotateIfOverdue);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", rotateIfOverdue);
      window.removeEventListener("focus", rotateIfOverdue);
    };
    // Re-run when the descriptor changes (category switch / disable).
  }, [currentWallpaper, setRuntimeWallpaperSource]);
}
