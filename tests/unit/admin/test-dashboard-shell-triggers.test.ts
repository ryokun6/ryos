#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import {
  collectDashboardShellGuardSignals,
  shouldDisableDashboardAccidentalShellTriggers,
  shouldEnableDashboardShellKeyboardTriggers,
  shouldUseDockSwipeReveal,
} from "../../../src/utils/dashboardShellGuards";

describe("dashboard shell guards", () => {
  test("F4 keyboard shortcut is disabled when mobile layout", () => {
    expect(
      shouldEnableDashboardShellKeyboardTriggers(
        shouldDisableDashboardAccidentalShellTriggers({
          isMobile: true,
          isCompactViewport: false,
          hasCoarsePointer: false,
          hasHoverNone: false,
        }),
      ),
    ).toBe(false);
  });

  test("F4 keyboard shortcut is enabled on desktop pointer", () => {
    expect(
      shouldEnableDashboardShellKeyboardTriggers(
        shouldDisableDashboardAccidentalShellTriggers({
          isMobile: false,
          isCompactViewport: false,
          hasCoarsePointer: false,
          hasHoverNone: false,
        }),
      ),
    ).toBe(true);
  });

  test("disables on coarse pointer alone (typical Android)", () => {
    expect(
      shouldDisableDashboardAccidentalShellTriggers({
        isMobile: false,
        isCompactViewport: false,
        hasCoarsePointer: true,
        hasHoverNone: false,
      }),
    ).toBe(true);
  });

  test("collectDashboardShellGuardSignals marks touch + narrow as mobile", () => {
    const original = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        innerWidth: 400,
        innerHeight: 800,
        matchMedia: (query: string) => ({
          matches:
            query === "(pointer: coarse)" || query === "(hover: none)",
        }),
        ontouchstart: true,
      },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { maxTouchPoints: 5 },
    });

    const signals = collectDashboardShellGuardSignals();
    expect(signals.isMobile).toBe(true);
    expect(shouldDisableDashboardAccidentalShellTriggers(signals)).toBe(true);

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: original,
    });
  });

  test("dock swipe reveal tracks accidental-shell guard", () => {
    expect(
      shouldUseDockSwipeReveal({
        isMobile: false,
        isCompactViewport: false,
        hasCoarsePointer: true,
        hasHoverNone: false,
      }),
    ).toBe(true);
    expect(
      shouldUseDockSwipeReveal({
        isMobile: false,
        isCompactViewport: false,
        hasCoarsePointer: false,
        hasHoverNone: false,
      }),
    ).toBe(false);
  });

  test("disables on compact viewport without mobile flag", () => {
    expect(
      shouldDisableDashboardAccidentalShellTriggers({
        isMobile: false,
        isCompactViewport: true,
        hasCoarsePointer: false,
        hasHoverNone: false,
      }),
    ).toBe(true);
  });
});
