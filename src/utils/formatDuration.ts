export interface FormatSecondsOptions {
  /** When true, zero-pad the minutes segment (`01:05`). Default false (`1:05`). */
  padMinutes?: boolean;
}

/**
 * Format a duration in seconds as `m:ss` or `MM:SS`.
 * Fractional seconds are floored; negative values clamp to zero.
 */
export function formatSeconds(
  totalSeconds: number,
  options: FormatSecondsOptions = {}
): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const minuteText = options.padMinutes
    ? String(minutes).padStart(2, "0")
    : String(minutes);
  return `${minuteText}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Format a duration in seconds as zero-padded `MM:SS` (e.g. `04:05`).
 * Fractional seconds are floored; negative values clamp to `00:00`.
 */
export function formatSecondsMmSs(totalSeconds: number): string {
  return formatSeconds(totalSeconds, { padMinutes: true });
}

/**
 * Format a duration in milliseconds as `m:ss` (unpadded minutes, e.g. `4:05`).
 * Negative values clamp to `0:00`.
 */
export function formatMsMmSs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
