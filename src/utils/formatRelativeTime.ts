export type TranslateFn = (
  key: string,
  opts?: Record<string, unknown>
) => string;

/** i18n keys used for each relative-time bucket. */
export type RelativeTimeKeys = {
  justNow: string;
  minutesAgo: string;
  hoursAgo: string;
  daysAgo: string;
};

/**
 * Format a timestamp (epoch ms or date string) relative to now using the
 * provided translate callback and key set (consumers live in different i18n
 * namespaces). Returns `null` for a missing timestamp.
 */
export function formatRelativeTime(
  timestamp: number | string,
  t: TranslateFn,
  keys: RelativeTimeKeys
): string;
export function formatRelativeTime(
  timestamp: number | string | null | undefined,
  t: TranslateFn,
  keys: RelativeTimeKeys
): string | null;
export function formatRelativeTime(
  timestamp: number | string | null | undefined,
  t: TranslateFn,
  keys: RelativeTimeKeys
): string | null {
  if (timestamp === null || timestamp === undefined || timestamp === "") {
    return null;
  }
  const timestampMs =
    typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
  const diff = Date.now() - timestampMs;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t(keys.justNow);
  if (minutes < 60) return t(keys.minutesAgo, { count: minutes });
  if (hours < 24) return t(keys.hoursAgo, { count: hours });
  return t(keys.daysAgo, { count: days });
}
