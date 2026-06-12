/**
 * Format a `YYYY-MM-DD` date string as a localized label. The date is
 * constructed in local time (not UTC) so the label matches the calendar day.
 * Returns the raw string for unparseable input and `""` for empty input.
 */
export function formatDateLabel(
  dateStr: string,
  locale?: string,
  formatOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  }
): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(locale, formatOptions);
}
