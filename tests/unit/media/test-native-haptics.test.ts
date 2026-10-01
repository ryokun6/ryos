/**
 * Native shell haptic bridge (`window.ryosDesktop.playHaptic`): null-safe
 * helper and rate limiting.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { ensureTestLocalStorage } from "../../setup";

const g = globalThis as Record<string, unknown> & typeof globalThis;
let registeredDomForSuite = false;
if (typeof document === "undefined") {
  GlobalRegistrator.register();
  registeredDomForSuite = true;
}
ensureTestLocalStorage();

const {
  HAPTIC_MIN_INTERVAL_MS,
  hasNativeHaptics,
  playHaptic,
  resetNativeHapticRateLimitForTests,
} = await import("../../../src/utils/nativeShellBridge");

let calls: unknown[][] = [];

function setBridge(bridge: Record<string, unknown> | undefined) {
  const win = g.window as unknown as Record<string, unknown>;
  if (bridge) win.ryosDesktop = bridge;
  else delete win.ryosDesktop;
}

afterAll(() => {
  setBridge(undefined);
  if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
  ensureTestLocalStorage();
});

describe("playHaptic", () => {
  beforeEach(() => {
    calls = [];
    resetNativeHapticRateLimitForTests();
    setBridge({
      platform: "ios",
      playHaptic: (...args: unknown[]) => {
        calls.push(args);
      },
    });
  });
  afterEach(() => setBridge(undefined));

  test("no-ops safely without a bridge or without the method", () => {
    setBridge(undefined);
    expect(hasNativeHaptics()).toBe(false);
    expect(playHaptic("light")).toBe(false);

    setBridge({ platform: "ios" });
    expect(hasNativeHaptics()).toBe(false);
    expect(playHaptic("light")).toBe(false);
    expect(calls).toEqual([]);
  });

  test("swallows bridge exceptions and rejected promises", () => {
    setBridge({
      playHaptic: () => {
        throw new Error("boom");
      },
    });
    expect(playHaptic("light", 0)).toBe(false);

    setBridge({ playHaptic: () => Promise.reject(new Error("boom")) });
    expect(playHaptic("light", 1000)).toBe(true);
  });

  test("forwards selection ticks for the iPod click wheel", () => {
    expect(playHaptic("selection", 0)).toBe(true);
    expect(calls).toEqual([["selection"]]);
  });

  test("rate-limits haptics to one per interval", () => {
    expect(playHaptic("soft", 1000)).toBe(true);
    expect(playHaptic("light", 1000 + HAPTIC_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(playHaptic("medium", 1000 + HAPTIC_MIN_INTERVAL_MS)).toBe(true);
    expect(calls).toEqual([["soft"], ["medium"]]);
  });
});
