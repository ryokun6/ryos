import { describe, expect, test } from "bun:test";
import { getRestorableTextEditInitialData } from "../src/types/appInitialData";

describe("TextEdit restore wiring", () => {
  test("persists only the document path needed to restore a window", () => {
    expect(
      getRestorableTextEditInitialData({
        path: "/Documents/notes.md",
        content: "# Notes",
      }),
    ).toEqual({ path: "/Documents/notes.md" });
    expect(getRestorableTextEditInitialData({ content: "# Notes" })).toBeUndefined();
    expect(getRestorableTextEditInitialData({ path: "" })).toBeUndefined();
  });

  test("app store strips inline TextEdit content on persist", async () => {
    const appStore = await Bun.file("src/stores/useAppStore.ts").text();
    expect(appStore).toContain(
      "getRestorableTextEditInitialData(inst.initialData)",
    );
  });
});
