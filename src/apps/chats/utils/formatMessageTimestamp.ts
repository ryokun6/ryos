import {
  formatInTimeZone,
  formatZonedDateString,
} from "@/lib/timezoneConfig";

/** Whether `date` falls on a calendar day before `now` in `timeZone`. */
export function isZonedDayBeforeToday(
  date: Date,
  timeZone: string,
  now: Date = new Date()
): boolean {
  return (
    formatZonedDateString(date, timeZone) !==
    formatZonedDateString(now, timeZone)
  );
}

/**
 * Compact chat message timestamp: time-of-day for messages from today in the
 * user's timezone, otherwise a short month/day label. Matches the previous
 * `toLocaleTimeString` / `toLocaleDateString` display style while honoring
 * {@link timeZone}.
 */
export function formatChatMessageTimestamp(
  date: Date,
  timeZone: string,
  locale?: string,
  now: Date = new Date()
): string {
  if (isZonedDayBeforeToday(date, timeZone, now)) {
    return formatInTimeZone(date, timeZone, locale, {
      month: "short",
      day: "numeric",
    });
  }

  return formatInTimeZone(date, timeZone, locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}
