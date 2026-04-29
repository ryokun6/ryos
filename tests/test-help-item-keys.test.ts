import { describe, expect, test } from "bun:test";
import { HELP_ITEM_KEYS_BY_APP_ID } from "@/hooks/helpItemKeys";

/**
 * Guards against misaligned help carousel i18n keys (see useTranslatedHelpItems).
 * When a key list is shorter than helpItems, later cards stay English; wrong keys show wrong copy.
 */
describe("HELP_ITEM_KEYS_BY_APP_ID", () => {
  test("stickies has six keys matching apps.stickies.help (createNote … autoSave)", () => {
    expect(HELP_ITEM_KEYS_BY_APP_ID.stickies).toEqual([
      "createNote",
      "colors",
      "moveResize",
      "deleteNote",
      "clearAll",
      "autoSave",
    ]);
  });

  test("synth sixth card maps to octaveShift translation (not midiInput)", () => {
    expect(HELP_ITEM_KEYS_BY_APP_ID.synth).toHaveLength(6);
    expect(HELP_ITEM_KEYS_BY_APP_ID.synth[5]).toBe("octaveShift");
  });

  test("control-panels includes all seven panels including sync before system", () => {
    expect(HELP_ITEM_KEYS_BY_APP_ID["control-panels"]).toHaveLength(7);
    expect(HELP_ITEM_KEYS_BY_APP_ID["control-panels"]).toEqual([
      "appearance",
      "sounds",
      "aiModel",
      "shaderEffects",
      "backupRestore",
      "sync",
      "system",
    ]);
  });
});
