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
      const source = readSource("src/apps/base/AppManager.tsx");
      expect(source.includes("<AppErrorBoundary")).toBe(true);
      expect(/<AppErrorBoundary[\s\S]*<AppComponent/.test(source)).toBe(true);
    });

    test("relaunches crashed instances via close-and-launch flow", async () => {
      const source = readSource("src/apps/base/AppManager.tsx");
      expect(source.includes("closeAppInstance(instance.instanceId);")).toBe(true);
      expect(
        /launchApp\(\s*appId,\s*(?:instance\.initialData|relaunchInitialData),\s*instance\.title,\s*supportsMultiWindowApp\(appId\)/.test(
          source,
        )
      ).toBe(true);
    });
  });

  describe("Desktop shell fallback", () => {
    test("wraps AppManager in DesktopErrorBoundary", async () => {
      const source = readSource("src/App.tsx");
      expect(source.includes("<DesktopErrorBoundary>")).toBe(true);
      expect(
        /<DesktopErrorBoundary>\s*<AppManager apps=\{APPS\} \/>\s*<\/DesktopErrorBoundary>/.test(
          source,
        )
      ).toBe(true);
    });
  });

  describe("Boundary implementation + reporting", () => {
    test("implements catch/reporting flow in ErrorBoundaries", async () => {
      const source = readSource("src/components/errors/ErrorBoundaries.tsx");
      expect(source.includes("componentDidCatch")).toBe(true);
      expect(source.includes("reportRuntimeCrash")).toBe(true);
      expect(source.includes("RYOS_ERROR_BOUNDARY_TEST_EVENT")).toBe(true);
    });

    test("supports optional external error reporter registration", async () => {
      const source = readSource("src/utils/errorReporting.ts");
      expect(source.includes("setRuntimeErrorReporter")).toBe(true);
      expect(source.includes("__RYOS_ERROR_REPORTER__")).toBe(true);
      expect(source.includes("window.reportError")).toBe(true);
      expect(source.includes("triggerRuntimeCrashTest")).toBe(true);
      expect(source.includes("RYOS_ERROR_BOUNDARY_TEST_EVENT")).toBe(true);
    });
  });

  describe("Control Panels debug wiring", () => {
    test("renders debug-only error boundary controls in Control Panels", async () => {
      const source = readSource(
        "src/apps/control-panels/components/ControlPanelsAppComponent.tsx",
      );
      expect(source.includes('t("apps.control-panels.errorBoundaries")')).toBe(true);
      expect(source.includes("handleTriggerAppCrashTest")).toBe(true);
      expect(source.includes("handleTriggerDesktopCrashTest")).toBe(true);
    });

    test("dispatches shared crash events from Control Panels logic", async () => {
      const source = readSource(
        "src/apps/control-panels/hooks/useControlPanelsLogic.ts",
      );
      expect(source.includes("triggerRuntimeCrashTest")).toBe(true);
      expect(/scope:\s*"app"[\s\S]*appId:\s*"control-panels"/.test(source)).toBe(true);
      expect(/scope:\s*"desktop"/.test(source)).toBe(true);
    });
  });
});
