import { formatSecondsAsMinutesSeconds } from "@/utils/timeFormat";

export function formatPlaybackTime(totalSeconds: number): string {
  return formatSecondsAsMinutesSeconds(totalSeconds);
}
