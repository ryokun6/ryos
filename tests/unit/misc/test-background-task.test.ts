/**
 * Unit tests for the visibility-gated interval scheduler
 * (src/utils/backgroundTask.ts).
 *
 * The pure scheduling logic is exercised by injecting a fake visibility
 * source (getter + change-event emitter) and Bun's fake timers, so we can
 * advance time by exact amounts and assert exact tick counts instead of
 * sleeping past the interval and using `>=` fuzz. Without injected options the
 * helper must degrade to a plain setInterval (bun:test has no `document`),
 * which keeps it SSR/test safe.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from "bun:test";

import { createVisibilityGatedInterval } from "../../../src/utils/backgroundTask";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

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
  test("runs the callback on the interval cadence while visible", () => {
    const visibility = createFakeVisibility(true);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 40, visibility);

    // Ticks fire at 40/80/120ms.
    jest.advanceTimersByTime(150);
    dispose();

    expect(calls).toBe(3);
  });

  test("does not run while hidden", () => {
    const visibility = createFakeVisibility(false);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 30, visibility);

    jest.advanceTimersByTime(120);
    dispose();

    expect(calls).toBe(0);
  });

  test("pauses when the document becomes hidden", () => {
    const visibility = createFakeVisibility(true);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 40, visibility);

    jest.advanceTimersByTime(60); // one tick at 40ms
    visibility.setVisible(false);
    const callsWhenHidden = calls;

    jest.advanceTimersByTime(120);
    dispose();

    expect(callsWhenHidden).toBe(1);
    expect(calls).toBe(callsWhenHidden);
  });

  test("runs immediately on becoming visible when the last run is overdue", () => {
    const visibility = createFakeVisibility(true);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 50, visibility);

    jest.advanceTimersByTime(70); // first tick fires at 50ms
    visibility.setVisible(false);
    const callsBeforeHide = calls;
    expect(callsBeforeHide).toBe(1);

    jest.advanceTimersByTime(80); // hidden for longer than the interval
    visibility.setVisible(true);

    // Catch-up run happens synchronously inside the visibility handler.
    expect(calls).toBe(callsBeforeHide + 1);
    dispose();
  });

  test("does not run immediately on becoming visible when the last run is fresh", () => {
    const visibility = createFakeVisibility(true);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 200, visibility);

    jest.advanceTimersByTime(20); // well within the interval; no tick yet
    visibility.setVisible(false);
    visibility.setVisible(true);

    expect(calls).toBe(0);
    dispose();
  });

  test("dispose stops the interval and unsubscribes from visibility changes", () => {
    const visibility = createFakeVisibility(true);
    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 30, visibility);

    expect(visibility.handlerCount()).toBe(1);
    dispose();
    expect(visibility.handlerCount()).toBe(0);

    jest.advanceTimersByTime(100);
    expect(calls).toBe(0);

    // Visibility flapping after dispose must not restart anything.
    visibility.setVisible(false);
    visibility.setVisible(true);
    jest.advanceTimersByTime(80);
    expect(calls).toBe(0);
  });

  test("falls back to a plain interval when document is undefined", () => {
    // bun:test has no DOM, so the default options exercise the SSR path.
    expect(typeof document).toBe("undefined");

    let calls = 0;
    const dispose = createVisibilityGatedInterval(() => calls++, 40, {});

    // Ticks fire at 40/80/120ms.
    jest.advanceTimersByTime(150);
    dispose();

    expect(calls).toBe(3);
  });
});
