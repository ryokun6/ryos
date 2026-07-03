import { describe, expect, test } from "bun:test";
import { supportsMultiWindowApp } from "../src/apps/base/app-manager/instanceHelpers";
import { DOCK_MULTI_WINDOW_APPS } from "../src/components/layout/dock/dockConstants";
import { getRestorablePreviewInitialData } from "../src/types/appInitialData";

describe("Preview app wiring", () => {
  test("is registered in shared multi-window gates", async () => {
    expect(supportsMultiWindowApp("preview")).toBe(true);
    expect(DOCK_MULTI_WINDOW_APPS).toContain("preview");

    const launchHook = await Bun.file("src/hooks/useLaunchApp.ts").text();
    const appStore = await Bun.file("src/stores/useAppStore.ts").text();
    expect(launchHook).toContain('appId === "preview"');
    expect(appStore).toContain('appId === "preview"');
  });

  test("uses a transparent content surface for Aqua Glass", async () => {
    const component = await Bun.file(
      "src/apps/preview/components/PreviewAppComponent.tsx",
    ).text();
    expect(component).toContain(
      'isAquaGlass ? "bg-transparent" : "bg-os-panel-bg"',
    );
  });

  test("persists only the document path needed to restore a window", () => {
    const content = new Blob(["preview"]);

    expect(
      getRestorablePreviewInitialData({
        path: "/Documents/guide.pdf",
        content,
      }),
    ).toEqual({ path: "/Documents/guide.pdf" });
    expect(getRestorablePreviewInitialData({ content })).toBeUndefined();
    expect(getRestorablePreviewInitialData({ path: "" })).toBeUndefined();
  });

  test("retains and reloads each window's last document", async () => {
    const previewLogic = await Bun.file(
      "src/apps/preview/hooks/usePreviewLogic.ts",
    ).text();
    const appStore = await Bun.file("src/stores/useAppStore.ts").text();

    expect(previewLogic).toContain(
      "updateInstanceInitialData(instanceId, { path });",
    );
    expect(previewLogic).toContain("loadedPathRef.current === path");
    expect(previewLogic).not.toContain(
      "clearInstanceInitialData(instanceId)",
    );
    expect(appStore).toContain(
      "getRestorablePreviewInitialData(inst.initialData)",
    );
  });
});
