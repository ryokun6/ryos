#!/usr/bin/env bun
/**
 * Tests for generic env helper used by push/APNs config.
 */

import { getMissingRequiredEnvVars } from "../_api/_utils/_env";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

async function testMissingVarsFromEnvObject() {
  const missing = getMissingRequiredEnvVars(
    ["A", "B", "C"],
    {
      A: "value",
      B: "",
      C: "   ",
    } as NodeJS.ProcessEnv
  );
  assertEq(missing.join(","), "B,C");
}

async function testNoMissingVarsFromEnvObject() {
  const missing = getMissingRequiredEnvVars(
    ["REDIS_URL", "REDIS_TOKEN"],
    {
      REDIS_URL: "https://example.upstash.io",
      REDIS_TOKEN: "abc123",
    } as NodeJS.ProcessEnv
  );
  assertEq(missing.length, 0);
}

async function testUndefinedVarsAreMissing() {
  const missing = getMissingRequiredEnvVars(
    ["ONE", "TWO"],
    {
      ONE: "x",
    } as NodeJS.ProcessEnv
  );
  assertEq(missing.join(","), "TWO");
}

export async function runPushEnvTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-env"));
  clearResults();

  await runTest("Env helper reports blank values as missing", testMissingVarsFromEnvObject);
  await runTest("Env helper passes when required vars exist", testNoMissingVarsFromEnvObject);
  await runTest("Env helper reports undefined vars as missing", testUndefinedVarsAreMissing);

  return printSummary();
}

if (import.meta.main) {
  runPushEnvTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
