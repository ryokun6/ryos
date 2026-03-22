import { describe, expect, test } from "bun:test";

import { parseLrcToLines } from "../api/songs/_lyrics";

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
});
