import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DISPLAY_CORNER_FLOOR_PX,
  MENUBAR_HORIZONTAL_RHYTHM,
  PHONE_LAYOUT_MAX_WIDTH_PX,
  desktopContentEdge,
  menubarInnerPadding,
  shouldApplyDisplayCornerFloor,
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

  test("the left corner floor applies only to wide coarse-touch viewports", () => {
    expect(PHONE_LAYOUT_MAX_WIDTH_PX).toBe(640);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: false, viewportWidth: 1440 })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: false, viewportWidth: 1024 })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: true, viewportWidth: 390 })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: true, viewportWidth: 640 })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: true, viewportWidth: 641 })
    ).toBe(true);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: true, viewportWidth: 1180 })
    ).toBe(true);
  });

  test("css keeps the right edge as the raw status-bar inset", () => {
    const css = readFileSync(new URL("../../../src/index.css", import.meta.url), "utf8");
    expect(css).toContain("--desktop-content-left: var(--sat-safe-area-left)");
    expect(css).toContain("--desktop-content-right: var(--sat-safe-area-right)");
    expect(css).toContain("min-width: 641px");
    expect(css).toContain(
      "--desktop-content-left: max(env(safe-area-inset-left, 0px), 12px)"
    );
    const floorBlock = css.slice(
      css.indexOf("min-width: 641px"),
      css.indexOf("min-width: 641px") + 240
    );
    expect(floorBlock).not.toContain("--desktop-content-right");
  });
});
