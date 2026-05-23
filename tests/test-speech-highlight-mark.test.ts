import { describe, expect, test } from "bun:test";
import { wrapMarkdownRangeWithSpeechMark } from "@/apps/chats/utils/speechHighlightMarkdown";

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
});
