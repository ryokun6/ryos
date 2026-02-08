#!/usr/bin/env bun
/**
 * Tests for push Redis env helper utilities.
 */

import { createPushRedis, getMissingPushRedisEnvVars } from "../_api/push/_redis";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
  withPatchedEnv,
} from "./test-utils";

async function testMissingRedisEnvVars() {
  withPatchedEnv(
    {
      REDIS_KV_REST_API_URL: undefined,
      REDIS_KV_REST_API_TOKEN: undefined,
    },
    () => {
      const missing = getMissingPushRedisEnvVars();
      assertEq(missing.includes("REDIS_KV_REST_API_URL"), true);
      assertEq(missing.includes("REDIS_KV_REST_API_TOKEN"), true);
    }
  );
}

async function testWhitespaceRedisEnvVarsTreatedMissing() {
  withPatchedEnv(
    {
      REDIS_KV_REST_API_URL: "   ",
      REDIS_KV_REST_API_TOKEN: "\n",
    },
    () => {
      const missing = getMissingPushRedisEnvVars();
      assertEq(missing.includes("REDIS_KV_REST_API_URL"), true);
      assertEq(missing.includes("REDIS_KV_REST_API_TOKEN"), true);
    }
  );
}

async function testNoMissingRedisEnvVars() {
  withPatchedEnv(
    {
      REDIS_KV_REST_API_URL: "https://example.upstash.io",
      REDIS_KV_REST_API_TOKEN: "token-value",
    },
    () => {
      const missing = getMissingPushRedisEnvVars();
      assertEq(missing.length, 0);
    }
  );
}

async function testMissingRedisEnvVarsFromExplicitEnvObject() {
  const missing = getMissingPushRedisEnvVars({
    REDIS_KV_REST_API_URL: "https://example.upstash.io",
  } as NodeJS.ProcessEnv);
  assertEq(missing.join(","), "REDIS_KV_REST_API_TOKEN");
}

async function testCreatePushRedisThrowsWithoutEnv() {
  withPatchedEnv(
    {
      REDIS_KV_REST_API_URL: undefined,
      REDIS_KV_REST_API_TOKEN: undefined,
    },
    () => {
      let errorMessage = "";
      try {
        createPushRedis();
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      assertEq(
        errorMessage.includes("Missing Redis env vars"),
        true,
        `Expected missing-env error, got "${errorMessage}"`
      );
    }
  );
}

async function testCreatePushRedisThrowsOnWhitespaceEnv() {
  withPatchedEnv(
    {
      REDIS_KV_REST_API_URL: "   ",
      REDIS_KV_REST_API_TOKEN: "token-value",
    },
    () => {
      let errorMessage = "";
      try {
        createPushRedis();
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      assertEq(
        errorMessage.includes("REDIS_KV_REST_API_URL"),
        true,
        `Expected URL missing in error message, got "${errorMessage}"`
      );
    }
  );
}

async function testCreatePushRedisSucceedsWithEnv() {
  withPatchedEnv(
    {
      REDIS_KV_REST_API_URL: "https://example.upstash.io",
      REDIS_KV_REST_API_TOKEN: "token-value",
    },
    () => {
      const redis = createPushRedis();
      assertEq(typeof redis === "object", true);
      assertEq(typeof (redis as { get: unknown }).get === "function", true);
    }
  );
}

export async function runPushRedisTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-redis"));
  clearResults();

  await runTest("Push redis helper detects missing env vars", testMissingRedisEnvVars);
  await runTest(
    "Push redis helper treats whitespace as missing",
    testWhitespaceRedisEnvVarsTreatedMissing
  );
  await runTest("Push redis helper passes when env vars exist", testNoMissingRedisEnvVars);
  await runTest(
    "Push redis helper supports explicit env object input",
    testMissingRedisEnvVarsFromExplicitEnvObject
  );
  await runTest(
    "Push redis factory throws when env vars missing",
    testCreatePushRedisThrowsWithoutEnv
  );
  await runTest(
    "Push redis factory rejects whitespace env values",
    testCreatePushRedisThrowsOnWhitespaceEnv
  );
  await runTest(
    "Push redis factory builds client when env vars set",
    testCreatePushRedisSucceedsWithEnv
  );

  return printSummary();
}

if (import.meta.main) {
  runPushRedisTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
