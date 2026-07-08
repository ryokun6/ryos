/**
 * WindowFrame's minimize exit relies on Motion resolving function-valued
 * `exit` definitions when the exit animation starts (motion-dom's
 * resolveVariantFromProps). That behavior is undocumented in the public
 * types, so pin it here against the installed motion version: if a motion
 * upgrade drops it, minimizing windows would silently stop zooming to the
 * dock icon.
 */
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let registeredDomHere = false;

const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  "IS_REACT_ACT_ENVIRONMENT"
);

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
    registeredDomHere = true;
  }
  // Earlier suites may leave a non-writable descriptor; redefine instead of
  // assigning so this suite stays green in the aggregate Bun process.
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
});

afterAll(() => {
  if (originalActEnvironment) {
    Object.defineProperty(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
      originalActEnvironment
    );
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

const { AnimatePresence, motion } = await import("motion/react");
const { getExitAnimation } = await import(
  "../../../src/components/layout/window-frame/windowFrameAnimations"
);

let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => r.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

async function nextFrames(count: number) {
  for (let i = 0; i < count; i++) {
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    });
  }
}

test("motion resolves the lazy minimize exit when the window unmounts", async () => {
  let measurements = 0;
  let offset = { x: -120, y: 480 };
  let lastMeasured: { x: number; y: number } | null = null;

  const exitDefinition = getExitAnimation({
    keepMountedWhenMinimized: false,
    getDockIconOffset: () => {
      measurements += 1;
      lastMeasured = offset;
      return offset;
    },
  });

  // Mirror WindowFrame's structure: the exit definition lives on a nested
  // motion div, not on the direct AnimatePresence child.
  function Harness({ show }: { show: boolean }) {
    return (
      <AnimatePresence>
        {show && (
          <motion.div key="pos" initial={false} animate={{ x: 10, y: 10 }}>
            <motion.div
              data-testid="window"
              initial={false}
              animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
              exit={exitDefinition}
            />
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(<Harness show={true} />);
  });
  await nextFrames(2);

  // Nothing measured while the window is visible.
  expect(measurements).toBe(0);

  // The dock icon moved after mount (dock re-centered); the exit must pick
  // up the position at minimize time, not a stale render-time snapshot.
  offset = { x: 64, y: 512 };

  await act(async () => {
    root!.render(<Harness show={false} />);
  });
  await nextFrames(3);

  // Motion invoked the lazy resolver at exit time, after the icon moved, so
  // the animation targets the icon's current position.
  expect(measurements).toBeGreaterThanOrEqual(1);
  expect(lastMeasured).toEqual({ x: 64, y: 512 });

  // The exiting element stays mounted while the exit animation runs
  // (AnimatePresence waits for it). Animation completion timing is not
  // reliable under happy-dom, so don't wait for the unmount itself.
  expect(
    container.querySelector<HTMLElement>('[data-testid="window"]')
  ).not.toBeNull();
});
