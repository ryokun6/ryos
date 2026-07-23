import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  WIDGET_ICONS,
  WIDGET_TRAY_ICON_SIZE,
  WIDGET_TRAY_ITEM_MIN_WIDTH,
  isWidgetImageIcon,
} from "@/components/layout/dashboard/dashboardWidgetConstants";
import type { WidgetType } from "@/stores/useDashboardStore";

const IMAGE_MAPPED_WIDGETS: WidgetType[] = [
  "clock",
  "calendar",
  "weather",
  "stocks",
  "ipod",
  "translation",
  "currency",
  "stickynote",
  "dictionary",
];

const EMOJI_FALLBACK_WIDGETS: WidgetType[] = ["aquarium", "terrarium"];

describe("dashboard widget icons", () => {
  test("maps stock Tiger widgets to dashboard-widgets PNG paths", () => {
    for (const type of IMAGE_MAPPED_WIDGETS) {
      const icon = WIDGET_ICONS[type];
      expect(isWidgetImageIcon(icon)).toBe(true);
      expect(icon.startsWith("/icons/dashboard-widgets/")).toBe(true);
      expect(icon.endsWith(".png")).toBe(true);
    }
  });

  test("keeps emoji fallbacks for ryOS-only aquarium and terrarium widgets", () => {
    for (const type of EMOJI_FALLBACK_WIDGETS) {
      expect(isWidgetImageIcon(WIDGET_ICONS[type])).toBe(false);
    }
  });

  test("ships the mapped PNG files under public/icons/dashboard-widgets", () => {
    for (const type of IMAGE_MAPPED_WIDGETS) {
      const icon = WIDGET_ICONS[type];
      const diskPath = resolve(process.cwd(), "public" + icon);
      expect(existsSync(diskPath)).toBe(true);
    }
  });

  test("sizes the Dashboard widget tray for larger Tiger icons", () => {
    expect(WIDGET_TRAY_ICON_SIZE).toBeGreaterThanOrEqual(64);
    expect(WIDGET_TRAY_ITEM_MIN_WIDTH).toBeGreaterThanOrEqual(
      WIDGET_TRAY_ICON_SIZE
    );
  });

  test("catalogs the full Tiger Widget Bar set including unused stock icons", () => {
    const catalogIcons = [
      "address-book",
      "calculator",
      "calendar",
      "dictionary",
      "flight-tracker",
      "itunes",
      "phone-book",
      "stickies",
      "stocks",
      "tile-game",
      "translation",
      "unit-converter",
      "weather",
      "world-clock",
    ];
    for (const slug of catalogIcons) {
      expect(
        existsSync(
          resolve(
            process.cwd(),
            `public/resources/macos-icon-catalogs/tiger/dashboard-widgets/${slug}.png`
          )
        )
      ).toBe(true);
      expect(
        existsSync(
          resolve(process.cwd(), `public/icons/dashboard-widgets/${slug}.png`)
        )
      ).toBe(true);
    }
  });
});
