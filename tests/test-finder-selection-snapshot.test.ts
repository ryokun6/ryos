import { describe, expect, test } from "bun:test";
import { resolveFinderSelectionSnapshot } from "../src/apps/finder/utils/fileSystemHelpers";

const staleLocalSelection = {
  selectedFile: "/Applets/Removed.app",
  selectedFiles: ["/Applets/Removed.app"],
  selectionAnchorPath: "/Applets/Removed.app",
};

describe("resolveFinderSelectionSnapshot", () => {
  test("preserves cleared instance selection instead of reviving stale local state", () => {
    const clearedInstanceSelection = {
      selectedFile: null,
      selectedFiles: [],
      selectionAnchorPath: null,
    };

    expect(
      resolveFinderSelectionSnapshot(
        clearedInstanceSelection,
        staleLocalSelection
      )
    ).toBe(clearedInstanceSelection);
  });

  test("uses local selection before a Finder instance exists", () => {
    expect(
      resolveFinderSelectionSnapshot(undefined, staleLocalSelection)
    ).toBe(staleLocalSelection);
  });
});
