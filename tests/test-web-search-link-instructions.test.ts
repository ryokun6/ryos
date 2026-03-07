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

  test("telegram prompt requires plain inline urls instead of citation blocks", () => {
    expect(TELEGRAM_CHAT_INSTRUCTIONS).toContain(
      "use a normal inline URL in the sentence"
    );
    expect(TELEGRAM_CHAT_INSTRUCTIONS).toContain(
      "Do not use markdown link syntax or parenthetical citation blocks"
    );
  });
});
