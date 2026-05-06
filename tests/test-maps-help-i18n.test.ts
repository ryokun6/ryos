import { describe, expect, test } from "bun:test";
import { MAPS_HELP_I18N_KEYS } from "../src/apps/maps/helpKeys";
import { helpItems } from "../src/apps/maps/index";

describe("Maps help → i18n keys", () => {
  test("helpItems row count matches MAPS_HELP_I18N_KEYS (prevents misaligned translations)", () => {
    expect(helpItems.length).toBe(MAPS_HELP_I18N_KEYS.length);
  });
});
