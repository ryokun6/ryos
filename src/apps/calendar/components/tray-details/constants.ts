import {
  PRESET_EVENT_COLOR_HEX,
  resolveCalendarColorVisuals,
  type CalendarColorVisuals,
  type EventColor,
} from "@/shared/calendarColors";

export const EVENT_COLOR_MAP: Record<string, string> = {
  blue: PRESET_EVENT_COLOR_HEX.blue,
  red: PRESET_EVENT_COLOR_HEX.red,
  green: PRESET_EVENT_COLOR_HEX.green,
  orange: PRESET_EVENT_COLOR_HEX.orange,
  purple: PRESET_EVENT_COLOR_HEX.purple,
};

export function getCalendarColorVisuals(
  color: EventColor | string | null | undefined,
  isDarkMode: boolean = false
): CalendarColorVisuals {
  return resolveCalendarColorVisuals(color, { isDarkMode });
}
