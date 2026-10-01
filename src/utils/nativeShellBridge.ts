import type { RyosDesktopApi, RyosHapticPattern } from "@/types/ryos-desktop";

/**
 * Null-safe wrapper for the optional native-shell haptic method on
 * `window.ryosDesktop` (iOS shell build 6+). No-ops when the bridge or the
 * method is missing (browser, Electron, older iOS builds).
 */

/** Faster haptics feel buzzy rather than tactile. */
export const HAPTIC_MIN_INTERVAL_MS = 100;

let lastHapticAt = Number.NEGATIVE_INFINITY;

function getBridge(): RyosDesktopApi | undefined {
  return typeof window !== "undefined" ? window.ryosDesktop : undefined;
}

export function hasNativeHaptics(): boolean {
  return typeof getBridge()?.playHaptic === "function";
}

/** Play a native haptic, dropping calls within `HAPTIC_MIN_INTERVAL_MS` of the last one. */
export function playHaptic(
  pattern: RyosHapticPattern,
  now: number = Date.now()
): boolean {
  const bridge = getBridge();
  const fn = bridge?.playHaptic;
  if (typeof fn !== "function") return false;
  if (now - lastHapticAt < HAPTIC_MIN_INTERVAL_MS) return false;
  lastHapticAt = now;
  try {
    const result: unknown = fn.call(bridge, pattern);
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export function resetNativeHapticRateLimitForTests(): void {
  lastHapticAt = Number.NEGATIVE_INFINITY;
}
