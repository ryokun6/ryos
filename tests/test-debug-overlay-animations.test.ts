import { describe, expect, test } from "bun:test";
import {
  getDebugPanelMotionProps,
  getDebugPanelTransformOrigin,
} from "../src/components/debug/debugOverlayAnimations";

describe("debug overlay animations", () => {
  test("anchors transform origin above the debug FAB", () => {
    expect(getDebugPanelTransformOrigin("left")).toBe("bottom left");
    expect(getDebugPanelTransformOrigin("right")).toBe("bottom right");
  });

  test("uses subtle scale/opacity/translate when motion is allowed", () => {
    const motion = getDebugPanelMotionProps({ prefersReducedMotion: false });

    expect(motion.initial).toEqual({ opacity: 0, scale: 0.95, y: 8 });
    expect(motion.animate).toMatchObject({
      opacity: 1,
      scale: 1,
      y: 0,
    });
    expect(motion.exit).toMatchObject({
      opacity: 0,
      scale: 0.95,
      y: 8,
    });
    expect(motion.transition).toMatchObject({ duration: 0.2 });
  });

  test("disables motion when reduced motion is preferred", () => {
    const motion = getDebugPanelMotionProps({ prefersReducedMotion: true });

    expect(motion.initial).toEqual({ opacity: 1 });
    expect(motion.animate).toEqual({ opacity: 1 });
    expect(motion.exit).toEqual({ opacity: 1 });
    expect(motion.transition).toEqual({ duration: 0 });
  });
});

describe("debug overlay animation wiring", () => {
  test("DebugLogOverlay keeps the panel mounted through AnimatePresence exit", async () => {
    const source = await Bun.file(
      "src/components/debug/DebugLogOverlay.tsx"
    ).text();

    expect(source).toContain("AnimatePresence");
    expect(source).toContain("getDebugPanelMotionProps");
    expect(source).toContain('useMediaQuery("(prefers-reduced-motion: reduce)")');
    expect(source).toContain("useIsPresent");
    expect(source).toContain("exit={motionProps.exit}");
  });
});
