#!/usr/bin/env bun
/**
 * Wiring tests for Control Panels account/security actions.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("Control Panels account and security actions", () => {
  test("Security pane owns password, logout, logout-all, and delete account actions", () => {
    const securitySource = readSource(
      "src/apps/control-panels/components/control-panels-app/SecurityPaneContent.tsx",
    );

    expect(securitySource.includes("DeleteAccountDialog")).toBe(true);
    expect(securitySource.includes('t("apps.control-panels.setPassword")')).toBe(true);
    expect(securitySource.includes('t("apps.control-panels.changePasswordButton")')).toBe(
      true,
    );
    expect(securitySource.includes('t("apps.control-panels.logOut")')).toBe(true);
    expect(securitySource.includes('t("apps.control-panels.logOutOfAllDevices")')).toBe(
      true,
    );
    expect(securitySource.includes('t("apps.control-panels.logOutAll")')).toBe(true);
  });

  test("legacy account action dropdown is not wired into live Control Panels", () => {
    const accountsSource = readSource(
      "src/apps/control-panels/components/control-panels-app/AccountsPaneContent.tsx",
    );
    const rendererSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsMacPaneRenderer.tsx",
    );

    expect(accountsSource.includes("AccountActionsMenu")).toBe(false);
    expect(rendererSource.includes("AccountActionsMenu")).toBe(false);
  });
});
