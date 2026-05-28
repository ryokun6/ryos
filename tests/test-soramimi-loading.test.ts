import { describe, expect, test } from "bun:test";
import { getActivityLabel } from "@/hooks/useActivityLabel";
import {
  isFuriganaReadyForSoramimi,
  SORAMIMI_FETCH_TIMEOUT_MS,
  SORAMIMI_INFLIGHT_MAX_MS,
} from "@/utils/soramimiFetch";
import { SSE_STREAM_IDLE_TIMEOUT_MS } from "@/utils/chunkedStream";

describe("soramimi fetch sequencing", () => {
  test("waits for furigana only on Japanese tracks while furigana is in flight", () => {
    expect(isFuriganaReadyForSoramimi(false, true)).toBe(true);
    expect(isFuriganaReadyForSoramimi(true, true)).toBe(false);
    expect(isFuriganaReadyForSoramimi(true, false)).toBe(true);
  });

  test("uses conservative timeout constants", () => {
    expect(SORAMIMI_INFLIGHT_MAX_MS).toBeGreaterThanOrEqual(60_000);
    expect(SORAMIMI_FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(SORAMIMI_INFLIGHT_MAX_MS);
    expect(SSE_STREAM_IDLE_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
  });
});

describe("getActivityLabel soramimi errors", () => {
  test("shows non-spinner error label when soramimi failed", () => {
    const result = getActivityLabel({
      soramimiError: "SSE stream timed out",
      isFetchingSoramimi: false,
    });

    expect(result.isActive).toBe(true);
    expect(result.isError).toBe(true);
    expect(result.label).toBe("Misheard unavailable");
  });

  test("prefers loading label over stale error while soramimi is fetching", () => {
    const result = getActivityLabel({
      soramimiError: "old error",
      isFetchingSoramimi: true,
      soramimiProgress: 40,
    });

    expect(result.isActive).toBe(true);
    expect(result.isError).toBeUndefined();
    expect(result.label).toContain("Misheard");
    expect(result.label).toContain("40%");
  });
});
