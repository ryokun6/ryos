import { describe, expect, test } from "bun:test";
import {
  CALENDAR_PERIOD_SWIPE_MIN_DISTANCE,
  resolveCalendarPeriodSwipe,
  shouldIgnoreCalendarPeriodSwipeTarget,
} from "../../../src/apps/calendar/utils/calendarPeriodSwipe";

describe("resolveCalendarPeriodSwipe", () => {
  test("swipe left past threshold navigates next", () => {
    expect(
      resolveCalendarPeriodSwipe({
        deltaX: -CALENDAR_PERIOD_SWIPE_MIN_DISTANCE,
        deltaY: 0,
      })
    ).toBe("next");
  });

  test("swipe right past threshold navigates prev", () => {
    expect(
      resolveCalendarPeriodSwipe({
        deltaX: CALENDAR_PERIOD_SWIPE_MIN_DISTANCE,
        deltaY: 0,
      })
    ).toBe("prev");
  });

  test("ignores short horizontal travel", () => {
    expect(
      resolveCalendarPeriodSwipe({
        deltaX: -(CALENDAR_PERIOD_SWIPE_MIN_DISTANCE - 1),
        deltaY: 0,
      })
    ).toBeNull();
  });

  test("ignores vertically dominant drags", () => {
    expect(
      resolveCalendarPeriodSwipe({
        deltaX: -80,
        deltaY: 100,
      })
    ).toBeNull();
  });

  test("week scroller mid-pan blocks period navigation", () => {
    expect(
      resolveCalendarPeriodSwipe({
        deltaX: -80,
        deltaY: 0,
        scrollLeft: 40,
        maxScrollLeft: 120,
      })
    ).toBeNull();
    expect(
      resolveCalendarPeriodSwipe({
        deltaX: 80,
        deltaY: 0,
        scrollLeft: 40,
        maxScrollLeft: 120,
      })
    ).toBeNull();
  });

  test("week scroller at trailing edge allows next", () => {
    expect(
      resolveCalendarPeriodSwipe({
        deltaX: -80,
        deltaY: 0,
        scrollLeft: 120,
        maxScrollLeft: 120,
      })
    ).toBe("next");
  });

  test("week scroller at leading edge allows prev", () => {
    expect(
      resolveCalendarPeriodSwipe({
        deltaX: 80,
        deltaY: 0,
        scrollLeft: 0,
        maxScrollLeft: 120,
      })
    ).toBe("prev");
  });

  test("no overflow acts like unconstrained swipe", () => {
    expect(
      resolveCalendarPeriodSwipe({
        deltaX: -80,
        deltaY: 0,
        scrollLeft: 0,
        maxScrollLeft: 0,
      })
    ).toBe("next");
  });
});

describe("shouldIgnoreCalendarPeriodSwipeTarget", () => {
  test("returns false for null / non-elements", () => {
    expect(shouldIgnoreCalendarPeriodSwipeTarget(null)).toBe(false);
    expect(shouldIgnoreCalendarPeriodSwipeTarget({} as EventTarget)).toBe(false);
  });
});
