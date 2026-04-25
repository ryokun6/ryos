import { describe, expect, test } from "bun:test";
import { formatKugouImageUrl } from "../src/utils/kugouImageUrl";

describe("formatKugouImageUrl", () => {
  test("returns null for missing URLs", () => {
    expect(formatKugouImageUrl(undefined)).toBeNull();
    expect(formatKugouImageUrl("")).toBeNull();
  });

  test("replaces size placeholder and upgrades http URLs", () => {
    expect(formatKugouImageUrl("http://example.com/{size}/cover.jpg", 150)).toBe(
      "https://example.com/150/cover.jpg"
    );
  });

  test("leaves existing https URLs without size placeholder intact", () => {
    expect(formatKugouImageUrl("https://example.com/cover.jpg")).toBe(
      "https://example.com/cover.jpg"
    );
  });
});
