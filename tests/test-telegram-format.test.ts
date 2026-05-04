import { describe, expect, test } from "bun:test";
import {
  simplifyTelegramCitationDisplay,
  stripMarkdownForTelegramCursorAgentCompletion,
} from "../api/_utils/telegram-format";

describe("telegram citation formatting", () => {
  test("removes parenthesized markdown citations", () => {
    expect(
      simplifyTelegramCitationDisplay(
        "it shipped yesterday ([example.com](https://example.com/news))."
      )
    ).toBe("it shipped yesterday.");
  });

  test("converts markdown links to label plus plain URL", () => {
    expect(
      simplifyTelegramCitationDisplay(
        "you can check [The Verge](https://www.theverge.com) for details"
      )
    ).toBe(
      "you can check The Verge https://www.theverge.com for details"
    );
  });

  test("strips common markdown syntax while preserving readable plain text", () => {
    expect(
      simplifyTelegramCitationDisplay(
        "# Update\n- **Fast** and _clean_\n1. `Ship it`\n> ~~Done~~"
      )
    ).toBe("Update\nFast and clean\n1) Ship it\nDone");
  });

  test("normalizes task lists and fenced code blocks to plain text", () => {
    expect(
      simplifyTelegramCitationDisplay(
        "- [x] shipped\n```ts\nconst done = true;\n```"
      )
    ).toBe("shipped\nconst done = true;");
  });

  test("unwraps angle-bracket HTTP links", () => {
    expect(
      simplifyTelegramCitationDisplay("see <https://example.com/path> today")
    ).toBe("see https://example.com/path today");
  });

  test("strips nested emphasis markers", () => {
    expect(simplifyTelegramCitationDisplay("***triple***")).toBe("triple");
  });

  test("removes simple HTML emphasis wrappers models sometimes emit", () => {
    expect(
      simplifyTelegramCitationDisplay("<strong>bold</strong> and <em>italic</em>")
    ).toBe("bold and italic");
  });
});

describe("stripMarkdownForTelegramCursorAgentCompletion", () => {
  test("keeps the headline line and strips markdown in the body", () => {
    const raw =
      "Cursor agent done — Job\n\nShipped **`feature`**.\n\nSee [PR](https://github.com/x/y/pull/1).";
    expect(stripMarkdownForTelegramCursorAgentCompletion(raw)).toBe(
      "Cursor agent done — Job\n\nShipped feature.\n\nSee PR https://github.com/x/y/pull/1."
    );
  });
});
