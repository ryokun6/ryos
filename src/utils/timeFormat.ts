import { formatSeconds } from "./formatDuration";

/** Unpadded minutes playback label (e.g. `1:05`, `60:00`). */
export function formatSecondsAsMinutesSeconds(totalSeconds: number): string {
  return formatSeconds(totalSeconds);
}
