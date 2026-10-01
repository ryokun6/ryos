import type {
  RyosDesktopApi,
  RyosHapticPattern,
  RyosNowPlayingInfo,
} from "@/types/ryos-desktop";

/**
 * Null-safe wrappers for the optional native-shell media/haptic methods on
 * `window.ryosDesktop` (iOS shell build 6+). Every helper no-ops when the
 * bridge or the method is missing (browser, Electron, older iOS builds).
 */

/** Faster haptics feel buzzy rather than tactile. */
export const HAPTIC_MIN_INTERVAL_MS = 100;

type OptionalBridgeMethod =
  | "playHaptic"
  | "setAudioActive"
  | "setNowPlaying"
  | "updatePlayback";

let lastHapticAt = Number.NEGATIVE_INFINITY;

function getBridge(): RyosDesktopApi | undefined {
  return typeof window !== "undefined" ? window.ryosDesktop : undefined;
}

function callBridge<K extends OptionalBridgeMethod>(
  method: K,
  ...args: Parameters<NonNullable<RyosDesktopApi[K]>>
): boolean {
  const bridge = getBridge();
  const fn = bridge?.[method] as
    | ((...fnArgs: typeof args) => unknown)
    | undefined;
  if (typeof fn !== "function") return false;
  try {
    const result = fn.apply(bridge, args);
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export function hasNativeHaptics(): boolean {
  return typeof getBridge()?.playHaptic === "function";
}

/** Play a native haptic, dropping calls within `HAPTIC_MIN_INTERVAL_MS` of the last one. */
export function playHaptic(
  pattern: RyosHapticPattern,
  now: number = Date.now()
): boolean {
  if (!hasNativeHaptics()) return false;
  if (now - lastHapticAt < HAPTIC_MIN_INTERVAL_MS) return false;
  lastHapticAt = now;
  return callBridge("playHaptic", pattern);
}

export function setNativeAudioActive(active: boolean): boolean {
  return callBridge("setAudioActive", active);
}

function cleanText(value: string | null | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : undefined;
}

/**
 * Normalize now-playing metadata for the shell: drops empty strings,
 * non-positive / non-finite durations, and non-https artwork. Returns null
 * when there is no usable title.
 */
export function sanitizeNowPlayingInfo(
  info: RyosNowPlayingInfo | null | undefined
): RyosNowPlayingInfo | null {
  const title = cleanText(info?.title);
  if (!info || !title) return null;
  const result: RyosNowPlayingInfo = { title };
  const artist = cleanText(info.artist);
  if (artist) result.artist = artist;
  const album = cleanText(info.album);
  if (album) result.album = album;
  if (
    typeof info.durationSeconds === "number" &&
    Number.isFinite(info.durationSeconds) &&
    info.durationSeconds > 0
  ) {
    result.durationSeconds = info.durationSeconds;
  }
  const artworkUrl = cleanText(info.artworkUrl);
  if (artworkUrl?.startsWith("https://")) result.artworkUrl = artworkUrl;
  return result;
}

export function setNativeNowPlaying(info: RyosNowPlayingInfo | null): boolean {
  return callBridge("setNowPlaying", sanitizeNowPlayingInfo(info));
}

export function updateNativePlayback(
  positionSeconds: number,
  rate: number
): boolean {
  const position =
    Number.isFinite(positionSeconds) && positionSeconds > 0 ? positionSeconds : 0;
  return callBridge("updatePlayback", position, rate > 0 ? 1 : 0);
}

export function resetNativeHapticRateLimitForTests(): void {
  lastHapticAt = Number.NEGATIVE_INFINITY;
}
