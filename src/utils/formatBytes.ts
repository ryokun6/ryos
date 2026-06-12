/**
 * Format a byte count as a human-readable string.
 *
 * - `"short"` (default): MB-centric with graduated rounding, suited for
 *   download-progress style displays (`0 MB`, `12.3 MB`, `123 MB`, `1.20 GB`).
 * - `"precise"`: picks the closest unit from B/KB/MB/GB with up to two
 *   decimals, trailing zeros stripped (`512 B`, `1.5 KB`, `2.25 MB`).
 */
export function formatBytes(
  bytes: number,
  style: "short" | "precise" = "short"
): string {
  if (style === "precise") {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  if (!bytes || bytes < 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 100) return `${Math.round(mb)} MB`;
  if (mb >= 10) return `${mb.toFixed(1)} MB`;
  return `${mb.toFixed(2)} MB`;
}
