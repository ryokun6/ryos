#!/usr/bin/env bun
/**
 * Wiring tests for README quality command documentation.
 *
 * Why:
 * Ensures contributor-facing docs stay aligned with executable quality scripts.
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

const readReadme = (): string =>
  readFileSync(resolve(process.cwd(), "README.md"), "utf-8");

const readPackageScripts = (): Record<string, string> => {
  const raw = readFileSync(resolve(process.cwd(), "package.json"), "utf-8");
  const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
  return parsed.scripts || {};
};

export async function runQualityReadmeWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Quality README Wiring Tests"));

  console.log(section("Quality command documentation"));
  await runTest("README documents key quality commands", async () => {
    const readme = readReadme();
    const requiredCommands = [
      "bun run quality:check",
      "bun run quality:check:json",
      "bun run quality:verify",
      "bun run quality:all",
      "bun run quality:all:ci",
      "bun run quality:summary",
    ];

    for (const command of requiredCommands) {
      assert(
        readme.includes(command),
        `README missing quality command documentation: ${command}`
      );
    }
  });

  await runTest("README quality commands exist in package scripts", async () => {
    const readme = readReadme();
    const scripts = readPackageScripts();
    const documentedScriptCommands = [
      "quality:check",
      "quality:check:json",
      "quality:verify",
      "quality:all",
      "quality:all:ci",
      "quality:summary",
    ];

    for (const scriptName of documentedScriptCommands) {
      assert(
        readme.includes(`bun run ${scriptName}`),
        `README does not document ${scriptName}`
      );
      assert(
        typeof scripts[scriptName] === "string" && scripts[scriptName].length > 0,
        `package.json missing script ${scriptName}`
      );
    }
  });

  await runTest("README documents quality wiring test commands", async () => {
    const readme = readReadme();
    const scripts = readPackageScripts();
    const requiredWiringTests = [
      "test:quality-guardrails",
      "test:quality-workflow",
      "test:quality-scripts",
      "test:quality-summary",
      "test:quality-readme",
      "test:quality-docs",
    ];

    for (const scriptName of requiredWiringTests) {
      assert(
        readme.includes(`bun run ${scriptName}`),
        `README does not document ${scriptName}`
      );
      assert(
        typeof scripts[scriptName] === "string" && scripts[scriptName].length > 0,
        `package.json missing script ${scriptName}`
      );
    }
  });

  return printSummary();
}

if (import.meta.main) {
  runQualityReadmeWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
