import { describe, expect, test } from "bun:test";
import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  clampPreviewZoom,
  getNextZoomInLevel,
  getNextZoomOutLevel,
} from "../../../src/apps/preview/hooks/useImageZoomGestures";

describe("Preview image zoom levels", () => {
  test("clamps zoom to the supported range", () => {
    expect(clampPreviewZoom(1)).toBe(PREVIEW_ZOOM_MIN);
    expect(clampPreviewZoom(100)).toBe(100);
    expect(clampPreviewZoom(10_000)).toBe(PREVIEW_ZOOM_MAX);
    expect(clampPreviewZoom(Number.NaN)).toBe(100);
    expect(clampPreviewZoom(Number.POSITIVE_INFINITY)).toBe(100);
  });

  test("menu zoom steps are multiplicative and clamped", () => {
    expect(getNextZoomInLevel(100)).toBe(125);
    expect(getNextZoomOutLevel(125)).toBe(100);
    expect(getNextZoomInLevel(PREVIEW_ZOOM_MAX)).toBe(PREVIEW_ZOOM_MAX);
    expect(getNextZoomOutLevel(PREVIEW_ZOOM_MIN)).toBe(PREVIEW_ZOOM_MIN);
    expect(getNextZoomInLevel(40)).toBeGreaterThan(40);
    expect(getNextZoomOutLevel(40)).toBeLessThan(40);
  });
});

describe("Preview image zoom gesture wiring", () => {
  test("pinch/wheel listeners are non-passive so page zoom can be prevented", async () => {
    const hook = await Bun.file(
      "src/apps/preview/hooks/useImageZoomGestures.ts",
    ).text();
    expect(hook).toContain('addEventListener("touchmove", onTouchMove, { passive: false })');
    expect(hook).toContain('addEventListener("wheel", onWheel, { passive: false })');
    expect(hook).toContain('addEventListener("gesturestart", onGestureStart)');
    expect(hook).toContain('addEventListener("gesturechange", onGestureChange)');
    expect(hook).toContain('addEventListener("dblclick", onDoubleClick)');
  });

  test("image container opts out of browser pinch/double-tap zoom", async () => {
    const component = await Bun.file(
      "src/apps/preview/components/PreviewAppComponent.tsx",
    ).text();
    expect(component).toContain("useImageZoomGestures");
    expect(component).toContain("touch-pan-x touch-pan-y overscroll-contain");
  });

  test("discrete zoom actions animate and respect reduced motion", async () => {
    const hook = await Bun.file(
      "src/apps/preview/hooks/useImageZoomGestures.ts",
    ).text();
    expect(hook).toContain("requestAnimationFrame(step)");
    expect(hook).toContain("prefers-reduced-motion: reduce");
    // Double-tap/double-click toggles go through the animated paths.
    expect(hook).toContain("animateAnchoredZoom(target, makeAnchor(clientX, clientY))");
    expect(hook).toContain("onComplete: resetToFit");
    // Direct-tracking gestures cancel a running animation instead of animating.
    expect(hook).toContain("cancelZoomAnimation();");
  });

  test("menu zoom actions route through the anchored zoom controls", async () => {
    const menuBar = await Bun.file(
      "src/apps/preview/components/PreviewMenuBar.tsx",
    ).text();
    expect(menuBar).toContain("onClick: onZoomIn");
    expect(menuBar).toContain("onClick: onZoomOut");
    expect(menuBar).toContain("onClick: onActualSize");
    expect(menuBar).toContain("PREVIEW_ZOOM_MAX");
    expect(menuBar).toContain("PREVIEW_ZOOM_MIN");
  });
});
