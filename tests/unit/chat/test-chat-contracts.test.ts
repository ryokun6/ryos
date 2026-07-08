import { describe, expect, test } from "bun:test";
import { normalizeChatTimestamp } from "../../../src/shared/contracts/chat";

describe("normalizeChatTimestamp", () => {
  test("normalizes numeric timestamps", () => {
    expect(normalizeChatTimestamp(1700000000000, 1)).toBe(1700000000000);
  });

  test("normalizes ISO string timestamps", () => {
    expect(
      normalizeChatTimestamp("2026-06-07T21:00:00.000Z", 1)
    ).toBe(Date.parse("2026-06-07T21:00:00.000Z"));
  });

  test("uses fallback for invalid values", () => {
    expect(normalizeChatTimestamp("not-a-date", 123)).toBe(123);
    expect(normalizeChatTimestamp({}, 456)).toBe(456);
  });
});
