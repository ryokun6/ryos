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
    assert(!!scripts["quality:verify"], "Missing quality:verify script");
    assert(!!scripts["quality:all"], "Missing quality:all script");
    assert(!!scripts["quality:all:ci"], "Missing quality:all:ci script");
    assert(!!scripts["test:quality-docs"], "Missing test:quality-docs script");
  });

  console.log(section("Quality all composition"));
  await runTest("quality:verify includes all required quality stages", async () => {
    const scripts = readPackageScripts();
    const qualityVerify = scripts["quality:verify"] || "";

    const expectedSegments = [
      "bunx eslint . --max-warnings 0",
      "bun run build",
      "bun run test:songs-utils",
      "bun run test:quality-guardrails",
      "bun run test:quality-workflow",
      "bun run test:quality-scripts",
      "bun run test:quality-summary",
      "bun run test:quality-readme",
      "bun run test:quality-docs",
      "bun run test:chat-wiring",
    ];

    for (const segment of expectedSegments) {
      assert(
        qualityVerify.includes(segment),
        `quality:verify is missing segment: ${segment}`
      );
    }

    assert(
      !qualityVerify.includes("bun run quality:check"),
      "quality:verify should not run guardrails directly (quality:all composes it)"
    );
  });

  await runTest("quality:all composes quality:check + quality:verify", async () => {
    const scripts = readPackageScripts();
    const qualityAll = scripts["quality:all"] || "";
    assert(
      qualityAll.startsWith("bun run quality:check &&"),
      "quality:all must begin with quality:check"
    );
    assert(
      qualityAll.includes("bun run quality:verify"),
      "quality:all must include quality:verify"
    );
  });

  await runTest("quality:all:ci generates report and runs full suite", async () => {
    const scripts = readPackageScripts();
    const qualityAllCi = scripts["quality:all:ci"] || "";

    const expectedSegments = [
      "bun run quality:check:json > quality-report.json",
      "bun run quality:verify",
    ];

    for (const segment of expectedSegments) {
      assert(
        qualityAllCi.includes(segment),
        `quality:all:ci is missing segment: ${segment}`
      );
    }

    assert(
      qualityAllCi.startsWith("bun run quality:check:json > quality-report.json &&"),
      "quality:all:ci must generate quality-report.json before other quality stages"
    );

    assert(
      !qualityAllCi.includes("bun run quality:check &&"),
      "quality:all:ci should not rerun plain quality:check after JSON generation"
    );
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
