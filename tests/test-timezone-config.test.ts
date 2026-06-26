import { describe, expect, test } from "bun:test";
import {
  AUTO_TIMEZONE,
  formatOffsetLabel,
  formatTimezoneCity,
  getSupportedTimezones,
  getTimezoneOffsetMinutes,
  groupTimezonesByRegion,
  isValidTimezone,
  offsetMinutesToLongitude,
  resolveEffectiveTimezone,
} from "../src/lib/timezoneConfig";

describe("timezoneConfig", () => {
  test("getSupportedTimezones returns a sorted, non-empty list with common zones", () => {
    const zones = getSupportedTimezones();
    expect(zones.length).toBeGreaterThan(0);
    expect(zones).toContain("Asia/Tokyo");
    expect(zones).toContain("America/New_York");
    // Sorted ascending
    const sorted = [...zones].sort((a, b) => a.localeCompare(b));
    expect(zones).toEqual(sorted);
  });

  test("isValidTimezone accepts IANA ids and rejects junk", () => {
    expect(isValidTimezone("Asia/Taipei")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });

  test("formatTimezoneCity humanizes the last segment", () => {
    expect(formatTimezoneCity("Asia/Hong_Kong")).toBe("Hong Kong");
    expect(formatTimezoneCity("America/Argentina/Buenos_Aires")).toBe(
      "Buenos Aires"
    );
    expect(formatTimezoneCity("UTC")).toBe("UTC");
  });

  test("getTimezoneOffsetMinutes computes fixed offsets", () => {
    // A fixed-offset reference instant (no DST ambiguity for these zones).
    const ref = new Date("2023-01-15T12:00:00Z");
    expect(getTimezoneOffsetMinutes("UTC", ref)).toBe(0);
    // Asia/Taipei is a stable UTC+8 (no DST).
    expect(getTimezoneOffsetMinutes("Asia/Taipei", ref)).toBe(8 * 60);
    // Asia/Kolkata is UTC+5:30.
    expect(getTimezoneOffsetMinutes("Asia/Kolkata", ref)).toBe(5 * 60 + 30);
    // America/New_York in January is EST = UTC-5.
    expect(getTimezoneOffsetMinutes("America/New_York", ref)).toBe(-5 * 60);
  });

  test("formatOffsetLabel renders GMT offsets", () => {
    expect(formatOffsetLabel(0)).toBe("GMT+0");
    expect(formatOffsetLabel(8 * 60)).toBe("GMT+8");
    expect(formatOffsetLabel(-5 * 60)).toBe("GMT-5");
    expect(formatOffsetLabel(5 * 60 + 30)).toBe("GMT+5:30");
    expect(formatOffsetLabel(-(3 * 60 + 30))).toBe("GMT-3:30");
  });

  test("offsetMinutesToLongitude maps offset to a clamped longitude", () => {
    expect(offsetMinutesToLongitude(0)).toBe(0);
    expect(offsetMinutesToLongitude(8 * 60)).toBe(120);
    expect(offsetMinutesToLongitude(-5 * 60)).toBe(-75);
    // Clamps beyond the date line.
    expect(offsetMinutesToLongitude(14 * 60)).toBe(180);
    expect(offsetMinutesToLongitude(-13 * 60)).toBe(-180);
  });

  test("groupTimezonesByRegion buckets by prefix and sorts regions", () => {
    const groups = groupTimezonesByRegion([
      "Europe/Paris",
      "Asia/Tokyo",
      "Europe/Berlin",
      "UTC",
    ]);
    const regions = groups.map((g) => g.region);
    expect(regions).toEqual(["Asia", "Europe", "Other"]);
    const europe = groups.find((g) => g.region === "Europe");
    expect(europe?.zones).toEqual(["Europe/Paris", "Europe/Berlin"]);
    const other = groups.find((g) => g.region === "Other");
    expect(other?.zones).toEqual(["UTC"]);
  });

  test("resolveEffectiveTimezone falls back to browser for auto/invalid", () => {
    const browser = resolveEffectiveTimezone(AUTO_TIMEZONE);
    expect(typeof browser).toBe("string");
    expect(browser.length).toBeGreaterThan(0);
    expect(resolveEffectiveTimezone("Asia/Seoul")).toBe("Asia/Seoul");
    // Invalid id resolves to the browser timezone (same as auto).
    expect(resolveEffectiveTimezone("Not/AZone")).toBe(browser);
    expect(resolveEffectiveTimezone(null)).toBe(browser);
  });
});
