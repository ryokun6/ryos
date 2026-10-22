import { describe, expect, test } from "bun:test";

import { secretsEqual } from "../../../api/_utils/_secret-compare.js";

describe("secretsEqual", () => {
  test("matches identical secrets", () => {
    expect(secretsEqual("Bearer abc123", "Bearer abc123")).toBe(true);
  });

  test("rejects different, prefixed, or different-length values", () => {
    expect(secretsEqual("Bearer abc124", "Bearer abc123")).toBe(false);
    expect(secretsEqual("Bearer abc1234", "Bearer abc123")).toBe(false);
    expect(secretsEqual("Bearer abc12", "Bearer abc123")).toBe(false);
    expect(secretsEqual("", "Bearer abc123")).toBe(false);
  });

  test("fails closed on missing input or an empty expected secret", () => {
    expect(secretsEqual(null, "secret")).toBe(false);
    expect(secretsEqual(undefined, "secret")).toBe(false);
    expect(secretsEqual("", "")).toBe(false);
  });
});
