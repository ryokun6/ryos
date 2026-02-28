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
import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assert,
} from "./test-utils";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

export async function runErrorBoundaryWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Error Boundary Wiring Tests"));

  console.log(section("App manager isolation"));
  await runTest("wraps app instances in AppErrorBoundary", async () => {
    const source = readSource("src/apps/base/AppManager.tsx");
    assert(
      source.includes("<AppErrorBoundary"),
      "Expected AppManager to wrap app instances with AppErrorBoundary",
    );
    assert(
      /<AppErrorBoundary[\s\S]*<AppComponent/.test(source),
      "Expected AppComponent render tree to be nested inside AppErrorBoundary",
    );
  });

  await runTest("relaunches crashed instances via close-and-launch flow", async () => {
    const source = readSource("src/apps/base/AppManager.tsx");
    assert(
      source.includes("closeAppInstance(instance.instanceId);"),
      "Expected crashed instance to be closed before relaunch",
    );
    assert(
      /launchApp\(\s*appId,\s*instance\.initialData,\s*instance\.title,\s*supportsMultiWindowApp\(appId\)/.test(
        source,
      ),
      "Expected relaunch to preserve initialData/title and respect multi-window rules",
    );
  });

  console.log(section("Desktop shell fallback"));
  await runTest("wraps AppManager in DesktopErrorBoundary", async () => {
    const source = readSource("src/App.tsx");
    assert(
      source.includes("<DesktopErrorBoundary>"),
      "Expected App.tsx to wrap the desktop manager in DesktopErrorBoundary",
    );
    assert(
      /<DesktopErrorBoundary>\s*<AppManager apps=\{apps\} \/>\s*<\/DesktopErrorBoundary>/.test(
        source,
      ),
      "Expected DesktopErrorBoundary to directly wrap AppManager",
    );
  });

  console.log(section("Boundary implementation + reporting"));
  await runTest("implements catch/reporting flow in ErrorBoundaries", async () => {
    const source = readSource("src/components/errors/ErrorBoundaries.tsx");
    assert(
      source.includes("componentDidCatch"),
      "Expected class error boundary implementation",
    );
    assert(
      source.includes("reportRuntimeCrash"),
      "Expected boundary crashes to be forwarded to runtime reporting",
    );
    assert(
      source.includes("ryos:error-boundary-test"),
      "Expected development-only crash test hook to remain available",
    );
  });

  await runTest("supports optional external error reporter registration", async () => {
    const source = readSource("src/utils/errorReporting.ts");
    assert(
      source.includes("setRuntimeErrorReporter"),
      "Expected runtime reporter registration helper",
    );
    assert(
      source.includes("__RYOS_ERROR_REPORTER__"),
      "Expected global optional error reporter hook",
    );
    assert(
      source.includes("window.reportError"),
      "Expected browser-level reportError fallback",
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runErrorBoundaryWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
