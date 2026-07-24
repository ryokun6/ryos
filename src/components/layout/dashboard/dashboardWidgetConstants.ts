import type { WidgetType } from "@/stores/useDashboardStore";

export const DASHBOARD_WIDGET_FONT =
  "'Helvetica Neue', Helvetica, Arial, sans-serif";

/**
 * Tiger Dashboard Widget Bar icons extracted from Mac OS X 10.4
 * (`AdditionalEssentials.pkg` → `/Library/Widgets/*.wdgt/Icon.png`).
 *
 * Aquarium and Terrarium are ryOS-only widgets with no Tiger stock
 * counterpart, so they keep emoji icons.
 */
export const WIDGET_ICONS: Record<WidgetType, string> = {
  clock: "/icons/dashboard-widgets/world-clock.png",
  calendar: "/icons/dashboard-widgets/calendar.png",
  weather: "/icons/dashboard-widgets/weather.png",
  stocks: "/icons/dashboard-widgets/stocks.png",
  ipod: "/icons/dashboard-widgets/itunes.png",
  translation: "/icons/dashboard-widgets/translation.png",
  currency: "/icons/dashboard-widgets/unit-converter.png",
  stickynote: "/icons/dashboard-widgets/stickies.png",
  dictionary: "/icons/dashboard-widgets/dictionary.png",
  aquarium: "🐠",
  terrarium: "🌿",
};

export function isWidgetImageIcon(icon: string): boolean {
  return icon.startsWith("/") || icon.startsWith("http");
}

/** Pixel size for Tiger Widget Bar icons in the Dashboard add-widget tray. */
export const WIDGET_TRAY_ICON_SIZE = 64;

/** Minimum column width for each tray item (icon + label). */
export const WIDGET_TRAY_ITEM_MIN_WIDTH = 96;
