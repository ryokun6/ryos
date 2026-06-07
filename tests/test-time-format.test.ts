import { describe, expect, test } from "bun:test";
import { formatSecondsAsMinutesSeconds } from "../src/utils/timeFormat";

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
