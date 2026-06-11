/**
 * Shared guard for high-frequency playback clock writes (iPod, Karaoke).
 *
 * Media players report progress many times per second; persisting every tick
 * to a Zustand store re-renders every subscriber at that rate. Skipping
 * updates smaller than this epsilon caps the store update frequency while
 * keeping lyric/progress display accuracy well below perceptible thresholds.
 */
export const PLAYBACK_TIME_UPDATE_EPSILON_SECONDS = 0.05;

export function shouldUpdatePlaybackTime(
  previous: number,
  next: number
): boolean {
  return Math.abs(previous - next) >= PLAYBACK_TIME_UPDATE_EPSILON_SECONDS;
}
