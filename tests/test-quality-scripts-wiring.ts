#!/usr/bin/env bun
/**
 * Wiring tests for package.json quality scripts.
 *
 * Why:
 * Ensures quality script commands stay aligned with intended policy and test
 * coverage as scripts evolve.
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

interface PackageJson {
  scripts?: Record<string, string>;
}

const readPackageScripts = (): Record<string, string> => {
  const raw = readFileSync(resolve(process.cwd(), "package.json"), "utf-8");
  const pkg = JSON.parse(raw) as PackageJson;
  return pkg.scripts || {};
};

export async function runQualityScriptsWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Quality Scripts Wiring Tests"));

  console.log(section("Required script presence"));
  await runTest("defines quality script commands", async () => {
    const scripts = readPackageScripts();
    assert(!!scripts["quality:check"], "Missing quality:check script");
    assert(!!scripts["quality:check:json"], "Missing quality:check:json script");
    assert(!!scripts["quality:summary"], "Missing quality:summary script");
    assert(!!scripts["quality:all"], "Missing quality:all script");
  });

  console.log(section("Quality all composition"));
  await runTest("quality:all includes all required quality stages", async () => {
    const scripts = readPackageScripts();
    const qualityAll = scripts["quality:all"] || "";

    const expectedSegments = [
      "bun run quality:check",
      "bunx eslint . --max-warnings 0",
      "bun run build",
      "bun run test:songs-utils",
      "bun run test:quality-guardrails",
      "bun run test:quality-workflow",
      "bun run test:chat-wiring",
    ];

    for (const segment of expectedSegments) {
      assert(
        qualityAll.includes(segment),
        `quality:all is missing segment: ${segment}`
      );
    }
  });

  await runTest("quality:check:json uses guardrail json mode", async () => {
    const scripts = readPackageScripts();
    const command = scripts["quality:check:json"] || "";
    assert(
      command.includes("scripts/check-quality-guardrails.ts --json"),
      "quality:check:json must call guardrail script with --json"
    );
  });

  await runTest("quality:summary points to summary renderer", async () => {
    const scripts = readPackageScripts();
    const command = scripts["quality:summary"] || "";
    assert(
      command.includes("scripts/quality-report-summary.ts"),
      "quality:summary must call quality-report-summary.ts"
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runQualityScriptsWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
