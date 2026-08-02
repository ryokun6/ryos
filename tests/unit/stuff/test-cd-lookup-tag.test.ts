#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  isItunesMusicLookupResult,
  tagIdsWithDefaultCd,
} from "../../../src/apps/stuff/utils/cdLookupTag";

describe("isItunesMusicLookupResult", () => {
  test("true only for itunes_music source", () => {
    expect(isItunesMusicLookupResult({ source: "itunes_music" })).toBe(true);
    expect(isItunesMusicLookupResult({ source: "itunes" })).toBe(false);
    expect(isItunesMusicLookupResult({ source: "upcitemdb" })).toBe(false);
    expect(isItunesMusicLookupResult({ source: null })).toBe(false);
    expect(isItunesMusicLookupResult({})).toBe(false);
  });
});

describe("tagIdsWithDefaultCd", () => {
  test("adds CD for album hits; leaves non-album unchanged", () => {
    expect(tagIdsWithDefaultCd(undefined, "tag-cd", true)).toEqual(["tag-cd"]);
    expect(tagIdsWithDefaultCd(undefined, "tag-cd", false)).toBeUndefined();
    expect(tagIdsWithDefaultCd(["tag-kitchen"], "tag-cd", false)).toEqual([
      "tag-kitchen",
    ]);
  });

  test("merges CD without stripping other tags or duplicating", () => {
    expect(tagIdsWithDefaultCd(["tag-a"], "tag-cd", true)).toEqual([
      "tag-a",
      "tag-cd",
    ]);
    expect(tagIdsWithDefaultCd(["tag-cd", "tag-a"], "tag-cd", true)).toEqual([
      "tag-cd",
      "tag-a",
    ]);
  });
});
