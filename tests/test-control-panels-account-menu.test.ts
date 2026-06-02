#!/usr/bin/env bun
/**
 * Wiring tests for Control Panels account actions menu.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("Control Panels account actions menu", () => {
  test("System tab uses AccountActionsMenu instead of separate account buttons", () => {
    const systemTabSource = readSource(
      "src/apps/control-panels/components/control-panels-app/SystemTabContent.tsx",
    );
    expect(systemTabSource.includes("<AccountActionsMenu")).toBe(true);
    expect(systemTabSource.includes('t("apps.control-panels.changePassword")')).toBe(
      false,
    );
    expect(systemTabSource.includes('t("apps.control-panels.logOut")')).toBe(false);
  });

  test("AccountActionsMenu exposes password, logout, and debug actions via dropdown", () => {
    const menuSource = readSource(
      "src/apps/control-panels/components/control-panels-app/AccountActionsMenu.tsx",
    );
    expect(menuSource.includes("DropdownMenu")).toBe(true);
    expect(menuSource.includes('t("apps.control-panels.setPassword")')).toBe(true);
    expect(menuSource.includes('t("apps.control-panels.changePassword")')).toBe(true);
    expect(menuSource.includes('t("apps.control-panels.logOut")')).toBe(true);
    expect(menuSource.includes('t("apps.control-panels.logOutOfAllDevices")')).toBe(
      true,
    );
    expect(menuSource.includes("open={open}")).toBe(true);
    expect(menuSource.includes("onOpenChange={setOpen}")).toBe(true);
  });
});
