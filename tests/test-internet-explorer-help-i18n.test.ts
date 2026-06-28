import { describe, expect, test } from "bun:test";
import { INTERNET_EXPLORER_HELP_I18N_KEYS } from "../src/apps/internet-explorer/helpKeys";
import { helpItems } from "../src/apps/internet-explorer/metadata";

describe("Internet Explorer help -> i18n keys", () => {
  test("helpItems row count matches INTERNET_EXPLORER_HELP_I18N_KEYS (prevents misaligned translations)", () => {
    expect(helpItems.length).toBe(INTERNET_EXPLORER_HELP_I18N_KEYS.length);
  });
});
