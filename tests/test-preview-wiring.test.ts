import { describe, expect, test } from "bun:test";
import { supportsMultiWindowApp } from "../src/apps/base/app-manager/instanceHelpers";
import { DOCK_MULTI_WINDOW_APPS } from "../src/components/layout/dock/dockConstants";

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
});
