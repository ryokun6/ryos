import { describe, expect, test } from "bun:test";
import { shouldShowDesktopDragDebugZone } from "../../../src/components/layout/menu-bar/desktopDragDebug";

describe("desktop drag debug zone", () => {
  test("requires Electron, debug mode, and Show Resizer", () => {
    expect(
      shouldShowDesktopDragDebugZone({
        isDesktopApp: true,
        debugMode: true,
        showResizers: true,
      })
    ).toBe(true);

    expect(
      shouldShowDesktopDragDebugZone({
        isDesktopApp: false,
        debugMode: true,
        showResizers: true,
      })
    ).toBe(false);

    expect(
      shouldShowDesktopDragDebugZone({
        isDesktopApp: true,
        debugMode: false,
        showResizers: true,
      })
    ).toBe(false);

    expect(
      shouldShowDesktopDragDebugZone({
        isDesktopApp: true,
        debugMode: true,
        showResizers: false,
      })
    ).toBe(false);
  });
});
