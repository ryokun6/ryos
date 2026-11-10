import { describe, expect, test } from "bun:test";
import { resolveCustomWallpaperSelectionAction } from "../../../src/sync/codecs";

/**
 * R7: a sibling wallpaper blob finishing while the selected wallpaper's
 * download is still queued must not reset the selection to the default.
 */

describe("resolveCustomWallpaperSelectionAction", () => {
  test("refreshes when the selected wallpaper is already local", () => {
    expect(
      resolveCustomWallpaperSelectionAction({
        wallpaperId: "W2",
        localKeys: new Set(["W1", "W2"]),
        deletedKeys: [],
      })
    ).toBe("refresh");
  });

  test("keeps the selection when the blob is still missing (deferred download)", () => {
    expect(
      resolveCustomWallpaperSelectionAction({
        wallpaperId: "W2",
        localKeys: new Set(["W1"]),
        deletedKeys: [],
      })
    ).toBe("keep");
  });

  test("resets only when the selected wallpaper was deleted in this batch", () => {
    expect(
      resolveCustomWallpaperSelectionAction({
        wallpaperId: "W2",
        localKeys: new Set(["W1"]),
        deletedKeys: ["W2"],
      })
    ).toBe("reset");
  });

  test("prefers refresh over reset when the blob is present", () => {
    expect(
      resolveCustomWallpaperSelectionAction({
        wallpaperId: "W2",
        localKeys: new Set(["W2"]),
        deletedKeys: ["W2"],
      })
    ).toBe("refresh");
  });
});
