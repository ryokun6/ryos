import { describe, expect, test } from "bun:test";
import { extractCompletedParagraphRanges, extractCompletedLineRanges } from "@/apps/chats/utils/streamingSpeech";
import { cleanTextForSpeech } from "@/apps/chats/utils/textForSpeech";

describe("extractCompletedParagraphRanges", () => {
  test("returns nothing until a paragraph break exists", () => {
    expect(extractCompletedParagraphRanges("still streaming …", 0)).toEqual({
      paragraphs: [],
      nextIndex: 0,
    });
  });

  test("consumes paragraphs separated by a blank line", () => {
    const content = "First paragraph.\n\nSecond paragraph.";
    const { paragraphs, nextIndex } = extractCompletedParagraphRanges(
      content,
      0,
    );
    expect(paragraphs).toEqual([
      { rawStart: 0, rawEnd: "First paragraph.".length },
    ]);
    expect(nextIndex).toBe("First paragraph.\n\n".length);
    const tail = cleanTextForSpeech(content.slice(nextIndex));
    expect(tail).toContain("Second");
  });

  test("handles CRLF separators and folds extra blank lines", () => {
    const content = "A\r\n\r\n\r\n\r\nB";
    const r = extractCompletedParagraphRanges(content, 0);
    expect(r.paragraphs).toEqual([{ rawStart: 0, rawEnd: 1 }]);
    expect(content.slice(r.nextIndex)).toBe("B");
  });

  test("consumes consecutive completed paragraphs in one pass", () => {
    const content = "P1.\n\nP2.\n\nP3";
    const r = extractCompletedParagraphRanges(content, 0);
    expect(r.paragraphs).toEqual([
      { rawStart: 0, rawEnd: 3 },
      { rawStart: 5, rawEnd: 8 },
    ]);
    expect(content.slice(r.nextIndex)).toBe("P3");
  });
});

describe("extractCompletedLineRanges", () => {
  test("returns nothing until a line break exists", () => {
    expect(extractCompletedLineRanges("streaming one line…", 0)).toEqual({
      lines: [],
      nextIndex: 0,
    });
  });

  test("consumes one complete line terminated by LF", () => {
    const content = "Hello\nstill open";
    const r = extractCompletedLineRanges(content, 0);
    expect(r.lines).toEqual([{ rawStart: 0, rawEnd: 5 }]);
    expect(r.nextIndex).toBe(6); // past \n
    expect(content.slice(r.nextIndex)).toBe("still open");
  });

  test("skips blank lines without enqueueing speech", () => {
    const content = "\n\nA\n";
    const r = extractCompletedLineRanges(content, 0);
    expect(r.lines).toEqual([{ rawStart: 2, rawEnd: 3 }]);
  });

  test("handles CRLF and yields multiple completed lines", () => {
    const content = "a\r\nb\r\n";
    const r = extractCompletedLineRanges(content, 0);
    expect(r.lines).toEqual([
      { rawStart: 0, rawEnd: 1 },
      { rawStart: 3, rawEnd: 4 },
    ]);
    expect(r.nextIndex).toBe(content.length);
  });
});

