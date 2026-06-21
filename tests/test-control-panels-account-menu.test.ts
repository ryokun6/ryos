#!/usr/bin/env bun
/**
 * Wiring tests for Control Panels account actions.
 *
 * The unified System Preferences layout replaced the legacy AccountActionsMenu
 * dropdown (and its SystemTabContent host) with inline rows in the Security
 * pane, so these tests assert the live wiring and guard against the removed
 * legacy component returning.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const CP_DIR = "src/apps/control-panels/components/control-panels-app";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("Control Panels account actions", () => {
  test("Security pane exposes password and logout actions inline", () => {
    const securitySource = readSource(`${CP_DIR}/SecurityPaneContent.tsx`);
    expect(securitySource.includes('t("apps.control-panels.setPassword")')).toBe(
      true,
    );
    expect(
      securitySource.includes('t("apps.control-panels.changePasswordButton")'),
    ).toBe(true);
    expect(securitySource.includes('t("apps.control-panels.logOut")')).toBe(true);
    expect(
      securitySource.includes('t("apps.control-panels.logOutOfAllDevices")'),
    ).toBe(true);
    expect(securitySource.includes("setIsPasswordDialogOpen")).toBe(true);
    expect(securitySource.includes("handleLogoutAllDevices")).toBe(true);
  });

  test("legacy AccountActionsMenu dropdown and SystemTabContent are removed", () => {
    expect(existsSync(resolve(process.cwd(), `${CP_DIR}/AccountActionsMenu.tsx`))).toBe(
      false,
    );
    expect(existsSync(resolve(process.cwd(), `${CP_DIR}/SystemTabContent.tsx`))).toBe(
      false,
    );
  });
});
