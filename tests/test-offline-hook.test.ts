import { afterEach, beforeEach, describe, expect, test } from "bun:test";

/**
 * Regression tests for the useOffline external store (src/hooks/useOffline.ts).
 *
 * Why this exists:
 * The store backs an always-mounted menu-bar indicator plus several apps. It
 * previously had two bugs and a perf wart:
 *   1. Only the FIRST subscriber's callback was bound to the window
 *      online/offline events, so additional subscribers only learned about
 *      connectivity changes via the slow poll.
 *   2. The window listeners were removed with a different callback than the one
 *      registered, leaking the listener forever.
 *   3. A 5s poll ran constantly even while online.
 *
 * These tests drive the exported subscribe/getSnapshot directly (no React) with
 * a faked window + navigator so the behavior is verified deterministically.
 */

import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
} from "../src/hooks/useOffline";

type Handler = () => void;

interface FakeWindow {
  addEventListener: (type: string, cb: Handler) => void;
  removeEventListener: (type: string, cb: Handler) => void;
  __dispatch: (type: string) => void;
  __count: (type: string) => number;
}

const ORIGINAL_WINDOW = (globalThis as { window?: unknown }).window;
const ORIGINAL_NAVIGATOR = globalThis.navigator;
const ORIGINAL_WINDOW_DESCRIPTOR = Object.getOwnPropertyDescriptor(globalThis, "window");
const ORIGINAL_NAVIGATOR_DESCRIPTOR = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const ORIGINAL_SET_INTERVAL = globalThis.setInterval;
const ORIGINAL_CLEAR_INTERVAL = globalThis.clearInterval;

let fakeWindow: FakeWindow;
let navState: { onLine: boolean };
let activeIntervals: number;

function makeFakeWindow(): FakeWindow {
  const handlers = new Map<string, Set<Handler>>();
  return {
    addEventListener: (type, cb) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(cb);
    },
    removeEventListener: (type, cb) => {
      handlers.get(type)?.delete(cb);
    },
    __dispatch: (type) => {
      handlers.get(type)?.forEach((cb) => cb());
    },
    __count: (type) => handlers.get(type)?.size ?? 0,
  };
}

function setGlobalProperty(name: "window" | "navigator", value: unknown): void {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
    writable: true,
  });
}

function restoreGlobalProperty(
  name: "window" | "navigator",
  descriptor: PropertyDescriptor | undefined,
  value: unknown
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  if (value === undefined) {
    delete (globalThis as Record<string, unknown>)[name];
    return;
  }

  setGlobalProperty(name, value);
}

beforeEach(() => {
  fakeWindow = makeFakeWindow();
  navState = { onLine: true };
  activeIntervals = 0;

  setGlobalProperty("window", fakeWindow);
  setGlobalProperty("navigator", navState);

  let nextId = 1;
  const liveIds = new Set<number>();
  globalThis.setInterval = ((fn: () => void) => {
    void fn;
    const id = nextId++;
    liveIds.add(id);
    activeIntervals++;
    return id as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
  globalThis.clearInterval = ((id: number) => {
    if (liveIds.delete(id)) activeIntervals--;
  }) as typeof clearInterval;
});

afterEach(() => {
  restoreGlobalProperty("window", ORIGINAL_WINDOW_DESCRIPTOR, ORIGINAL_WINDOW);
  restoreGlobalProperty("navigator", ORIGINAL_NAVIGATOR_DESCRIPTOR, ORIGINAL_NAVIGATOR);
  globalThis.setInterval = ORIGINAL_SET_INTERVAL;
  globalThis.clearInterval = ORIGINAL_CLEAR_INTERVAL;
});

describe("useOffline store", () => {
  describe("snapshot", () => {
    test("reflects navigator.onLine", () => {
      navState.onLine = true;
      expect(getSnapshot()).toBe(false);
      navState.onLine = false;
      expect(getSnapshot()).toBe(true);
    });

    test("server snapshot assumes online", () => {
      expect(getServerSnapshot()).toBe(false);
    });
  });

  describe("notification fan-out", () => {
    test("notifies ALL subscribers on offline/online events", () => {
      let a = 0;
      let b = 0;
      const unsubA = subscribe(() => a++);
      const unsubB = subscribe(() => b++);

      navState.onLine = false;
      fakeWindow.__dispatch("offline");

      // Both subscribers must be notified by the shared handler, not just the
      // first one (the historical bug only notified subscriber A).
      expect(a).toBe(1);
      expect(b).toBe(1);

      navState.onLine = true;
      fakeWindow.__dispatch("online");
      expect(a).toBe(2);
      expect(b).toBe(2);

      unsubA();
      unsubB();
    });

    test("only binds window listeners once regardless of subscriber count", () => {
      const unsubA = subscribe(() => {});
      const unsubB = subscribe(() => {});
      const unsubC = subscribe(() => {});

      expect(fakeWindow.__count("online")).toBe(1);
      expect(fakeWindow.__count("offline")).toBe(1);

      unsubA();
      unsubB();
      unsubC();
    });
  });

  describe("listener cleanup", () => {
    test("removes window listeners after the last subscriber leaves", () => {
      const unsubA = subscribe(() => {});
      const unsubB = subscribe(() => {});

      expect(fakeWindow.__count("online")).toBe(1);
      expect(fakeWindow.__count("offline")).toBe(1);

      unsubA();
      // Still one subscriber → listeners stay bound.
      expect(fakeWindow.__count("online")).toBe(1);

      unsubB();
      // No subscribers → listeners must actually be removed (no leak).
      expect(fakeWindow.__count("online")).toBe(0);
      expect(fakeWindow.__count("offline")).toBe(0);
    });
  });

  describe("polling lifecycle", () => {
    test("does NOT poll while online", () => {
      navState.onLine = true;
      const unsub = subscribe(() => {});
      expect(activeIntervals).toBe(0);
      unsub();
    });

    test("starts polling when mounting offline, stops on recovery", () => {
      navState.onLine = false;
      const unsub = subscribe(() => {});
      // Mounted while offline → poll active.
      expect(activeIntervals).toBe(1);

      // Recover.
      navState.onLine = true;
      fakeWindow.__dispatch("online");
      expect(activeIntervals).toBe(0);

      unsub();
    });

    test("starts polling on offline event and clears it on unsubscribe", () => {
      navState.onLine = true;
      const unsub = subscribe(() => {});
      expect(activeIntervals).toBe(0);

      navState.onLine = false;
      fakeWindow.__dispatch("offline");
      expect(activeIntervals).toBe(1);

      // Tearing down the last subscriber must also clear the poll.
      unsub();
      expect(activeIntervals).toBe(0);
      expect(fakeWindow.__count("offline")).toBe(0);
    });
  });
});
