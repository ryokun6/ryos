import { describe, expect, test } from "bun:test";
import { TOOL_USAGE_INSTRUCTIONS } from "../../../api/_utils/_aiPrompts.js";
import { TOOL_DESCRIPTIONS } from "../../../api/chat/tools/index.js";

describe("iOS media prompt: add is allowed, auto-play is not required", () => {
  test("tool-usage prompt separates search/add from auto-play", () => {
    expect(TOOL_USAGE_INSTRUCTIONS).toContain("iOS AUTO-PLAY ≠ ADD");
    expect(TOOL_USAGE_INSTRUCTIONS).toContain(
      "NEVER refuse or skip searching or adding a song because the OS is iOS"
    );
    expect(TOOL_USAGE_INSTRUCTIONS).toContain(
      "Auto-play restriction ≠ add restriction"
    );
    expect(TOOL_USAGE_INSTRUCTIONS).toContain(
      "Add the track with `addAndPlay`"
    );
    expect(TOOL_USAGE_INSTRUCTIONS).toContain("there is no add-only action");

    // Per-app reminders must still require add, not "don't touch music tools".
    expect(TOOL_USAGE_INSTRUCTIONS).toContain(
      "still search + `addAndPlay` / `playKnown`"
    );
    expect(TOOL_USAGE_INSTRUCTIONS).toMatch(
      /### Videos[\s\S]*still `addAndPlay` \/ `playKnown`/
    );

    // Old wording made cautious models skip search/add entirely.
    expect(TOOL_USAGE_INSTRUCTIONS).not.toContain("iOS RESTRICTION");
    expect(TOOL_USAGE_INSTRUCTIONS).not.toContain("do NOT auto-play");
    expect(TOOL_USAGE_INSTRUCTIONS).not.toContain(
      "do NOT auto-play music"
    );
  });

  test("mediaControl tool description still requires add on iOS", () => {
    expect(TOOL_DESCRIPTIONS.mediaControl).toContain(
      "never skip adding because the OS is iOS"
    );
    expect(TOOL_DESCRIPTIONS.mediaControl).toContain(
      "addAndPlay is the add path"
    );
    expect(TOOL_DESCRIPTIONS.mediaControl).toContain(
      "Auto-play restriction ≠ add restriction"
    );
    expect(TOOL_DESCRIPTIONS.mediaControl).not.toContain(
      "do NOT automatically start playback"
    );
  });
});
