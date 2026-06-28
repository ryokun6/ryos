import { useEffect, useRef } from "react";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { loadWallpaperManifest } from "@/utils/wallpapers";
import {
  SHUFFLE_INTERVAL_MS,
  getShuffleCandidatePaths,
  isShuffleWallpaper,
  parseShuffleDescriptor,
  pickDeterministicCandidate,
  shuffleBucket,
} from "@/utils/dynamicWallpaper";

/**
 * Drives shuffle wallpapers: when `currentWallpaper` is a `shuffle://…`
 * descriptor, resolve a concrete asset from that category and rotate to a new
 * one every {@link SHUFFLE_INTERVAL_MS}. The concrete asset is written to the
 * store's runtime `wallpaperSource` so the desktop, menubar tint, and accent
 * sampling all see a real image while the persisted selection stays the shuffle
 * descriptor.
 *
 * The pick is **deterministic** for a given (signed-in user, descriptor,
 * wall-clock bucket) — see {@link pickDeterministicCandidate}. This keeps every
 * device signed into the same account showing the same wallpaper at the same
 * time, and rotating in lockstep when the bucket advances. Anonymous (logged
 * out) sessions fall back to a shared `anon` seed so a single device still stays
 * consistent across reloads.
 *
 * Rotation is wall-clock based rather than relying solely on `setInterval`:
 * - swaps are aligned to bucket boundaries (a timeout to the next boundary, then
 *   an interval), so all of a user's devices flip at the same instant;
 * - we additionally re-resolve when the tab regains visibility/focus if the
 *   bucket has advanced, guarding against background-tab timer throttling and
 *   device sleep.
 */
export function useShuffleWallpaper() {
  const currentWallpaper = useDisplaySettingsStore((s) => s.currentWallpaper);
  const wallpaperSource = useDisplaySettingsStore((s) => s.wallpaperSource);
  const setRuntimeWallpaperSource = useDisplaySettingsStore(
    (s) => s.setRuntimeWallpaperSource
  );
  const username = useAuthStore((s) => s.username);

  // Keep the latest resolved source in a ref so resolution can skip redundant
  // updates without re-subscribing.
  const currentSourceRef = useRef(wallpaperSource);
  currentSourceRef.current = wallpaperSource;

  useEffect(() => {
    if (!isShuffleWallpaper(currentWallpaper)) return;
    const target = parseShuffleDescriptor(currentWallpaper);
    if (!target) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleCallbackId: number | null = null;
    let candidates: string[] = [];
    // Seed combines a stable per-user id and the descriptor so every device of
    // the same user resolves the same wallpaper for a given wall-clock bucket.
    const seed = `${username ?? "anon"}|${currentWallpaper}`;
    // Bucket of the last resolution, used to detect when we're overdue after the
    // tab (or the whole machine) was suspended and timers stopped firing.
    let lastBucket = shuffleBucket();

    const resolve = () => {
      if (candidates.length === 0) return;
      const next = pickDeterministicCandidate(candidates, seed);
      if (next && next !== currentSourceRef.current) {
        setRuntimeWallpaperSource(next);
      }
      lastBucket = shuffleBucket();
    };

    // Align rotation to wall-clock bucket boundaries: wait out the remainder of
    // the current bucket, swap, then swap once per interval thereafter. Every
    // device crosses the same boundary at the same time.
    const scheduleNextBoundary = () => {
      const msToNextBoundary =
        SHUFFLE_INTERVAL_MS - (Date.now() % SHUFFLE_INTERVAL_MS);
      timeoutId = setTimeout(() => {
        resolve();
        intervalId = setInterval(resolve, SHUFFLE_INTERVAL_MS);
      }, msToNextBoundary);
    };

    // On regaining visibility/focus, re-resolve if the bucket has advanced.
    // Guards against background timers being throttled or suspended while the
    // tab was hidden.
    const resolveIfOverdue = () => {
      if (document.visibilityState !== "visible") return;
      if (shuffleBucket() !== lastBucket) resolve();
    };

    const startManifestLoad = () => {
      loadWallpaperManifest()
        .then((manifest) => {
          if (cancelled) return;
          candidates = getShuffleCandidatePaths(manifest, target);
          if (candidates.length === 0) return;

          // Resolve the deterministic pick for the current bucket immediately. If
          // the restored source already matches, `resolve` is a no-op; otherwise
          // we snap to the wallpaper this user's other devices are showing.
          resolve();
          scheduleNextBoundary();
        })
        .catch((err) =>
          console.error("Failed to load manifest for shuffle wallpaper", err)
        );
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(startManifestLoad, {
        timeout: 1500,
      });
    } else {
      startManifestLoad();
    }

    document.addEventListener("visibilitychange", resolveIfOverdue);
    window.addEventListener("focus", resolveIfOverdue);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (idleCallbackId !== null) {
        window.cancelIdleCallback(idleCallbackId);
      }
      document.removeEventListener("visibilitychange", resolveIfOverdue);
      window.removeEventListener("focus", resolveIfOverdue);
    };
    // Re-run when the descriptor or signed-in user changes.
  }, [currentWallpaper, username, setRuntimeWallpaperSource]);
}
