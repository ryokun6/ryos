#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import { shouldEnableDashboardShellKeyboardTriggers } from "../src/hooks/useDashboardShellTriggers";

describe("dashboard shell triggers", () => {
  test("F4 keyboard shortcut is disabled on mobile", () => {
    expect(shouldEnableDashboardShellKeyboardTriggers(true)).toBe(false);
  });

  test("F4 keyboard shortcut is enabled on desktop", () => {
    expect(shouldEnableDashboardShellKeyboardTriggers(false)).toBe(true);
  });
});
