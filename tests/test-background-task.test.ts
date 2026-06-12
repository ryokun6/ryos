/**
 * Unit tests for the visibility-gated interval scheduler
 * (src/utils/backgroundTask.ts).
 *
 * The pure scheduling logic is exercised by injecting a fake visibility
 * source (getter + change-event emitter) and using small real delays.
 * Without injected options the helper must degrade to a plain setInterval
 * (bun:test has no `document`), which keeps it SSR/test safe.
 */

import { describe, test, expect } from "bun:test";

import { createVisibilityGatedInterval } from "../src/utils/backgroundTask";

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/** Fake visibility source: a getter plus a manual change-event emitter. */
const createFakeVisibility = (initiallyVisible: boolean) => {
  let visible = initiallyVisible;
  const handlers = new Set<() => void>();
  return {
    getIsVisible: () => visible,
    subscribeVisibilityChange: (handler: () => void) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    setVisible(next: boolean) {
      visible = next;
      handlers.forEach((handler) => handler());
    },
    handlerCount: () => handlers.size,
  };
};

describe("createVisibilityGatedInterval", () => {
  test("runs the callback on the interval cadence while visible", async () => {
    const visibility = createFakeVisibility(true);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 40, visibility);

    await sleep(150);
    dispose();

    expect(calls).toBeGreaterThanOrEqual(2);
  });

  test("does not run while hidden", async () => {
    const visibility = createFakeVisibility(false);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 30, visibility);

    await sleep(120);
    dispose();

    expect(calls).toBe(0);
  });

  test("pauses when the document becomes hidden", async () => {
    const visibility = createFakeVisibility(true);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 40, visibility);

    await sleep(60); // at least one tick
    visibility.setVisible(false);
    const callsWhenHidden = calls;

    await sleep(120);
    dispose();

    expect(callsWhenHidden).toBeGreaterThanOrEqual(1);
    expect(calls).toBe(callsWhenHidden);
  });

  test("runs immediately on becoming visible when the last run is overdue", async () => {
    const visibility = createFakeVisibility(true);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 50, visibility);

    await sleep(70); // first tick fires (~50ms)
    visibility.setVisible(false);
    const callsBeforeHide = calls;
    expect(callsBeforeHide).toBeGreaterThanOrEqual(1);

    await sleep(80); // hidden for longer than the interval
    visibility.setVisible(true);

    // Catch-up run happens synchronously inside the visibility handler.
    expect(calls).toBe(callsBeforeHide + 1);
    dispose();
  });

  test("does not run immediately on becoming visible when the last run is fresh", async () => {
    const visibility = createFakeVisibility(true);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 200, visibility);

    await sleep(20); // well within the interval; no tick yet
    visibility.setVisible(false);
    visibility.setVisible(true);

    expect(calls).toBe(0);
    dispose();
  });

  test("dispose stops the interval and unsubscribes from visibility changes", async () => {
    const visibility = createFakeVisibility(true);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 30, visibility);

    expect(visibility.handlerCount()).toBe(1);
    dispose();
    expect(visibility.handlerCount()).toBe(0);

    await sleep(100);
    expect(calls).toBe(0);

    // Visibility flapping after dispose must not restart anything.
    visibility.setVisible(false);
    visibility.setVisible(true);
    await sleep(80);
    expect(calls).toBe(0);
  });

  test("falls back to a plain interval when document is undefined", async () => {
    // bun:test has no DOM, so the default options exercise the SSR path.
    expect(typeof document).toBe("undefined");

    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 40, {});

    await sleep(150);
    dispose();

    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
