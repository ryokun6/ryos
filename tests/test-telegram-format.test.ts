import { describe, expect, test } from "bun:test";
import { simplifyTelegramCitationDisplay } from "../api/_utils/telegram-format";

describe("telegram citation formatting", () => {
  test("removes parenthesized markdown citations", () => {
    expect(
      simplifyTelegramCitationDisplay(
        "it shipped yesterday ([example.com](https://example.com/news))."
      )
    ).toBe("it shipped yesterday.");
  });

  test("converts markdown links to plain source labels", () => {
    expect(
      simplifyTelegramCitationDisplay(
        "you can check [The Verge](https://www.theverge.com) for details"
      )
    ).toBe("you can check The Verge for details");
  });

  test("strips common markdown syntax while preserving readable plain text", () => {
    expect(
      simplifyTelegramCitationDisplay(
        "# Update\n- **Fast** and _clean_\n1. `Ship it`\n> ~~Done~~"
      )
    ).toBe("Update\n• Fast and clean\n1) Ship it\nDone");
  });

  test("converts task lists and fenced code blocks to plain text", () => {
    expect(
      simplifyTelegramCitationDisplay(
        "- [x] shipped\n```ts\nconst done = true;\n```"
      )
    ).toBe("• [x] shipped\nconst done = true;");
  });
});
