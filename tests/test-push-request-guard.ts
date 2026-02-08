#!/usr/bin/env bun
/**
 * Tests for shared push request guard helper.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handlePushPostRequestGuards } from "../_api/push/_request-guard";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
  withPatchedEnv,
} from "./test-utils";

interface MockResponse {
  res: VercelResponse;
  getStatusCode: () => number;
  getJsonPayload: () => unknown;
  getEndCallCount: () => number;
  getHeader: (name: string) => string | undefined;
}

interface MockLogger {
  logger: {
    request: (method: string, url: string) => void;
    response: (statusCode: number, duration?: number) => void;
  };
  requestCalls: Array<{ method: string; url: string }>;
  responseCalls: Array<{ statusCode: number; duration?: number }>;
}

function createMockResponse(): MockResponse {
  let statusCode = 0;
  let jsonPayload: unknown = null;
  let endCallCount = 0;
  const headers = new Map<string, string>();

  const response = {
    setHeader: (name: string, value: unknown) => {
      headers.set(name.toLowerCase(), String(value));
      return undefined;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      jsonPayload = payload;
      return payload;
    },
    end: () => {
      endCallCount += 1;
      return undefined;
    },
  };

  return {
    res: response as unknown as VercelResponse,
    getStatusCode: () => statusCode,
    getJsonPayload: () => jsonPayload,
    getEndCallCount: () => endCallCount,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
  };
}

function createMockLogger(): MockLogger {
  const requestCalls: Array<{ method: string; url: string }> = [];
  const responseCalls: Array<{ statusCode: number; duration?: number }> = [];

  return {
    logger: {
      request: (method: string, url: string) => {
        requestCalls.push({ method, url });
      },
      response: (statusCode: number, duration?: number) => {
        responseCalls.push({ statusCode, duration });
      },
    },
    requestCalls,
    responseCalls,
  };
}

function createRequest(
  method: "POST" | "OPTIONS" | "GET",
  origin: string = "http://localhost:3000",
  url: string = "/api/push/register"
): VercelRequest {
  return createRawRequest(method, origin, url);
}

function createRawRequest(
  method: string | undefined,
  origin: string = "http://localhost:3000",
  url?: string
): VercelRequest {
  return {
    method,
    url,
    headers: { origin },
    body: {},
  } as unknown as VercelRequest;
}

function withDevelopmentEnv<T>(run: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(
    withPatchedEnv(
      {
        VERCEL_ENV: "development",
      },
      run
    )
  );
}

async function testAllowedPostContinuesWithoutHandling() {
  await withDevelopmentEnv(async () => {
    const req = createRequest("POST");
    const mockRes = createMockResponse();
    const mockLogger = createMockLogger();

    const handled = handlePushPostRequestGuards(
      req,
      mockRes.res,
      mockLogger.logger,
      Date.now(),
      "/api/push/register"
    );

    assertEq(handled, false);
    assertEq(mockRes.getStatusCode(), 0);
    assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "http://localhost:3000");
    assertEq(mockLogger.requestCalls.length, 1);
    assertEq(mockLogger.requestCalls[0].method, "POST");
    assertEq(mockLogger.requestCalls[0].url, "/api/push/register");
    assertEq(mockLogger.responseCalls.length, 0);
  });
}

async function testDisallowedPostIsRejected() {
  await withDevelopmentEnv(async () => {
    const req = createRequest("POST", "https://evil.example");
    const mockRes = createMockResponse();
    const mockLogger = createMockLogger();

    const handled = handlePushPostRequestGuards(
      req,
      mockRes.res,
      mockLogger.logger,
      Date.now(),
      "/api/push/register"
    );

    assertEq(handled, true);
    assertEq(mockRes.getStatusCode(), 403);
    assertEq(
      JSON.stringify(mockRes.getJsonPayload()),
      JSON.stringify({ error: "Unauthorized" })
    );
    assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), undefined);
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 403);
  });
}

async function testAllowedOptionsPreflightHandled() {
  await withDevelopmentEnv(async () => {
    const req = createRequest("OPTIONS");
    const mockRes = createMockResponse();
    const mockLogger = createMockLogger();

    const handled = handlePushPostRequestGuards(
      req,
      mockRes.res,
      mockLogger.logger,
      Date.now(),
      "/api/push/register"
    );

    assertEq(handled, true);
    assertEq(mockRes.getStatusCode(), 204);
    assertEq(mockRes.getEndCallCount(), 1);
    assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "http://localhost:3000");
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 204);
  });
}

async function testDisallowedOptionsPreflightRejected() {
  await withDevelopmentEnv(async () => {
    const req = createRequest("OPTIONS", "https://evil.example");
    const mockRes = createMockResponse();
    const mockLogger = createMockLogger();

    const handled = handlePushPostRequestGuards(
      req,
      mockRes.res,
      mockLogger.logger,
      Date.now(),
      "/api/push/register"
    );

    assertEq(handled, true);
    assertEq(mockRes.getStatusCode(), 403);
    assertEq(
      JSON.stringify(mockRes.getJsonPayload()),
      JSON.stringify({ error: "Unauthorized" })
    );
    assertEq(mockRes.getEndCallCount(), 0);
    assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), undefined);
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 403);
  });
}

async function testUnsupportedMethodSetsAllowHeader() {
  await withDevelopmentEnv(async () => {
    const req = createRequest("GET");
    const mockRes = createMockResponse();
    const mockLogger = createMockLogger();

    const handled = handlePushPostRequestGuards(
      req,
      mockRes.res,
      mockLogger.logger,
      Date.now(),
      "/api/push/register"
    );

    assertEq(handled, true);
    assertEq(mockRes.getStatusCode(), 405);
    assertEq(
      JSON.stringify(mockRes.getJsonPayload()),
      JSON.stringify({ error: "Method not allowed" })
    );
    assertEq(mockRes.getHeader("Allow"), "POST, OPTIONS");
    assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "http://localhost:3000");
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 405);
  });
}

async function testLowercasePostMethodIsNormalized() {
  await withDevelopmentEnv(async () => {
    const req = createRawRequest("post");
    const mockRes = createMockResponse();
    const mockLogger = createMockLogger();

    const handled = handlePushPostRequestGuards(
      req,
      mockRes.res,
      mockLogger.logger,
      Date.now(),
      "/api/push/register"
    );

    assertEq(handled, false);
    assertEq(mockLogger.requestCalls.length, 1);
    assertEq(mockLogger.requestCalls[0].method, "POST");
    assertEq(mockLogger.responseCalls.length, 0);
  });
}

async function testMissingMethodDefaultsToPost() {
  await withDevelopmentEnv(async () => {
    const req = createRawRequest(undefined);
    const mockRes = createMockResponse();
    const mockLogger = createMockLogger();

    const handled = handlePushPostRequestGuards(
      req,
      mockRes.res,
      mockLogger.logger,
      Date.now(),
      "/api/push/register"
    );

    assertEq(handled, false);
    assertEq(mockLogger.requestCalls.length, 1);
    assertEq(mockLogger.requestCalls[0].method, "POST");
    assertEq(mockLogger.responseCalls.length, 0);
  });
}

async function testLowercaseOptionsMethodHandledAsPreflight() {
  await withDevelopmentEnv(async () => {
    const req = createRawRequest("options");
    const mockRes = createMockResponse();
    const mockLogger = createMockLogger();

    const handled = handlePushPostRequestGuards(
      req,
      mockRes.res,
      mockLogger.logger,
      Date.now(),
      "/api/push/register"
    );

    assertEq(handled, true);
    assertEq(mockRes.getStatusCode(), 204);
    assertEq(mockRes.getEndCallCount(), 1);
    assertEq(mockLogger.requestCalls.length, 1);
    assertEq(mockLogger.requestCalls[0].method, "OPTIONS");
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 204);
  });
}

async function testMissingUrlFallsBackToEndpointPath() {
  await withDevelopmentEnv(async () => {
    const req = createRawRequest("POST", "http://localhost:3000", undefined);
    const mockRes = createMockResponse();
    const mockLogger = createMockLogger();

    const handled = handlePushPostRequestGuards(
      req,
      mockRes.res,
      mockLogger.logger,
      Date.now(),
      "/api/push/register"
    );

    assertEq(handled, false);
    assertEq(mockLogger.requestCalls.length, 1);
    assertEq(mockLogger.requestCalls[0].url, "/api/push/register");
  });
}

export async function runPushRequestGuardTests(): Promise<{
  passed: number;
  failed: number;
}> {
  console.log(section("push-request-guard"));
  clearResults();

  await runTest(
    "Push request guard allows localhost POST passthrough",
    testAllowedPostContinuesWithoutHandling
  );
  await runTest(
    "Push request guard rejects disallowed-origin POST",
    testDisallowedPostIsRejected
  );
  await runTest(
    "Push request guard handles localhost preflight",
    testAllowedOptionsPreflightHandled
  );
  await runTest(
    "Push request guard rejects disallowed preflight",
    testDisallowedOptionsPreflightRejected
  );
  await runTest(
    "Push request guard sets Allow header for unsupported methods",
    testUnsupportedMethodSetsAllowHeader
  );
  await runTest(
    "Push request guard normalizes lowercase POST method",
    testLowercasePostMethodIsNormalized
  );
  await runTest(
    "Push request guard defaults missing method to POST",
    testMissingMethodDefaultsToPost
  );
  await runTest(
    "Push request guard normalizes lowercase OPTIONS method",
    testLowercaseOptionsMethodHandledAsPreflight
  );
  await runTest(
    "Push request guard falls back to endpoint path when URL missing",
    testMissingUrlFallsBackToEndpointPath
  );

  return printSummary();
}

if (import.meta.main) {
  runPushRequestGuardTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
