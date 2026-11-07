import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  JournalSidebarCalendar,
  journalMonthGrid,
} from "../../../src/apps/journal/components/JournalSidebarCalendar";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});
if (typeof document === "undefined" || !GlobalRegistrator.isRegistered) {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register();
  }
}

describe("journal sidebar calendar", () => {
  test("uses the same six-week month grid as the calendar", () => {
    const grid = journalMonthGrid(2026, 10, "2026-11-07", "2026-11-01");
    expect(grid).toHaveLength(6);
    expect(grid[0]?.[0]).toMatchObject({
      date: "2026-11-01",
      day: 1,
      isCurrentMonth: true,
      isSelected: true,
      isToday: false,
    });
    expect(grid[0]?.[6]).toMatchObject({
      date: "2026-11-07",
      isToday: true,
      isCurrentMonth: true,
    });
    expect(grid[5]?.[0]).toMatchObject({
      date: "2026-12-06",
      isCurrentMonth: false,
    });
  });

  test("a day click selects that journal day and the month controls move the grid", async () => {
    const selected: string[] = [];
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        <JournalSidebarCalendar
          selectedDate="2026-11-01"
          today="2026-11-07"
          language="en"
          isWindowsTheme={false}
          isMacOSTheme
          isSystem7Theme={false}
          onSelectDay={(dayId) => selected.push(dayId)}
        />
      );
    });

    expect(container.textContent).toContain("November");
    const buttons = [...container.querySelectorAll("button")];
    const novemberFirst = buttons[2];
    await act(async () => {
      novemberFirst?.click();
    });
    expect(selected).toEqual(["2026-11-01"]);

    await act(async () => {
      buttons[0]?.click();
    });
    expect(container.textContent).toContain("October");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
