import { describe, expect, test } from "bun:test";
import {
  skipMarkdownLineStructuralPrefix,
  wrapMarkdownRangeWithSpeechMark,
} from "@/apps/chats/utils/speechHighlightMarkdown";

describe("skipMarkdownLineStructuralPrefix", () => {
  test("unordered list marker", () => {
    expect(skipMarkdownLineStructuralPrefix("- Hello")).toBe(2);
    expect(skipMarkdownLineStructuralPrefix("* Item")).toBe(2);
  });

  test("task list checkbox", () => {
    expect(skipMarkdownLineStructuralPrefix("- [ ] Buy milk")).toBe(6);
    expect(skipMarkdownLineStructuralPrefix("- [x] Done")).toBe(6);
  });

  test("ordered list", () => {
    expect(skipMarkdownLineStructuralPrefix("10. tenth")).toBe(4);
  });

  test("blockquote leader", () => {
    expect(skipMarkdownLineStructuralPrefix("> quoted")).toBe(2);
  });

  test("ATX heading", () => {
    expect(skipMarkdownLineStructuralPrefix("## Heading")).toBe(3);
  });

  test("does not strip # when not heading", () => {
    expect(skipMarkdownLineStructuralPrefix("#not-a-heading")).toBe(0);
  });
});

describe("wrapMarkdownRangeWithSpeechMark", () => {
  test("wraps a UTF-16 range inside markdown", () => {
    expect(wrapMarkdownRangeWithSpeechMark("Hello **world**\n!", 8, 13)).toBe(
      `Hello **<mark class="ryos-chat-tts-mark">world</mark>**\n!`,
    );
  });

  test("escapes HTML special characters inside the mark", () => {
    expect(wrapMarkdownRangeWithSpeechMark("a < b", 2, 5)).toBe(
      `a <mark class="ryos-chat-tts-mark">&lt; b</mark>`,
    );
  });

  test("does not inject across fenced code", () => {
    const md = "```\nx\n```";
    expect(wrapMarkdownRangeWithSpeechMark(md, 0, md.length)).toBe(md);
  });

  test("highlights only list item body (keeps bullets valid markdown)", () => {
    const md = `- Hello`;
    expect(wrapMarkdownRangeWithSpeechMark(md, 0, md.length)).toBe(
      `- <mark class="ryos-chat-tts-mark">Hello</mark>`,
    );
  });

  test("multiple lines get separate marks (no mark across list prefixes)", () => {
    const md = `- A\n- B`;
    expect(wrapMarkdownRangeWithSpeechMark(md, 0, md.length)).toBe(
      `- <mark class="ryos-chat-tts-mark">A</mark>\n- <mark class="ryos-chat-tts-mark">B</mark>`,
    );
  });

  test("blockquote content only", () => {
    const md = `> Say this`;
    expect(wrapMarkdownRangeWithSpeechMark(md, 0, md.length)).toBe(
      `> <mark class="ryos-chat-tts-mark">Say this</mark>`,
    );
  });
});
