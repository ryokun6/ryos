import { describe, expect, test } from "bun:test";

import { parseKrcToLines, parseLrcToLines } from "../../../api/songs/_lyrics";
import { ApiRequestError } from "../../../src/api/core";
import {
  getLyricsErrorMessage,
  isExpectedLyricsMissError,
  normalizeLyricsFetchError,
} from "../../../src/utils/lyricsError";

describe("lyrics prefix filtering", () => {
  test("skips additional metadata prefixes in LRC content", () => {
    const lines = parseLrcToLines([
      "[00:01.00]Original Lyrics",
      "[00:02.00]Digital Edited",
      "[00:03.00]Korean Lyrics",
      "[00:04.00]日文词",
      "[00:05.00]Actual lyric line",
    ].join("\n"));

    expect(lines).toEqual([
      {
        startTimeMs: "5000",
        words: "Actual lyric line",
      },
    ]);
  });

  test("skips metadata lines that use full-width colon after label", () => {
    const lines = parseLrcToLines(
      [
        "[00:01.00]词\uFF1A作词人名",
        "[00:02.00]男\uFF1A歌手名",
        "[00:03.00]Actual lyric line",
      ].join("\n"),
    );

    expect(lines).toEqual([
      {
        startTimeMs: "3000",
        words: "Actual lyric line",
      },
    ]);
  });

  test("skips lines with space-hyphen-space (title - artist style)", () => {
    const lines = parseLrcToLines(
      [
        "[00:01.00]Some Song - Some Artist",
        "[00:02.00]Lyric without separator",
      ].join("\n"),
    );

    expect(lines).toEqual([
      {
        startTimeMs: "2000",
        words: "Lyric without separator",
      },
    ]);
  });

  test("skips any line that contains full-width colon", () => {
    const lines = parseLrcToLines(
      [
        "[00:01.00]Not a known prefix\uFF1A still skipped",
        "[00:02.00]Plain lyric",
      ].join("\n"),
    );

    expect(lines).toEqual([
      {
        startTimeMs: "2000",
        words: "Plain lyric",
      },
    ]);
  });

  test("skips copyright-permission disclaimer but keeps real lyrics", () => {
    const lines = parseLrcToLines(
      [
        "[00:01.00]【未经著作权人许可，不得以任何方式使用】",
        "[00:02.00]【未經著作權人許可，不得以任何方式使用】",
        "[00:03.00]【未经著作权人许可】",
        "[00:04.00]你坐在窗边",
        "[00:05.00]这首歌提到著作权只是歌词",
      ].join("\n"),
    );

    expect(lines).toEqual([
      {
        startTimeMs: "4000",
        words: "你坐在窗边",
      },
      {
        startTimeMs: "5000",
        words: "这首歌提到著作权只是歌词",
      },
    ]);
  });

  test("skips copyright-permission disclaimer in KRC content", () => {
    const lines = parseKrcToLines(
      [
        "[1000,2000]<0,400,0>【<400,800,0>未经著作权人许可，不得以任何方式使用】",
        "[3000,2000]<0,500,0>你坐在窗边",
        "[5000,2000]<0,500,0>这首歌提到<500,500,0>著作权<1000,500,0>只是歌词",
      ].join("\n"),
    );

    expect(lines).toEqual([
      {
        startTimeMs: "3000",
        words: "你坐在窗边",
        wordTimings: [
          { text: "你坐在窗边", startTimeMs: 0, durationMs: 500 },
        ],
      },
      {
        startTimeMs: "5000",
        words: "这首歌提到著作权只是歌词",
        wordTimings: [
          { text: "这首歌提到", startTimeMs: 0, durationMs: 500 },
          { text: "著作权", startTimeMs: 500, durationMs: 500 },
          { text: "只是歌词", startTimeMs: 1000, durationMs: 500 },
        ],
      },
    ]);
  });
});

describe("lyrics error handling", () => {
  test("normalizes lyrics API errors while preserving the original cause", () => {
    const original = new ApiRequestError(503, "upstream failed", {
      code: "LYRICS_UPSTREAM",
    });
    const normalized = normalizeLyricsFetchError(original);

    expect(normalized).toBeInstanceOf(Error);
    if (!(normalized instanceof Error)) {
      throw new Error("Expected lyrics error to normalize to Error");
    }
    expect(normalized.message).toBe("Failed to fetch lyrics (status 503)");
    expect(Object.getOwnPropertyDescriptor(normalized, "cause")?.value).toBe(
      original
    );
  });

  test("maps not-found and abort errors to user-facing lyrics messages", () => {
    expect(getLyricsErrorMessage(new Error("No lyrics found"))).toBe(
      "No lyrics available"
    );
    expect(
      getLyricsErrorMessage(new DOMException("cancelled", "AbortError"))
    ).toBe("Lyrics search timed out.");
  });

  test("treats 404 and no-lyrics errors as expected misses", () => {
    expect(
      isExpectedLyricsMissError(
        normalizeLyricsFetchError(new ApiRequestError(404, "missing", {}))
      )
    ).toBe(true);
    expect(isExpectedLyricsMissError(new Error("No lyrics found"))).toBe(true);
    expect(
      isExpectedLyricsMissError(
        normalizeLyricsFetchError(new ApiRequestError(503, "upstream", {}))
      )
    ).toBe(false);
  });
});
