import { describe, expect, test } from "bun:test";
import { getBuiltInCandyBarPacks } from "../api/candybar/_builtInPacks";

describe("CandyBar built-in packs", () => {
  test("includes the internet-sourced retro operating system packs", () => {
    const packs = getBuiltInCandyBarPacks();
    const sourcedPackIds = [
      "internet-win98-defaults",
      "internet-windows-xp-luna",
      "internet-macosx-aqua",
      "internet-classic-mac-os",
    ];

    for (const packId of sourcedPackIds) {
      const pack = packs.find((entry) => entry.id === packId);

      expect(pack).toBeDefined();
      expect(pack?.downloadUrl).toBeTruthy();
      expect(pack?.iconCount).toBe(pack?.previewIcons.length);
      expect(pack?.category).toBe("system");
      expect(
        pack?.previewIcons.every((icon) =>
          icon.url.startsWith("/candybar/icon-packs/")
        )
      ).toBe(true);
    }
  });
});
