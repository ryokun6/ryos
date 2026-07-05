import { describe, expect, test } from "bun:test";
import { formatSecondsAsMinutesSeconds } from "../src/utils/timeFormat";
import { formatSeconds, formatSecondsMmSs } from "../src/utils/formatDuration";

describe("formatSecondsAsMinutesSeconds", () => {
  test("formats whole and fractional seconds as m:ss", () => {
    expect(formatSecondsAsMinutesSeconds(0)).toBe("0:00");
    expect(formatSecondsAsMinutesSeconds(9)).toBe("0:09");
    expect(formatSecondsAsMinutesSeconds(65.9)).toBe("1:05");
    expect(formatSecondsAsMinutesSeconds(3600)).toBe("60:00");
  });

  test("clamps negative values to zero", () => {
    expect(formatSecondsAsMinutesSeconds(-5)).toBe("0:00");
  });
});

describe("formatSeconds", () => {
  test("supports padded and unpadded minute segments", () => {
    expect(formatSeconds(65)).toBe("1:05");
    expect(formatSeconds(65, { padMinutes: true })).toBe("01:05");
    expect(formatSecondsMmSs(65)).toBe("01:05");
  });
});
