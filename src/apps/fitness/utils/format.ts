import { fromDateKey } from "./dates";

/** "lower back" → "lowerBack", "e-z curl bar" → "ezCurlBar" (translation key segment). */
export function enumKey(value: string): string {
  const words = value
    .toLowerCase()
    .replace(/-/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.map((word, i) => (i === 0 ? word : word[0].toUpperCase() + word.slice(1))).join("");
}

export function formatShortDate(key: string, locale: string): string {
  return fromDateKey(key).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/** Monday–Sunday label. CJK ranges stay unspaced around the dash. */
export function formatWeekRange(start: string, end: string, locale: string): string {
  const startDate = fromDateKey(start);
  const endDate = fromDateKey(end);
  const day: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startText = startDate.toLocaleDateString(locale, day);
  const endText = endDate.toLocaleDateString(
    locale,
    startDate.getFullYear() === endDate.getFullYear() ? day : { ...day, year: "numeric" }
  );
  const cjk = /^(zh|ja|ko)/i.test(locale);
  return cjk ? `${startText}–${endText}` : `${startText} – ${endText}`;
}

/** Month/day only, numeric, so a narrow day cell stays on one line. */
export function formatCompactDate(key: string, locale: string): string {
  return fromDateKey(key).toLocaleDateString(locale, { month: "numeric", day: "numeric" });
}

export function formatLongDate(key: string, locale: string): string {
  return fromDateKey(key).toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatWeekdayShort(key: string, locale: string): string {
  return fromDateKey(key).toLocaleDateString(locale, { weekday: "short" });
}

export function formatNumber(value: number, locale: string, maxDecimals = 0): string {
  return value.toLocaleString(locale, { maximumFractionDigits: maxDecimals });
}
