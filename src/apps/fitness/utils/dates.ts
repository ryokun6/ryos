import type { Weekday } from "../types";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY_RE.test(value);
}

/** Local calendar date key `YYYY-MM-DD`. */
export function toDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a date key as local midnight. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** Monday-based weekday index (0 = Monday … 6 = Sunday). */
export function weekdayOf(key: string): Weekday {
  return ((fromDateKey(key).getDay() + 6) % 7) as Weekday;
}

/** Date key of the Monday that starts the week containing `key`. */
export function startOfWeek(key: string): string {
  return addDays(key, -weekdayOf(key));
}

export function weekDates(key: string): string[] {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromDateKey(b).getTime() - fromDateKey(a).getTime()) / 86_400_000);
}

export interface MonthGridDay {
  date: string;
  day: number;
}

/**
 * Monday-start month grid. Days outside the month are null so stacked months
 * do not repeat the neighboring month's dates.
 */
export function mondayMonthGrid(year: number, monthIndex: number): (MonthGridDay | null)[][] {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const pad = (first.getDay() + 6) % 7;
  const cells: (MonthGridDay | null)[] = Array.from({ length: pad }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: toDateKey(new Date(year, monthIndex, day)), day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (MonthGridDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
