export const IPOD_WHEEL_SOUND_MIN_INTERVAL_MS = 30;

/**
 * A single touch-move can cross several wheel steps at once. Rate-limit the
 * 70 ms click sample so those steps do not create enough overlapping audio
 * sources to exhaust the mobile UI-sound pool.
 */
export function shouldPlayIpodWheelSound(
  lastPlayedAt: number | null,
  now: number,
  minimumIntervalMs: number = IPOD_WHEEL_SOUND_MIN_INTERVAL_MS
): boolean {
  return lastPlayedAt === null || now - lastPlayedAt >= minimumIntervalMs;
}
