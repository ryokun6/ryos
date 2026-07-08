import { describe, test, expect } from "bun:test";

/**
 * Tests for network-aware prefetch gating (src/utils/network.ts).
 *
 * Background prefetch must be polite on metered / slow links: skip on Data
 * Saver and on slow effective connection types, allow otherwise (including
 * when the Network Information API is unavailable).
 */

import { shouldPrefetchOnConnection } from "../../../src/utils/network";

describe("shouldPrefetchOnConnection", () => {
  test("allows when connection info is unavailable", () => {
    expect(shouldPrefetchOnConnection(undefined)).toBe(true);
  });

  test("allows on fast connections", () => {
    expect(shouldPrefetchOnConnection({ effectiveType: "4g" })).toBe(true);
    expect(shouldPrefetchOnConnection({ effectiveType: "5g" })).toBe(true);
    expect(shouldPrefetchOnConnection({})).toBe(true);
  });

  test("skips when Data Saver is enabled", () => {
    expect(shouldPrefetchOnConnection({ saveData: true })).toBe(false);
    expect(
      shouldPrefetchOnConnection({ saveData: true, effectiveType: "4g" })
    ).toBe(false);
  });

  test("skips on slow effective connection types", () => {
    expect(shouldPrefetchOnConnection({ effectiveType: "slow-2g" })).toBe(false);
    expect(shouldPrefetchOnConnection({ effectiveType: "2g" })).toBe(false);
    expect(shouldPrefetchOnConnection({ effectiveType: "3g" })).toBe(false);
  });

  test("does not mistake 4g/5g for a slow type", () => {
    expect(shouldPrefetchOnConnection({ effectiveType: "4g" })).toBe(true);
  });
});
