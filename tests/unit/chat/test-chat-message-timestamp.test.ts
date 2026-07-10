import { describe, expect, test } from "bun:test";
import {
  formatChatMessageTimestamp,
  isZonedDayBeforeToday,
} from "../../../src/apps/chats/utils/formatMessageTimestamp";

describe("formatChatMessageTimestamp", () => {
  test("isZonedDayBeforeToday compares calendar days in the target zone", () => {
    const now = new Date("2023-01-15T14:00:00Z");
    const earlierSameDay = new Date("2023-01-15T01:00:00Z");
    const previousDay = new Date("2023-01-14T12:00:00Z");

    expect(
      isZonedDayBeforeToday(earlierSameDay, "Asia/Taipei", now)
    ).toBe(false);
    expect(isZonedDayBeforeToday(previousDay, "Asia/Taipei", now)).toBe(true);
  });

  test("formats same-day messages as time in the selected timezone", () => {
    const now = new Date("2023-01-15T14:00:00Z");
    const message = new Date("2023-01-15T12:00:00Z");

    const taipei = formatChatMessageTimestamp(
      message,
      "Asia/Taipei",
      "en-US",
      now
    );
    const newYork = formatChatMessageTimestamp(
      message,
      "America/New_York",
      "en-US",
      now
    );

    expect(taipei).toMatch(/8:00|08:00|20:00|8/);
    expect(newYork).toMatch(/7:00|07:00|7/);
    expect(taipei).not.toBe(newYork);
  });

  test("formats older messages as short month/day in the selected timezone", () => {
    const now = new Date("2023-01-15T14:00:00Z");
    const message = new Date("2023-01-10T12:00:00Z");

    const formatted = formatChatMessageTimestamp(
      message,
      "Asia/Taipei",
      "en-US",
      now
    );

    expect(formatted).toMatch(/Jan/);
    expect(formatted).toMatch(/10|11/);
    expect(formatted).not.toMatch(/AM|PM|:/);
  });
});
