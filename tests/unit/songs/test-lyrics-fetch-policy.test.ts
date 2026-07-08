import { describe, expect, test } from "bun:test";
import { shouldForceLyricsFetch } from "../../../src/shared/media/lyricsFetchPolicy";

describe("shouldForceLyricsFetch", () => {
  test("routine refetches remain public", () => {
    expect(
      shouldForceLyricsFetch({
        isCacheBustRequest: false,
        isAuthenticated: false,
      })
    ).toBe(false);
  });

  test("anonymous cache busts fall back to a public refetch", () => {
    expect(
      shouldForceLyricsFetch({
        isCacheBustRequest: true,
        isAuthenticated: false,
      })
    ).toBe(false);
  });

  test("authenticated cache busts force a server refresh", () => {
    expect(
      shouldForceLyricsFetch({
        isCacheBustRequest: true,
        isAuthenticated: true,
      })
    ).toBe(true);
  });
});
