#!/usr/bin/env bun
/**
 * Regression guardrails for:
 * 1) IE Wayback loading getting stuck in fetching/loading state
 * 2) Photo Booth strip not refreshing after captures
 *
 * We assert wiring contracts in the relevant hooks so future refactors
 * don't silently re-introduce these regressions.
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

export async function runIePhotoBoothRegressionWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("IE + Photo Booth Regression Wiring Tests"));

  console.log(section("Internet Explorer Wayback loading watchdog"));
  await runTest("defines navigation watchdog ref and cleanup helper", async () => {
    const source = readSource(
      "src/apps/internet-explorer/hooks/useInternetExplorerLogic.ts"
    );

    assert(
      /navigationWatchdogRef\s*=\s*useRef<number\s*\|\s*null>\(null\)/.test(
        source
      ),
      "Expected navigationWatchdogRef declaration"
    );
    assert(
      /const clearNavigationWatchdog = useCallback\(/.test(source),
      "Expected clearNavigationWatchdog callback"
    );
  });

  await runTest("installs timeout watchdog for iframe navigation", async () => {
    const source = readSource(
      "src/apps/internet-explorer/hooks/useInternetExplorerLogic.ts"
    );

    assert(
      /navigationWatchdogRef\.current = window\.setTimeout\(/.test(source),
      "Expected watchdog timeout installation"
    );
    assert(
      /}, 20000\);/.test(source),
      "Expected 20s watchdog timeout"
    );
    assert(
      /type:\s*"timeout_error"/.test(source),
      'Expected timeout watchdog to emit "timeout_error"'
    );
  });

  await runTest("clears watchdog on load/error/stop lifecycle", async () => {
    const source = readSource(
      "src/apps/internet-explorer/hooks/useInternetExplorerLogic.ts"
    );

    assert(
      /const handleIframeLoad[\s\S]*clearNavigationWatchdog\(\);/.test(source),
      "Expected iframe load handler to clear watchdog"
    );
    assert(
      /const handleIframeError[\s\S]*clearNavigationWatchdog\(\);/.test(source),
      "Expected iframe error handler to clear watchdog"
    );
    assert(
      /const handleStop = useCallback\(\(\) => \{[\s\S]*clearNavigationWatchdog\(\);/.test(
        source
      ),
      "Expected manual stop handler to clear watchdog"
    );
  });

  console.log(section("Photo Booth strip refresh dependency wiring"));
  await runTest("subscribes to file metadata changes in useFileSystem", async () => {
    const source = readSource("src/apps/finder/hooks/useFileSystem.ts");

    assert(
      /const fileItems = useFilesStore\(\(state\) => state\.items\);/.test(
        source
      ),
      "Expected useFileSystem to subscribe to fileItems"
    );
    assert(
      /const loadFiles = useCallback\(async \(\) => \{[\s\S]*void fileItems;/.test(
        source
      ),
      "Expected loadFiles callback to track fileItems dependency"
    );
    assert(
      /\}, \[[\s\S]*fileItems[\s\S]*\]\);/.test(source),
      "Expected loadFiles dependency list to include fileItems"
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runIePhotoBoothRegressionWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
