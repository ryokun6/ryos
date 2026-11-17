import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { computeWindowChromeInsets } from "../../../src/utils/windowInsets";
import {
  DISPLAY_CORNER_FLOOR_PX,
  EXPANDED_DISPLAY_MIN_PX,
  EXPANDED_MENUBAR_CORNER_FLOOR_PX,
  MENUBAR_HORIZONTAL_RHYTHM,
  PHONE_LAYOUT_MAX_WIDTH_PX,
  desktopContentEdge,
  FOLDED_COVER_STATUS_BAR_PX,
  menubarBoxHeight,
  menubarBoxLeft,
  menubarBoxRight,
  menubarBoxTop,
  menubarFillsSafeArea,
  menubarHorizontalPadding,
  menubarInnerPadding,
  menubarLeftEdge,
  menubarPaddingTop,
  menubarRightEdge,
  menubarSafeTop,
  shouldApplyDisplayCornerFloor,
  shouldApplyExpandedMenubarCorner,
  shouldApplyFoldedStatusBarInset,
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
    expect(EXPANDED_MENUBAR_CORNER_FLOOR_PX).toBe(28);
    expect(desktopContentEdge("left")).toBe("var(--desktop-content-left)");
    expect(desktopContentEdge("right")).toBe("var(--desktop-content-right)");
    expect(menubarLeftEdge()).toBe(
      "max(var(--desktop-content-left), var(--menubar-corner-floor, 0px))"
    );
    expect(menubarRightEdge()).toBe(
      "max(var(--desktop-content-right), var(--menubar-corner-floor, 0px))"
    );
    expect(menubarSafeTop()).toBe("var(--menubar-safe-top, 0px)");
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
    expect(css).toContain("--menubar-safe-top: 0px");
    expect(css).toContain("--menubar-safe-top: var(--sat-safe-area-top)");
    const shellBlock = css.slice(
      css.indexOf("html[data-ios-shell] {"),
      css.indexOf("html[data-ios-shell] {") + 220
    );
    expect(shellBlock).toContain("--menubar-safe-top: var(--sat-safe-area-top)");
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
    expect(menubar).toContain("menubarFillsSafeArea(");
    expect(menubar).toContain("opaqueMenubar: !isAquaGlass");
    expect(menubar).toContain("top: menubarBoxTop(fillsSafeArea)");
    expect(menubar).toContain("left: menubarBoxLeft(fillsSafeArea)");
    expect(menubar).toContain("right: menubarBoxRight(fillsSafeArea)");
    expect(menubar).toContain("paddingTop: menubarPaddingTop(fillsSafeArea)");
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

  test("the folded cover display floors the right inset at the 84px status bar", () => {
    expect(FOLDED_COVER_STATUS_BAR_PX).toBe(84);
    const css = readFileSync(new URL("../../../src/index.css", import.meta.url), "utf8");
    const foldedRules = css.match(
      /max\(env\(safe-area-inset-right, 0px\), 84px\)/g
    );
    expect(foldedRules?.length).toBe(2);
    expect(css).toContain("html[data-ios-shell][data-side-status-bar]");
    expect(css).toContain("min-width: 450px) and (max-width: 520px) and (min-height: 600px)");
    expect(css).toContain(
      "min-width: 620px) and (max-width: 760px) and (min-height: 440px) and (max-height: 540px)"
    );

    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: true,
        hasSideStatusBar: true,
        coarseTouch: true,
        viewportWidth: 466,
        viewportHeight: 678,
      })
    ).toBe(true);
    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: true,
        hasSideStatusBar: true,
        coarseTouch: true,
        viewportWidth: 678,
        viewportHeight: 466,
      })
    ).toBe(true);
    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: true,
        hasSideStatusBar: true,
        coarseTouch: true,
        viewportWidth: 402,
        viewportHeight: 874,
      })
    ).toBe(false);
    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: true,
        hasSideStatusBar: true,
        coarseTouch: true,
        viewportWidth: 874,
        viewportHeight: 402,
      })
    ).toBe(false);
    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: true,
        hasSideStatusBar: true,
        coarseTouch: true,
        viewportWidth: 951,
        viewportHeight: 669,
      })
    ).toBe(false);
    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: false,
        hasSideStatusBar: true,
        coarseTouch: true,
        viewportWidth: 466,
        viewportHeight: 678,
      })
    ).toBe(false);
    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: true,
        hasSideStatusBar: false,
        coarseTouch: true,
        viewportWidth: 466,
        viewportHeight: 678,
      })
    ).toBe(false);

  });

  test("opaque iOS-shell menubars fill the safe area and keep the content row", () => {
    expect(
      menubarFillsSafeArea({ iosShell: true, opaqueMenubar: true })
    ).toBe(true);
    // Aqua Glass stays inset so the wallpaper shows through the top strip.
    expect(
      menubarFillsSafeArea({ iosShell: true, opaqueMenubar: false })
    ).toBe(false);
    // Safari and desktop, even with a non-zero env() inset.
    expect(
      menubarFillsSafeArea({ iosShell: false, opaqueMenubar: true })
    ).toBe(false);

    const contentHeight = "var(--os-metrics-menubar-height)";
    expect(menubarBoxTop(true)).toBe("0px");
    expect(menubarBoxLeft(true)).toBe("0px");
    expect(menubarBoxRight(true)).toBe("0px");
    expect(menubarBoxHeight(true, contentHeight)).toBe(
      `calc(${contentHeight} + var(--menubar-safe-top, 0px))`
    );
    expect(menubarPaddingTop(true)).toBe("var(--menubar-safe-top, 0px)");
    expect(
      menubarHorizontalPadding({
        fillsSafeArea: true,
        side: "left",
        trafficLightClearance: false,
      })
    ).toBe(
      "calc(max(var(--desktop-content-left), var(--menubar-corner-floor, 0px)) + 0.5rem)"
    );
    expect(
      menubarHorizontalPadding({
        fillsSafeArea: true,
        side: "right",
        trafficLightClearance: false,
      })
    ).toBe(
      "calc(max(var(--desktop-content-right), var(--menubar-corner-floor, 0px)) + 0.5rem)"
    );
    expect(
      menubarHorizontalPadding({
        fillsSafeArea: true,
        side: "left",
        trafficLightClearance: true,
      })
    ).toBe(
      "calc(max(var(--desktop-content-left), var(--menubar-corner-floor, 0px)) + 78px)"
    );

    // The filled bar's bottom is still content height + safe top, which is
    // the y windows are clamped to. A 59px top inset must not be added twice.
    const chrome = {
      taskbarHeight: 0,
      hasDock: true,
      baseDockHeight: 56,
      dockScale: 1,
      dockHiding: false,
      dockPlacement: "right" as const,
      isAquaGlass: false,
      safeAreaBottom: 34,
    };
    expect(
      computeWindowChromeInsets({
        ...chrome,
        menuBarHeight: 25,
        safeTop: 59,
      }).topInset
    ).toBe(84);
    expect(
      computeWindowChromeInsets({
        ...chrome,
        menuBarHeight: 30,
        safeTop: 47,
      }).topInset
    ).toBe(77);
    expect(
      computeWindowChromeInsets({
        ...chrome,
        menuBarHeight: 25,
        safeTop: 0,
      }).topInset
    ).toBe(25);
  });

  test("outside the iOS shell the menubar box stays offset, not padded by the insets", () => {
    const contentHeight = "var(--os-metrics-menubar-height)";
    expect(menubarBoxTop(false)).toBe("var(--menubar-safe-top, 0px)");
    expect(menubarBoxLeft(false)).toBe(menubarLeftEdge());
    expect(menubarBoxRight(false)).toBe(menubarRightEdge());
    expect(menubarBoxHeight(false, contentHeight)).toBe(contentHeight);
    expect(menubarBoxHeight(false, "32px")).toBe("32px");
    expect(menubarPaddingTop(false)).toBe("0px");
    expect(
      menubarHorizontalPadding({
        fillsSafeArea: false,
        side: "left",
        trafficLightClearance: false,
      })
    ).toBe("0.5rem");
    expect(
      menubarHorizontalPadding({
        fillsSafeArea: false,
        side: "right",
        trafficLightClearance: true,
      })
    ).toBe("0.5rem");
  });

  test("the shell marker is the iOS bridge platform, not a user-agent check", () => {
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    expect(html).toContain('window.ryosDesktop.platform === "ios"');
    expect(html).toContain('setAttribute("data-ios-shell"');
    expect(html).not.toContain("iPhone");
  });
});
