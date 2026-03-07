import { describe, expect, test } from "bun:test";
import {
  CHAT_INSTRUCTIONS,
  TELEGRAM_CHAT_INSTRUCTIONS,
} from "../api/_utils/_aiPrompts.js";

describe("web search link instructions", () => {
  test("chat prompt requires compact parenthesized markdown citations", () => {
    expect(CHAT_INSTRUCTIONS).toContain(
      "cite sources as compact parenthesized markdown citations"
    );
    expect(CHAT_INSTRUCTIONS).toContain(
      "Keep citations minimal"
    );
  });

  test("telegram prompt keeps web-search sourcing light", () => {
    expect(TELEGRAM_CHAT_INSTRUCTIONS).toContain(
      "Default to one short sentence. Use two brief sentences only when it genuinely helps."
    );
    expect(TELEGRAM_CHAT_INSTRUCTIONS).toContain(
      "Text like a close friend – casual, natural, and concise, not polished support-speak."
    );
    expect(TELEGRAM_CHAT_INSTRUCTIONS).toContain(
      "Output plain text only. Do not use markdown emphasis, headings, blockquotes, markdown list markers, or code fences."
    );
    expect(TELEGRAM_CHAT_INSTRUCTIONS).toContain(
      "prefer no citations, or mention the source name naturally in prose"
    );
    expect(TELEGRAM_CHAT_INSTRUCTIONS).toContain(
      "Only include a plain URL when the user explicitly asks for the source or direct link"
    );
    expect(TELEGRAM_CHAT_INSTRUCTIONS).toContain(
      "Never use markdown link syntax, parenthetical citation blocks, or a separate sources/references list"
    );
  });
});
