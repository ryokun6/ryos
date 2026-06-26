import { describe, expect, test } from "bun:test";
import {
  parseIcalString,
  toIcalString,
} from "../src/apps/calendar/utils/parseIcal";
import type { CalendarEvent } from "../src/stores/useCalendarStore";

describe("calendar iCal multi-day all-day events", () => {
  test("imports exclusive DTEND as inclusive endDate", () => {
    const events = parseIcalString(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260607",
        "DTEND;VALUE=DATE:20260610",
        "SUMMARY:Conference",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n")
    );

    expect(events).toEqual([
      {
        title: "Conference",
        date: "2026-06-07",
        endDate: "2026-06-09",
        color: "blue",
      },
    ]);
  });

  test("exports inclusive endDate as exclusive DTEND", () => {
    const ics = toIcalString([
      {
        id: "event-1",
        title: "Conference",
        date: "2026-06-07",
        endDate: "2026-06-09",
        color: "blue",
        createdAt: 1,
        updatedAt: 2,
      } as CalendarEvent,
    ]);

    expect(ics).toContain("DTSTART;VALUE=DATE:20260607");
    expect(ics).toContain("DTEND;VALUE=DATE:20260610");
  });
});
