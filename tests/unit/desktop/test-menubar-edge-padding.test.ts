import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DISPLAY_CORNER_FLOOR_PX,
  MENUBAR_HORIZONTAL_RHYTHM,
  PHONE_LAYOUT_MAX_WIDTH_PX,
  desktopContentEdge,
  FOLDED_COVER_STATUS_BAR_PX,
  menubarInnerPadding,
  shouldApplyDisplayCornerFloor,
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
    expect(desktopContentEdge("left")).toBe("var(--desktop-content-left)");
    expect(desktopContentEdge("right")).toBe("var(--desktop-content-right)");
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
  });

  test("the folded cover display floors the right inset at the 84px status bar", () => {
    expect(FOLDED_COVER_STATUS_BAR_PX).toBe(84);
    const css = readFileSync(new URL("../../../src/index.css", import.meta.url), "utf8");
    const foldedRules = css.match(
      /max\(env\(safe-area-inset-right, 0px\), 84px\)/g
    );
    expect(foldedRules?.length).toBe(2);
    expect(css).toContain("min-width: 450px) and (max-width: 520px) and (min-height: 600px)");
    expect(css).toContain(
      "min-width: 620px) and (max-width: 760px) and (min-height: 440px) and (max-height: 540px)"
    );

    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: true,
        coarseTouch: true,
        viewportWidth: 466,
        viewportHeight: 678,
      })
    ).toBe(true);
    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: true,
        coarseTouch: true,
        viewportWidth: 678,
        viewportHeight: 466,
      })
    ).toBe(true);
    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: true,
        coarseTouch: true,
        viewportWidth: 402,
        viewportHeight: 874,
      })
    ).toBe(false);
    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: true,
        coarseTouch: true,
        viewportWidth: 874,
        viewportHeight: 402,
      })
    ).toBe(false);
    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: true,
        coarseTouch: true,
        viewportWidth: 951,
        viewportHeight: 669,
      })
    ).toBe(false);
    expect(
      shouldApplyFoldedStatusBarInset({
        iosShell: false,
        coarseTouch: true,
        viewportWidth: 466,
        viewportHeight: 678,
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
