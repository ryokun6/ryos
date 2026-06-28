import { formatZonedDateString } from "@/lib/timezoneConfig";

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCivilDate(value: string): CivilDate | null {
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInCivilMonth(year, month)
  ) {
    return null;
  }
  return { year, month, day };
}

export function formatCivilDate(date: CivilDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function daysInCivilMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function civilWeekday(date: CivilDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

export function addCivilDays(date: CivilDate, days: number): CivilDate {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days)
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function startOfCivilWeek(date: CivilDate): CivilDate {
  return addCivilDays(date, -civilWeekday(date));
}

export function millisecondsUntilNextZonedDay(
  now: Date,
  timeZone: string
): number {
  const currentDay = formatZonedDateString(now, timeZone);
  const start = now.getTime();
  let low = start;
  let high = start + 60 * 60 * 1000;
  const searchLimit = start + 30 * 60 * 60 * 1000;

  while (
    high < searchLimit &&
    formatZonedDateString(new Date(high), timeZone) === currentDay
  ) {
    low = high;
    high += 60 * 60 * 1000;
  }

  if (formatZonedDateString(new Date(high), timeZone) === currentDay) {
    return 24 * 60 * 60 * 1000;
  }

  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (formatZonedDateString(new Date(middle), timeZone) === currentDay) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return Math.max(1, high - start);
}
