/**
 * Minimize-to-dock targeting: `computeDockIconOffset` must measure the dock
 * icon from the live DOM (icons appear after launch and shift as the dock
 * re-centers), and `getExitAnimation` must defer that measurement until the
 * exit animation actually starts.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

let registeredDomHere = false;

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
    registeredDomHere = true;
  }
});

afterAll(() => {
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

const { computeDockIconOffset } = await import(
  "../src/components/layout/window-frame/hooks/useWindowFrameDockOffsets"
);
const { getExitAnimation } = await import(
  "../src/components/layout/window-frame/windowFrameAnimations"
);

type Rect = { left: number; top: number; width: number; height: number };

function addTarget(attr: string, value: string, rect: Rect): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute(attr, value);
  el.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

// Window centered at (500, 400)
const geometry = {
  windowPosition: { x: 300, y: 200 },
  windowSize: { width: 400, height: 400 },
};

describe("computeDockIconOffset", () => {
  test("targets the app's dock icon center relative to the window center", () => {
    const el = addTarget("data-dock-icon", "finder", {
      left: 100,
      top: 700,
      width: 48,
      height: 48,
    });
    try {
      const offset = computeDockIconOffset("finder", "finder-1", geometry);
      // Icon center (124, 724) minus window center (500, 400)
      expect(offset).toEqual({ x: -376, y: 324 });
    } finally {
      el.remove();
    }
  });

  test("prefers the per-instance dock icon over the per-app icon (applets)", () => {
    const appIcon = addTarget("data-dock-icon", "applet-viewer", {
      left: 0,
      top: 700,
      width: 48,
      height: 48,
    });
    const instanceIcon = addTarget("data-dock-icon", "instance-42", {
      left: 200,
      top: 700,
      width: 48,
      height: 48,
    });
    try {
      const offset = computeDockIconOffset(
        "applet-viewer",
        "instance-42",
        geometry
      );
      // Instance icon center (224, 724) minus window center (500, 400)
      expect(offset).toEqual({ x: -276, y: 324 });
    } finally {
      appIcon.remove();
      instanceIcon.remove();
    }
  });

  test("falls back to the taskbar item when no dock icon exists", () => {
    const el = addTarget("data-taskbar-item", "finder-1", {
      left: 60,
      top: 740,
      width: 160,
      height: 28,
    });
    try {
      const offset = computeDockIconOffset("finder", "finder-1", geometry);
      // Taskbar item center (140, 754) minus window center (500, 400)
      expect(offset).toEqual({ x: -360, y: 354 });
    } finally {
      el.remove();
    }
  });

  test("slides straight down when no dock icon or taskbar item exists", () => {
    const offset = computeDockIconOffset("finder", "finder-1", geometry);
    expect(offset).toEqual({
      x: 0,
      y: window.innerHeight - geometry.windowPosition.y,
    });
  });

  test("re-measures the icon on every call (no caching)", () => {
    const el = addTarget("data-dock-icon", "finder", {
      left: 100,
      top: 700,
      width: 48,
      height: 48,
    });
    try {
      const before = computeDockIconOffset("finder", undefined, geometry);
      // Dock re-centered: icon moved right by 100px.
      el.getBoundingClientRect = () =>
        ({
          left: 200,
          top: 700,
          width: 48,
          height: 48,
          right: 248,
          bottom: 748,
          x: 200,
          y: 700,
          toJSON: () => ({}),
        }) as DOMRect;
      const after = computeDockIconOffset("finder", undefined, geometry);
      expect(after.x).toBe(before.x + 100);
      expect(after.y).toBe(before.y);
    } finally {
      el.remove();
    }
  });
});

describe("getExitAnimation", () => {
  test("keep-mounted windows keep the static shrink-in-place exit", () => {
    const exit = getExitAnimation({
      keepMountedWhenMinimized: true,
      getDockIconOffset: () => {
        throw new Error("should not measure the dock for keep-mounted exits");
      },
    });
    expect(typeof exit).toBe("object");
    expect(exit).toMatchObject({ scale: 0.95, opacity: 0, x: 0, y: 0 });
  });

  test("minimize exit defers dock measurement until the animation starts", () => {
    let calls = 0;
    let offset = { x: -376, y: 324 };
    const exit = getExitAnimation({
      keepMountedWhenMinimized: false,
      getDockIconOffset: () => {
        calls += 1;
        return offset;
      },
    });

    // Motion resolves function-valued exit definitions lazily; nothing should
    // be measured at render time.
    expect(typeof exit).toBe("function");
    expect(calls).toBe(0);

    const resolve = exit as unknown as () => {
      scale: number;
      opacity: number;
      x: number;
      y: number;
    };

    expect(resolve()).toMatchObject({
      scale: 0.1,
      opacity: 0,
      x: -376,
      y: 324,
    });
    expect(calls).toBe(1);

    // The dock icon moved before the user minimized: the resolver must pick
    // up the new position.
    offset = { x: 24, y: 300 };
    expect(resolve()).toMatchObject({ x: 24, y: 300 });
  });
});
