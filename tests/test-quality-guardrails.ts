#!/usr/bin/env bun
/**
 * Wiring tests for quality guardrail script.
 *
 * Why:
 * Ensures guardrail command remains runnable and keeps checking the expected
 * policy categories as the script evolves.
 */

import { spawnSync } from "node:child_process";
import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assert,
  assertEq,
} from "./test-utils";

export async function runQualityGuardrailTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Quality Guardrail Wiring Tests"));

  console.log(section("Command execution"));
  await runTest("quality:check command exits successfully", async () => {
    const result = spawnSync("bun", ["run", "quality:check"], {
      cwd: process.cwd(),
      encoding: "utf-8",
      stdio: "pipe",
    });

    assertEq(result.status, 0, `Expected exit code 0, got ${result.status}`);
    assert(
      (result.stdout || "").includes("Quality guardrails check"),
      "Expected quality guardrails header in stdout"
    );
  });

  console.log(section("Guardrail categories"));
  await runTest("reports suppression and command safety checks", async () => {
    const result = spawnSync("bun", ["run", "quality:check"], {
      cwd: process.cwd(),
      encoding: "utf-8",
      stdio: "pipe",
    });

    const out = result.stdout || "";
    assert(out.includes("eslint-disable comments"), "Missing eslint-disable guardrail");
    assert(
      out.includes("@ts-ignore/@ts-expect-error"),
      "Missing ts-ignore guardrail"
    );
    assert(out.includes("innerHTML assignments"), "Missing innerHTML guardrail");
    assert(out.includes("execSync usage in scripts"), "Missing execSync guardrail");
    assert(out.includes("shell:true command execution"), "Missing shell:true guardrail");
  });

  await runTest("reports maintainability and HTML allowlist checks", async () => {
    const result = spawnSync("bun", ["run", "quality:check"], {
      cwd: process.cwd(),
      encoding: "utf-8",
      stdio: "pipe",
    });

    const out = result.stdout || "";
    assert(out.includes("large TypeScript files"), "Missing file-size guardrail");
    assert(
      out.includes("dangerouslySetInnerHTML usage"),
      "Missing dangerouslySetInnerHTML allowlist guardrail"
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runQualityGuardrailTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
