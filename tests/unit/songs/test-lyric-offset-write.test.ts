import { describe, expect, test } from "bun:test";
import { normalizeLyricOffsetMap } from "../../../src/shared/listen/lyricOffsets";
import {
  LYRIC_OFFSET_MAX_MS,
  LYRIC_OFFSET_MIN_MS,
  clampLyricOffset,
  isLyricOffsetOnlyPatch,
} from "../../../src/shared/songs/lyricOffsetWrite";

describe("clampLyricOffset", () => {
  test("rounds and clamps to five minutes either side", () => {
    expect(clampLyricOffset(120.4)).toBe(120);
    expect(clampLyricOffset(LYRIC_OFFSET_MAX_MS + 50)).toBe(LYRIC_OFFSET_MAX_MS);
    expect(clampLyricOffset(LYRIC_OFFSET_MIN_MS - 50)).toBe(LYRIC_OFFSET_MIN_MS);
    expect(LYRIC_OFFSET_MAX_MS).toBe(300_000);
    expect(LYRIC_OFFSET_MIN_MS).toBe(-300_000);
  });

  test("rejects a non-finite offset", () => {
    expect(clampLyricOffset(Number.NaN)).toBeNull();
    expect(clampLyricOffset(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("isLyricOffsetOnlyPatch", () => {
  test("accepts a body that only sets lyricOffset", () => {
    expect(isLyricOffsetOnlyPatch({ lyricOffset: -250 })).toBe(true);
  });

  test("rejects metadata, lyrics-source, and share fields", () => {
    expect(isLyricOffsetOnlyPatch({ lyricOffset: 10, title: "Nope" })).toBe(false);
    expect(isLyricOffsetOnlyPatch({ lyricOffset: 10, artist: "Nope" })).toBe(false);
    expect(isLyricOffsetOnlyPatch({ lyricOffset: 10, lyricsSource: "kugou" })).toBe(false);
    expect(isLyricOffsetOnlyPatch({ lyricOffset: 10, isShare: true })).toBe(false);
    expect(isLyricOffsetOnlyPatch({ lyricOffset: 10, action: "clear" })).toBe(false);
    expect(isLyricOffsetOnlyPatch({ title: "Only title" })).toBe(false);
    expect(isLyricOffsetOnlyPatch({ lyricOffset: "120" })).toBe(false);
  });
});

describe("normalizeLyricOffsetMap", () => {
  test("keeps clamped offsets for youtube and apple music ids", () => {
    expect(
      normalizeLyricOffsetMap({
        dQw4w9WgXcQ: 400.2,
        "am:12345": -10,
        short: 20,
        dQw4w9WgXcQ2: Number.NaN,
      })
    ).toEqual({
      dQw4w9WgXcQ: 400,
      "am:12345": -10,
    });
  });
});
