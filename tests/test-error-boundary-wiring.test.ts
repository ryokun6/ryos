#!/usr/bin/env bun
/**
 * Guardrail tests for desktop/app error boundary wiring.
 *
 * Why:
 * These protections are easy to regress during refactors because they live at
 * the composition layer instead of inside individual apps. This suite ensures
 * the shell stays wrapped, app instances stay isolated, and optional reporting
 * hooks remain available.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("Error Boundary Wiring Tests", () => {
  describe("App manager isolation", () => {
    test("wraps app instances in AppErrorBoundary", async () => {
      const source = readSource(
        "src/apps/base/app-manager/AppManagerView.tsx",
      );
      expect(source).toContain("<AppErrorBoundary");
      expect(source).toMatch(/<AppErrorBoundary[\s\S]*<AppComponent/);
    });

    test("relaunches crashed instances via close-and-launch flow", async () => {
      const source = readSource(
        "src/apps/base/app-manager/AppManagerView.tsx",
      );
      expect(source).toContain("closeAppInstance(instance.instanceId);");
      expect(source).toMatch(
        /launchApp\(\s*appId,\s*(?:instance\.initialData|relaunchInitialData),\s*instance\.title,\s*supportsMultiWindowApp\(appId\)/,
      );
    });
  });

  describe("Desktop shell fallback", () => {
    test("wraps AppManager in DesktopErrorBoundary", async () => {
      const source = readSource("src/App.tsx");
      expect(source).toContain("<DesktopErrorBoundary>");
      expect(source).toMatch(
        /<DesktopErrorBoundary>\s*<AppManager apps=\{apps\} \/>\s*<\/DesktopErrorBoundary>/,
      );
    });
  });

  describe("Boundary implementation + reporting", () => {
    test("implements catch/reporting flow in ErrorBoundaries", async () => {
      const source = readSource("src/components/errors/ErrorBoundaries.tsx");
      expect(source).toContain("componentDidCatch");
      expect(source).toContain("reportRuntimeCrash");
      expect(source).toContain("RYOS_ERROR_BOUNDARY_TEST_EVENT");
    });

    test("supports optional external error reporter registration", async () => {
      const source = readSource("src/utils/errorReporting.ts");
      expect(source).toContain("setRuntimeErrorReporter");
      expect(source).toContain("__RYOS_ERROR_REPORTER__");
      expect(source).toContain("window.reportError");
      expect(source).toContain("triggerRuntimeCrashTest");
      expect(source).toContain("RYOS_ERROR_BOUNDARY_TEST_EVENT");
    });
  });

  describe("Control Panels debug wiring", () => {
    test("renders debug-only error boundary controls in Control Panels", async () => {
      const shellSource = readSource(
        "src/apps/control-panels/components/control-panels-app/ControlPanelsAppComponent.tsx",
      );
      const accountsPaneSource = readSource(
        "src/apps/control-panels/components/control-panels-app/AccountsPaneContent.tsx",
      );
      expect(accountsPaneSource).toContain('hidden={accountsTab !== "debug"}');
      expect(accountsPaneSource).toContain('t("apps.control-panels.crashApp")');
      expect(accountsPaneSource).toContain('t("apps.control-panels.crashDesktop")');
      expect(shellSource).toContain("handleTriggerAppCrashTest");
      expect(shellSource).toContain("handleTriggerDesktopCrashTest");
    });

    test("dispatches shared crash events from Control Panels logic", async () => {
      const source = readSource(
        "src/apps/control-panels/hooks/useControlPanelsLogic.ts",
      );
      expect(source).toContain("triggerRuntimeCrashTest");
      expect(source).toMatch(/scope:\s*"app"[\s\S]*appId:\s*"control-panels"/);
      expect(source).toMatch(/scope:\s*"desktop"/);
    });
  });
});
