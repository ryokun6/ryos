#!/usr/bin/env bun
/**
 * Tests for generic env helper used by push/APNs config.
 */

import { getMissingRequiredEnvVars } from "../_api/_utils/_env";
import {
  assertEq,
  clearResults,
  createMockPushLoggerHarness,
  createMockVercelResponseHarness,
  printSummary,
  runTest,
  section,
  withPatchedEnv,
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

async function testWithPatchedEnvSupportsAsyncCallback() {
  const key = "PUSH_ENV_TEST_KEY";
  const originalValue = process.env[key];

  await withPatchedEnv({ [key]: "patched-value" }, async () => {
    assertEq(process.env[key], "patched-value");
    await new Promise((resolve) => setTimeout(resolve, 1));
    assertEq(process.env[key], "patched-value");
  });

  assertEq(process.env[key], originalValue);
}

async function testWithPatchedEnvRestoresAfterAsyncError() {
  const key = "PUSH_ENV_TEST_KEY_ERROR";
  const originalValue = process.env[key];
  let errorMessage = "";

  try {
    await withPatchedEnv({ [key]: "patched-value" }, async () => {
      assertEq(process.env[key], "patched-value");
      throw new Error("expected-test-error");
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  assertEq(errorMessage, "expected-test-error");
  assertEq(process.env[key], originalValue);
}

async function testWithPatchedEnvRestoresAfterSyncError() {
  const key = "PUSH_ENV_TEST_KEY_SYNC_ERROR";
  const originalValue = process.env[key];
  let errorMessage = "";

  try {
    withPatchedEnv({ [key]: "patched-value" }, () => {
      assertEq(process.env[key], "patched-value");
      throw new Error("expected-sync-test-error");
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  assertEq(errorMessage, "expected-sync-test-error");
  assertEq(process.env[key], originalValue);
}

async function testWithPatchedEnvSupportsThenableReturn() {
  const key = "PUSH_ENV_TEST_KEY_THENABLE";
  const originalValue = process.env[key];
  let seenInsideThenable = "";

  await withPatchedEnv({ [key]: "patched-value" }, () => ({
    then: (resolve: (value: string) => void) => {
      seenInsideThenable = process.env[key] || "";
      resolve("ok");
    },
  }));

  assertEq(seenInsideThenable, "patched-value");
  assertEq(process.env[key], originalValue);
}

async function testMockVercelResponseHarnessSupportsHeaderChainingAndCaseInsensitiveRead() {
  const mockRes = createMockVercelResponseHarness();
  const chained = (mockRes.res as { setHeader: (name: string, value: unknown) => unknown })
    .setHeader("Vary", "Origin")
    .setHeader("Access-Control-Allow-Origin", "http://localhost:3000");

  assertEq(chained, mockRes.res);
  assertEq(mockRes.getHeader("vary"), "Origin");
  assertEq(mockRes.getHeader("VARY"), "Origin");
  assertEq(mockRes.getHeader("ACCESS-control-allow-origin"), "http://localhost:3000");
}

async function testMockPushLoggerHarnessTracksCallsWhenWarnEnabled() {
  const mockLogger = createMockPushLoggerHarness();
  mockLogger.logger.warn?.("warn-message", { code: 1 });
  mockLogger.logger.error("error-message", new Error("boom"));
  mockLogger.logger.response(401, 12);

  assertEq(mockLogger.warnCalls.length, 1);
  assertEq(mockLogger.warnCalls[0].message, "warn-message");
  assertEq(JSON.stringify(mockLogger.warnCalls[0].data), JSON.stringify({ code: 1 }));
  assertEq(mockLogger.errorCalls.length, 1);
  assertEq(mockLogger.errorCalls[0].message, "error-message");
  assertEq(mockLogger.responseCalls.length, 1);
  assertEq(mockLogger.responseCalls[0].statusCode, 401);
  assertEq(mockLogger.responseCalls[0].duration, 12);
}

async function testMockPushLoggerHarnessCanOmitWarn() {
  const mockLogger = createMockPushLoggerHarness({ includeWarn: false });
  assertEq(typeof mockLogger.logger.warn, "undefined");
  mockLogger.logger.error("error-only");
  mockLogger.logger.response(500);

  assertEq(mockLogger.warnCalls.length, 0);
  assertEq(mockLogger.errorCalls.length, 1);
  assertEq(mockLogger.errorCalls[0].message, "error-only");
  assertEq(mockLogger.responseCalls.length, 1);
  assertEq(mockLogger.responseCalls[0].statusCode, 500);
}

export async function runPushEnvTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-env"));
  clearResults();

  await runTest("Env helper reports blank values as missing", testMissingVarsFromEnvObject);
  await runTest("Env helper passes when required vars exist", testNoMissingVarsFromEnvObject);
  await runTest("Env helper reports undefined vars as missing", testUndefinedVarsAreMissing);
  await runTest(
    "withPatchedEnv keeps values patched through async callback",
    testWithPatchedEnvSupportsAsyncCallback
  );
  await runTest(
    "withPatchedEnv restores values after async callback throws",
    testWithPatchedEnvRestoresAfterAsyncError
  );
  await runTest(
    "withPatchedEnv restores values after sync callback throws",
    testWithPatchedEnvRestoresAfterSyncError
  );
  await runTest(
    "withPatchedEnv supports thenable callback return values",
    testWithPatchedEnvSupportsThenableReturn
  );
  await runTest(
    "mock vercel response harness supports chaining and case-insensitive headers",
    testMockVercelResponseHarnessSupportsHeaderChainingAndCaseInsensitiveRead
  );
  await runTest(
    "mock push logger harness tracks calls when warn is enabled",
    testMockPushLoggerHarnessTracksCallsWhenWarnEnabled
  );
  await runTest(
    "mock push logger harness supports warn-less logger shape",
    testMockPushLoggerHarnessCanOmitWarn
  );

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
