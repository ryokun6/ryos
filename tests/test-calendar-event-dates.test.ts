import { describe, expect, test } from "bun:test";
import {
  addDaysToDateString,
  calendarEventOccursOnDate,
  calendarEventOverlapsDateRange,
  normalizeAllDayEndDate,
} from "../src/shared/calendarEventDates";

describe("calendar event date ranges", () => {
  test("matches inclusive all-day ranges", () => {
    const event = { date: "2026-06-07", endDate: "2026-06-09" };

    expect(calendarEventOccursOnDate(event, "2026-06-06")).toBe(false);
    expect(calendarEventOccursOnDate(event, "2026-06-07")).toBe(true);
    expect(calendarEventOccursOnDate(event, "2026-06-08")).toBe(true);
    expect(calendarEventOccursOnDate(event, "2026-06-09")).toBe(true);
    expect(calendarEventOccursOnDate(event, "2026-06-10")).toBe(false);
  });

  test("keeps timed events on their start date only", () => {
    const event = {
      date: "2026-06-07",
      endDate: "2026-06-09",
      startTime: "09:00",
    };

    expect(calendarEventOccursOnDate(event, "2026-06-07")).toBe(true);
    expect(calendarEventOccursOnDate(event, "2026-06-08")).toBe(false);
  });

  test("normalizes single-day ranges and checks month overlap", () => {
    expect(normalizeAllDayEndDate("2026-06-07", "2026-06-07")).toBeUndefined();
    expect(addDaysToDateString("2026-06-30", 1)).toBe("2026-07-01");
    expect(
      calendarEventOverlapsDateRange(
        { date: "2026-06-29", endDate: "2026-07-02" },
        "2026-07-01",
        "2026-07-31"
      )
    ).toBe(true);
  });
});
