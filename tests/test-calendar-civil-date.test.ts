import { describe, expect, test } from "bun:test";
import {
  addCivilDays,
  civilWeekday,
  daysInCivilMonth,
  formatCivilDate,
  millisecondsUntilNextZonedDay,
  parseCivilDate,
  startOfCivilWeek,
} from "../src/shared/calendarCivilDate";
import { useCalendarStore } from "../src/stores/useCalendarStore";

describe("calendar civil-date arithmetic", () => {
  test("computes weekdays without using the host timezone", () => {
    expect(civilWeekday({ year: 2025, month: 6, day: 1 })).toBe(0);
    expect(civilWeekday({ year: 2025, month: 6, day: 30 })).toBe(1);
  });

  test("moves across DST boundaries as calendar days", () => {
    const beforeSpringForward = parseCivilDate("2025-03-08");
    expect(beforeSpringForward).not.toBeNull();
    expect(formatCivilDate(addCivilDays(beforeSpringForward!, 1))).toBe(
      "2025-03-09"
    );
    expect(formatCivilDate(addCivilDays(beforeSpringForward!, 7))).toBe(
      "2025-03-15"
    );

    const beforeFallBack = parseCivilDate("2025-11-01");
    expect(beforeFallBack).not.toBeNull();
    expect(formatCivilDate(addCivilDays(beforeFallBack!, 1))).toBe(
      "2025-11-02"
    );
  });

  test("finds a Sunday week start across month and year boundaries", () => {
    expect(
      formatCivilDate(startOfCivilWeek({ year: 2026, month: 1, day: 1 }))
    ).toBe("2025-12-28");
  });

  test("validates dates and handles leap years", () => {
    expect(daysInCivilMonth(2024, 2)).toBe(29);
    expect(daysInCivilMonth(2025, 2)).toBe(28);
    expect(parseCivilDate("2025-02-29")).toBeNull();
    expect(parseCivilDate("2024-02-29")).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
  });
});

describe("calendar midnight refresh", () => {
  test("uses midnight in the effective timezone", () => {
    const newYorkNow = new Date("2025-03-09T04:59:00.000Z");
    expect(
      millisecondsUntilNextZonedDay(newYorkNow, "America/New_York")
    ).toBe(60_000);

    const tokyoNow = new Date("2025-06-01T14:59:30.000Z");
    expect(millisecondsUntilNextZonedDay(tokyoNow, "Asia/Tokyo")).toBe(30_000);
  });
});

describe("calendar store civil-date navigation", () => {
  test("navigates weeks across DST changes without instant arithmetic", () => {
    useCalendarStore.setState({
      selectedDate: "2025-03-08",
      currentYear: 2025,
      currentMonth: 2,
    });

    useCalendarStore.getState().navigateWeek(1);

    expect(useCalendarStore.getState().selectedDate).toBe("2025-03-15");
    expect(useCalendarStore.getState().currentYear).toBe(2025);
    expect(useCalendarStore.getState().currentMonth).toBe(2);
  });
});
