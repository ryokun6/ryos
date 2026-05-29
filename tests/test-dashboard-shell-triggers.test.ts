#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import {
  shouldDisableDashboardAccidentalShellTriggers,
  shouldEnableDashboardShellKeyboardTriggers,
} from "../src/utils/dashboardShellGuards";

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

  test("disables on coarse pointer without hover", () => {
    expect(
      shouldDisableDashboardAccidentalShellTriggers({
        isMobile: false,
        isCompactViewport: false,
        hasCoarsePointer: true,
        hasHoverNone: true,
      }),
    ).toBe(true);
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
