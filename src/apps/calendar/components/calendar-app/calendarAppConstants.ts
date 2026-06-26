import type { CalendarEvent } from "@/stores/useCalendarStore";

export const EVENT_COLOR_MAP: Record<string, string> = {
  blue: "#4A90D9",
  red: "#D94A4A",
  green: "#5AB55A",
  orange: "#E89B3E",
  purple: "#9B59B6",
};

export const EVENT_COLOR_LIGHT: Record<string, string> = {
  blue: "rgba(74, 144, 217, 0.15)",
  red: "rgba(217, 74, 74, 0.15)",
  green: "rgba(90, 181, 90, 0.15)",
  orange: "rgba(232, 155, 62, 0.15)",
  purple: "rgba(155, 89, 182, 0.15)",
};

export const HOUR_START = 0;
export const HOUR_END = 24;
export const TODAY_RED = "#E25B4F";
export const TODAY_RED_XP = "#B53325";
export const SEARCH_DIM_OPACITY = 0.28;
export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function matchesSearchQuery(value: string | undefined, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  return (value || "").toLocaleLowerCase().includes(normalizedQuery);
}

export function getEventSearchText(event: CalendarEvent) {
  return [event.title, event.notes, event.date, event.endDate, event.startTime, event.endTime].filter(Boolean).join(" ");
}

export function getEventOpacity(event: CalendarEvent, normalizedQuery: string) {
  return matchesSearchQuery(getEventSearchText(event), normalizedQuery) ? 1 : SEARCH_DIM_OPACITY;
}
