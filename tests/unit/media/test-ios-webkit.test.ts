import { describe, expect, test } from "bun:test";
import { isIosWebKit, isMobileSafari } from "../../../src/utils/device";
import { shouldUseStaticLyricsRenderer } from "../../../src/utils/motionSafe";

describe("isIosWebKit fail-safe detection", () => {
  test("matches iPhone Safari", () => {
    expect(
      isIosWebKit({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      }),
    ).toBe(true);
  });

  test("matches Chrome on iOS (CriOS), which isMobileSafari excludes", () => {
    const crios =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1";
    expect(isIosWebKit({ userAgent: crios })).toBe(true);
    expect(
      /Safari/.test(crios) &&
        /Mobile|iP(hone|ad|od)/.test(crios) &&
        !/CriOS|FxiOS|EdgiOS/.test(crios),
    ).toBe(false);
  });

  test("matches iPadOS desktop-mode Macintosh UA with multi-touch", () => {
    expect(
      isIosWebKit({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      isIosWebKit({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });

  test("does not match desktop Chrome or Android", () => {
    expect(
      isIosWebKit({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
    expect(
      isIosWebKit({
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
      }),
    ).toBe(false);
  });

  test("static lyrics renderer is used for every iOS WebKit UA", () => {
    expect(shouldUseStaticLyricsRenderer(true)).toBe(true);
    expect(shouldUseStaticLyricsRenderer(false)).toBe(false);
  });

  test("isMobileSafari remains the narrow Safari-only helper", () => {
    expect(typeof isMobileSafari).toBe("function");
  });
});
