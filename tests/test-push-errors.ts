#!/usr/bin/env bun
/**
 * Tests for push endpoint error response helper.
 */

import type { VercelResponse } from "@vercel/node";
import {
  respondInternalServerError,
  respondMissingEnvConfig,
} from "../_api/push/_errors";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

async function testRespondInternalServerError() {
  const loggedErrors: Array<{ message: string; error: unknown }> = [];
  const loggedResponses: Array<{ statusCode: number; duration?: number }> = [];
  let statusCode = 0;
  let responsePayload: unknown = null;

  const logger = {
    error: (message: string, error?: unknown) => {
      loggedErrors.push({ message, error });
    },
    response: (code: number, duration?: number) => {
      loggedResponses.push({ statusCode: code, duration });
    },
  };

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      responsePayload = payload;
      return payload;
    },
  };

  const result = respondInternalServerError(
    res as unknown as VercelResponse,
    logger,
    Date.now() - 25,
    "Unexpected test error",
    new Error("boom")
  );

  assertEq(statusCode, 500);
  assertEq(
    JSON.stringify(responsePayload),
    JSON.stringify({ error: "Internal server error" })
  );
  assertEq(loggedErrors.length, 1);
  assertEq(loggedErrors[0].message, "Unexpected test error");
  assertEq(loggedResponses.length, 1);
  assertEq(loggedResponses[0].statusCode, 500);
  assertEq(typeof loggedResponses[0].duration === "number", true);
  assertEq(
    JSON.stringify(result),
    JSON.stringify({ error: "Internal server error" })
  );
}

async function testRespondMissingEnvConfig() {
  const loggedWarnings: Array<{ message: string; data: unknown }> = [];
  const loggedResponses: Array<{ statusCode: number; duration?: number }> = [];
  let statusCode = 0;
  let responsePayload: unknown = null;

  const logger = {
    warn: (message: string, data?: unknown) => {
      loggedWarnings.push({ message, data });
    },
    error: () => {
      // not expected in this test
    },
    response: (code: number, duration?: number) => {
      loggedResponses.push({ statusCode: code, duration });
    },
  };

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      responsePayload = payload;
      return payload;
    },
  };

  const result = respondMissingEnvConfig(
    res as unknown as VercelResponse,
    logger,
    Date.now() - 25,
    "Redis",
    ["REDIS_KV_REST_API_URL", "REDIS_KV_REST_API_TOKEN"]
  );

  assertEq(statusCode, 500);
  assertEq(
    JSON.stringify(responsePayload),
    JSON.stringify({
      error: "Redis is not configured.",
      missingEnvVars: ["REDIS_KV_REST_API_URL", "REDIS_KV_REST_API_TOKEN"],
    })
  );
  assertEq(loggedWarnings.length, 1);
  assertEq(loggedWarnings[0].message, "Redis is not configured");
  assertEq(loggedResponses.length, 1);
  assertEq(loggedResponses[0].statusCode, 500);
  assertEq(typeof loggedResponses[0].duration === "number", true);
  assertEq(
    JSON.stringify(result),
    JSON.stringify({
      error: "Redis is not configured.",
      missingEnvVars: ["REDIS_KV_REST_API_URL", "REDIS_KV_REST_API_TOKEN"],
    })
  );
}

async function testRespondMissingEnvConfigWithoutWarnLogger() {
  let statusCode = 0;
  let responsePayload: unknown = null;
  let loggedResponseCount = 0;

  const logger = {
    error: () => {
      // not expected
    },
    response: () => {
      loggedResponseCount += 1;
    },
  };

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      responsePayload = payload;
      return payload;
    },
  };

  respondMissingEnvConfig(
    res as unknown as VercelResponse,
    logger,
    Date.now(),
    "APNs",
    ["APNS_KEY_ID"]
  );

  assertEq(statusCode, 500);
  assertEq(loggedResponseCount, 1);
  assertEq(
    JSON.stringify(responsePayload),
    JSON.stringify({
      error: "APNs is not configured.",
      missingEnvVars: ["APNS_KEY_ID"],
    })
  );
}

export async function runPushErrorsTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-errors"));
  clearResults();

  await runTest("Push internal server error helper", testRespondInternalServerError);
  await runTest("Push missing-env responder helper", testRespondMissingEnvConfig);
  await runTest(
    "Push missing-env responder works without warn logger",
    testRespondMissingEnvConfigWithoutWarnLogger
  );

  return printSummary();
}

if (import.meta.main) {
  runPushErrorsTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
