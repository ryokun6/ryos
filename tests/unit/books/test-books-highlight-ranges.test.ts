import { describe, expect, test } from "bun:test";
import {
  highlightRangesTouch,
  isHighlightRangeCfi,
  mergeTouchingHighlights,
} from "../../../src/apps/books/utils/booksHighlightRanges";
import type { BookHighlight } from "../../../src/stores/useBooksStore";

function mark(
  id: string,
  cfiRange: string,
  text: string,
  color: BookHighlight["color"] = "yellow",
  createdAt = 1
): BookHighlight {
  return { id, cfiRange, text, color, createdAt };
}

describe("books highlight ranges", () => {
  test("rejects highlights that are not CFI ranges", () => {
    expect(isHighlightRangeCfi("epubcfi(/6/4!/4/2,/1:0,/1:12)")).toBe(true);
    expect(isHighlightRangeCfi("epubcfi(/6/4!/4/2/1:0)")).toBe(false);
    expect(isHighlightRangeCfi("not-a-cfi")).toBe(false);
  });

  test("treats overlap, nesting, and touching offsets as one range", () => {
    expect(
      highlightRangesTouch(
        "epubcfi(/6/4!/4/2,/1:0,/1:12)",
        "epubcfi(/6/4!/4/2,/1:10,/1:20)"
      )
    ).toBe(true);
    expect(
      highlightRangesTouch(
        "epubcfi(/6/4!/4/2,/1:0,/1:12)",
        "epubcfi(/6/4!/4/2,/1:12,/1:24)"
      )
    ).toBe(true);
    expect(
      highlightRangesTouch(
        "epubcfi(/6/4!/4/2,/1:0,/1:12)",
        "epubcfi(/6/4!/4/2,/1:2,/1:4)"
      )
    ).toBe(true);
    expect(
      highlightRangesTouch(
        "epubcfi(/6/4!/4,/2/1:0,/4/1:10)",
        "epubcfi(/6/4!/4,/4/1:10,/6/1:5)"
      )
    ).toBe(true);
  });

  test("leaves a one-character gap and a different spine alone", () => {
    expect(
      highlightRangesTouch(
        "epubcfi(/6/4!/4/2,/1:0,/1:12)",
        "epubcfi(/6/4!/4/2,/1:13,/1:24)"
      )
    ).toBe(false);
    expect(
      highlightRangesTouch(
        "epubcfi(/6/4!/4/2,/1:0,/1:12)",
        "epubcfi(/6/6!/4/2,/1:0,/1:5)"
      )
    ).toBe(false);
  });

  test("merges a chain into the preferred highlight", () => {
    const merged = mergeTouchingHighlights(
      [
        mark("a", "epubcfi(/6/4!/4/2,/1:0,/1:8)", "abcdefgh", "yellow", 10),
        mark("gap", "epubcfi(/6/4!/4/2,/1:40,/1:44)", "gap!", "blue", 30),
        mark("b", "epubcfi(/6/4!/4/2,/1:6,/1:12)", "ghijkl", "green", 20),
        mark("c", "epubcfi(/6/4[chap]!/4[body]/2,/1:0,/1:2)", "no", "pink", 40),
      ],
      { preferredId: "b" }
    );

    expect(merged.map((item) => item.id)).toEqual(["b", "gap", "c"]);
    expect(merged[0]).toMatchObject({
      id: "b",
      cfiRange: "epubcfi(/6/4!/4/2,/1:0,/1:12)",
      text: "abcdefghijkl",
      color: "green",
      createdAt: 10,
    });
  });

  test("keeps assertion steps when paragraph ranges touch", () => {
    const merged = mergeTouchingHighlights([
      mark("a", "epubcfi(/6/4[chap]!/4[body],/2/1:0,/4/1:4)", "one", "yellow", 1),
      mark("b", "epubcfi(/6/4[chap]!/4[body],/4/1:4,/6/1:3)", "two", "pink", 2),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.cfiRange).toBe(
      "epubcfi(/6/4[chap]!/4[body],/2/1:0,/6/1:3)"
    );
  });

  test("a remote upsert's color wins when it overlaps a local mark", () => {
    const merged = mergeTouchingHighlights(
      [
        mark("local", "epubcfi(/6/4!/4/2,/1:0,/1:12)", "abcdefghijkl", "yellow", 5),
        mark("remote", "epubcfi(/6/4!/4/2,/1:10,/1:18)", "klmnopqr", "purple", 9),
      ],
      { preferredIds: new Set(["remote"]) }
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "remote",
      color: "purple",
      cfiRange: "epubcfi(/6/4!/4/2,/1:0,/1:18)",
      text: "abcdefghijklmnopqr",
      createdAt: 5,
    });
  });
});
