export interface CalendarDateRangeLike {
  date: string;
  endDate?: string;
  startTime?: string;
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function normalizeAllDayEndDate(
  startDate: string,
  endDate: string | undefined
): string | undefined {
  if (!endDate || endDate <= startDate) return undefined;
  return endDate;
}

export function getCalendarEventEndDate(event: CalendarDateRangeLike): string {
  if (event.startTime) return event.date;
  return normalizeAllDayEndDate(event.date, event.endDate) || event.date;
}

export function calendarEventOccursOnDate(
  event: CalendarDateRangeLike,
  date: string
): boolean {
  if (event.startTime) return event.date === date;
  return event.date <= date && date <= getCalendarEventEndDate(event);
}

export function calendarEventOverlapsDateRange(
  event: CalendarDateRangeLike,
  startDate: string,
  endDate: string
): boolean {
  const eventEndDate = getCalendarEventEndDate(event);
  return event.date <= endDate && eventEndDate >= startDate;
}
