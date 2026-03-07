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
});
