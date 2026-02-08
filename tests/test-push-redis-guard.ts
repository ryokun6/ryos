#!/usr/bin/env bun
/**
 * Tests for shared push Redis guard helper.
 */

import { createPushRedisOrRespond } from "../_api/push/_redis-guard";
import {
  assertEq,
  clearResults,
  createMockVercelResponseHarness,
  printSummary,
  runTest,
  section,
  withPatchedEnv,
} from "./test-utils";

interface MockLogger {
  logger: {
    warn: (message: string, data?: unknown) => void;
    error: (message: string, error?: unknown) => void;
    response: (statusCode: number, duration?: number) => void;
  };
  warnCalls: Array<{ message: string; data?: unknown }>;
  errorCalls: Array<{ message: string; error?: unknown }>;
  responseCalls: Array<{ statusCode: number; duration?: number }>;
}

function createMockLogger(): MockLogger {
  const warnCalls: Array<{ message: string; data?: unknown }> = [];
  const errorCalls: Array<{ message: string; error?: unknown }> = [];
  const responseCalls: Array<{ statusCode: number; duration?: number }> = [];

  return {
    logger: {
      warn: (message: string, data?: unknown) => {
        warnCalls.push({ message, data });
      },
      error: (message: string, error?: unknown) => {
        errorCalls.push({ message, error });
      },
      response: (statusCode: number, duration?: number) => {
        responseCalls.push({ statusCode, duration });
      },
    },
    warnCalls,
    errorCalls,
    responseCalls,
  };
}

async function testRedisGuardRespondsWhenEnvMissing() {
  await Promise.resolve(
    withPatchedEnv(
      {
        REDIS_KV_REST_API_URL: undefined,
        REDIS_KV_REST_API_TOKEN: undefined,
      },
      async () => {
        const mockRes = createMockVercelResponseHarness();
        const mockLogger = createMockLogger();

        const redis = createPushRedisOrRespond(
          mockRes.res,
          mockLogger.logger,
          Date.now()
        );

        assertEq(redis, null);
        assertEq(mockRes.getStatusCode(), 500);
        assertEq(
          JSON.stringify(mockRes.getJsonPayload()),
          JSON.stringify({
            error: "Redis is not configured.",
            missingEnvVars: ["REDIS_KV_REST_API_URL", "REDIS_KV_REST_API_TOKEN"],
          })
        );
        assertEq(mockLogger.warnCalls.length, 1);
        assertEq(mockLogger.warnCalls[0].message, "Redis is not configured");
        assertEq(mockLogger.responseCalls.length, 1);
        assertEq(mockLogger.responseCalls[0].statusCode, 500);
        assertEq(mockLogger.errorCalls.length, 0);
      }
    )
  );
}

async function testRedisGuardTreatsWhitespaceEnvAsMissing() {
  await Promise.resolve(
    withPatchedEnv(
      {
        REDIS_KV_REST_API_URL: "   ",
        REDIS_KV_REST_API_TOKEN: "token",
      },
      async () => {
        const mockRes = createMockVercelResponseHarness();
        const mockLogger = createMockLogger();

        const redis = createPushRedisOrRespond(
          mockRes.res,
          mockLogger.logger,
          Date.now()
        );

        assertEq(redis, null);
        assertEq(mockRes.getStatusCode(), 500);
        assertEq(
          JSON.stringify(mockRes.getJsonPayload()),
          JSON.stringify({
            error: "Redis is not configured.",
            missingEnvVars: ["REDIS_KV_REST_API_URL"],
          })
        );
        assertEq(mockLogger.warnCalls.length, 1);
        assertEq(mockLogger.responseCalls.length, 1);
        assertEq(mockLogger.responseCalls[0].statusCode, 500);
      }
    )
  );
}

async function testRedisGuardReturnsClientWhenEnvConfigured() {
  await Promise.resolve(
    withPatchedEnv(
      {
        REDIS_KV_REST_API_URL: "https://example.upstash.io",
        REDIS_KV_REST_API_TOKEN: "token",
      },
      async () => {
        const mockRes = createMockVercelResponseHarness();
        const mockLogger = createMockLogger();

        const redis = createPushRedisOrRespond(
          mockRes.res,
          mockLogger.logger,
          Date.now()
        );

        assertEq(typeof redis === "object" && redis !== null, true);
        assertEq(mockRes.getStatusCode(), 0);
        assertEq(mockLogger.warnCalls.length, 0);
        assertEq(mockLogger.responseCalls.length, 0);
        assertEq(mockLogger.errorCalls.length, 0);
      }
    )
  );
}

async function testRedisGuardWorksWithoutWarnLogger() {
  await Promise.resolve(
    withPatchedEnv(
      {
        REDIS_KV_REST_API_URL: undefined,
        REDIS_KV_REST_API_TOKEN: undefined,
      },
      async () => {
        const mockRes = createMockVercelResponseHarness();
        let responseCallCount = 0;

        const redis = createPushRedisOrRespond(
          mockRes.res,
          {
            error: () => {
              // Not expected in this flow.
            },
            response: () => {
              responseCallCount += 1;
            },
          },
          Date.now()
        );

        assertEq(redis, null);
        assertEq(responseCallCount, 1);
        assertEq(mockRes.getStatusCode(), 500);
        assertEq(
          JSON.stringify(mockRes.getJsonPayload()),
          JSON.stringify({
            error: "Redis is not configured.",
            missingEnvVars: ["REDIS_KV_REST_API_URL", "REDIS_KV_REST_API_TOKEN"],
          })
        );
      }
    )
  );
}

export async function runPushRedisGuardTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-redis-guard"));
  clearResults();

  await runTest(
    "Push Redis guard responds with 500 when env vars missing",
    testRedisGuardRespondsWhenEnvMissing
  );
  await runTest(
    "Push Redis guard treats whitespace env vars as missing",
    testRedisGuardTreatsWhitespaceEnvAsMissing
  );
  await runTest(
    "Push Redis guard returns client when env vars configured",
    testRedisGuardReturnsClientWhenEnvConfigured
  );
  await runTest(
    "Push Redis guard works when logger.warn is absent",
    testRedisGuardWorksWithoutWarnLogger
  );

  return printSummary();
}

if (import.meta.main) {
  runPushRedisGuardTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
