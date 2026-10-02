import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DISPLAY_CORNER_FLOOR_PX,
  EXPANDED_DISPLAY_MIN_PX,
  EXPANDED_MENUBAR_LEFT_FLOOR_PX,
  MENUBAR_HORIZONTAL_RHYTHM,
  PHONE_LAYOUT_MAX_WIDTH_PX,
  desktopContentEdge,
  menubarInnerPadding,
  menubarLeftEdge,
  shouldApplyDisplayCornerFloor,
  shouldApplyExpandedMenubarCorner,
} from "../../../src/components/layout/menu-bar/menubarEdgePadding";

describe("menubar edge padding", () => {
  test("viewport meta opts into edge-to-edge safe areas", () => {
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    expect(html).toContain("viewport-fit=cover");
  });

  test("the menubar box is offset by the content rect and padded only by the rhythm", () => {
    // 0.5rem is 8px at the 16px root. The status-bar inset is the box offset,
    // so it is not added again as padding.
    expect(MENUBAR_HORIZONTAL_RHYTHM).toBe("0.5rem");
    expect(DISPLAY_CORNER_FLOOR_PX).toBe(12);
    expect(EXPANDED_MENUBAR_LEFT_FLOOR_PX).toBe(28);
    expect(desktopContentEdge("left")).toBe("var(--desktop-content-left)");
    expect(desktopContentEdge("right")).toBe("var(--desktop-content-right)");
    expect(menubarLeftEdge()).toBe(
      "max(var(--desktop-content-left), var(--menubar-corner-floor, 0px))"
    );
    expect(
      menubarInnerPadding({ side: "left", trafficLightClearance: false })
    ).toBe("0.5rem");
    expect(
      menubarInnerPadding({ side: "right", trafficLightClearance: false })
    ).toBe("0.5rem");
  });

  test("traffic-light clearance stays a 78px inner pad and does not replace the offset", () => {
    expect(
      menubarInnerPadding({ side: "left", trafficLightClearance: true })
    ).toBe("78px");
    expect(
      menubarInnerPadding({ side: "right", trafficLightClearance: true })
    ).toBe("0.5rem");
  });

  test("the left corner floor applies only inside the iOS shell on wide coarse-touch viewports", () => {
    expect(PHONE_LAYOUT_MAX_WIDTH_PX).toBe(640);
    expect(
      shouldApplyDisplayCornerFloor({
        iosShell: false,
        coarseTouch: true,
        viewportWidth: 1180,
      })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({
        iosShell: true,
        coarseTouch: false,
        viewportWidth: 1440,
      })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({
        iosShell: true,
        coarseTouch: true,
        viewportWidth: 390,
      })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({
        iosShell: true,
        coarseTouch: true,
        viewportWidth: 640,
      })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({
        iosShell: true,
        coarseTouch: true,
        viewportWidth: 641,
      })
    ).toBe(true);
  });

  test("css content insets are 0 until the iOS shell attribute is present", () => {
    const css = readFileSync(new URL("../../../src/index.css", import.meta.url), "utf8");
    expect(css).toContain("--desktop-content-left: 0px");
    expect(css).toContain("--desktop-content-right: 0px");
    expect(css).toContain("html[data-ios-shell]");
    expect(css).toContain("--desktop-content-left: var(--sat-safe-area-left)");
    expect(css).toContain("--desktop-content-right: var(--sat-safe-area-right)");
    expect(css).toContain("min-width: 641px");
    expect(css).toContain(
      "--desktop-content-left: max(env(safe-area-inset-left, 0px), 12px)"
    );
    const floorBlock = css.slice(
      css.indexOf("min-width: 641px"),
      css.indexOf("min-width: 641px") + 280
    );
    expect(floorBlock).toContain("html[data-ios-shell]");
    expect(floorBlock).not.toContain("--desktop-content-right");
    const menubar = readFileSync(
      new URL(
        "../../../src/components/layout/menu-bar/MacTopMenuBar.tsx",
        import.meta.url
      ),
      "utf8"
    );
    expect(menubar).toContain("left: menubarLeftEdge()");
    expect(css).toContain("--menubar-corner-floor: 0px");
    expect(css).toContain("min-width: 500px) and (min-height: 500px)");
    expect(css).toContain("--menubar-corner-floor: 28px");
    const expandedBlock = css.slice(
      css.indexOf("min-height: 500px"),
      css.indexOf("min-height: 500px") + 220
    );
    expect(expandedBlock).toContain("html[data-ios-shell]");
    expect(expandedBlock).not.toContain("--desktop-content-left");
    expect(expandedBlock).not.toContain("--desktop-content-right");
  });

  test("the wider menubar corner floor applies only when the inner display is fully expanded", () => {
    expect(EXPANDED_DISPLAY_MIN_PX).toBe(500);
    const expanded = {
      iosShell: true,
      coarseTouch: true,
      viewportWidth: 951,
      viewportHeight: 669,
    };
    expect(shouldApplyExpandedMenubarCorner(expanded)).toBe(true);
    expect(
      shouldApplyExpandedMenubarCorner({
        ...expanded,
        viewportWidth: 669,
        viewportHeight: 951,
      })
    ).toBe(true);
    // Cover display, landscape: wide, but the shorter side stays under 500.
    expect(
      shouldApplyExpandedMenubarCorner({
        iosShell: true,
        coarseTouch: true,
        viewportWidth: 678,
        viewportHeight: 466,
      })
    ).toBe(false);
    // Regular iPhone landscape in the shell.
    expect(
      shouldApplyExpandedMenubarCorner({
        iosShell: true,
        coarseTouch: true,
        viewportWidth: 874,
        viewportHeight: 402,
      })
    ).toBe(false);
    // Safari, even on a large touch viewport.
    expect(
      shouldApplyExpandedMenubarCorner({
        iosShell: false,
        coarseTouch: true,
        viewportWidth: 951,
        viewportHeight: 669,
      })
    ).toBe(false);
    // Desktop pointer.
    expect(
      shouldApplyExpandedMenubarCorner({
        iosShell: true,
        coarseTouch: false,
        viewportWidth: 951,
        viewportHeight: 669,
      })
    ).toBe(false);
  });

  test("the shell marker is the iOS bridge platform, not a user-agent check", () => {
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    expect(html).toContain('window.ryosDesktop.platform === "ios"');
    expect(html).toContain('setAttribute("data-ios-shell"');
    expect(html).not.toContain("iPhone");
  });
});
