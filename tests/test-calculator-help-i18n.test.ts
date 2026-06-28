import { describe, expect, test } from "bun:test";
import { CALCULATOR_HELP_I18N_KEYS } from "../src/apps/calculator/helpKeys";
import { helpItems } from "../src/apps/calculator";

describe("Calculator help -> i18n keys", () => {
  test("helpItems row count matches CALCULATOR_HELP_I18N_KEYS (prevents misaligned translations)", () => {
    expect(helpItems.length).toBe(CALCULATOR_HELP_I18N_KEYS.length);
  });
});
