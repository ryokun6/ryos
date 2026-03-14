import { describe, expect, test } from "bun:test";

import { parseLrcToLines } from "../api/songs/_lyrics";

describe("lyrics prefix filtering", () => {
  test("skips additional metadata prefixes in LRC content", () => {
    const lines = parseLrcToLines([
      "[00:01.00]Original Lyrics",
      "[00:02.00]Digital Edited",
      "[00:03.00]Korean Lyrics",
      "[00:04.00]Actual lyric line",
    ].join("\n"));

    expect(lines).toEqual([
      {
        startTimeMs: "4000",
        words: "Actual lyric line",
      },
    ]);
  });
});
