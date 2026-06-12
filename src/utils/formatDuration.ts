/**
 * Format a duration in seconds as zero-padded `MM:SS` (e.g. `04:05`).
 * Fractional seconds are floored; negative values clamp to `00:00`.
 */
export function formatSecondsMmSs(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
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
