#!/usr/bin/env bun
/**
 * Tests auth-first behavior for push API handlers.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import pushRegisterHandler from "../_api/push/register";
import pushUnregisterHandler from "../_api/push/unregister";
import pushTestHandler from "../_api/push/test";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
  withPatchedEnv,
} from "./test-utils";

type PushHandler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

interface MockResponse {
  res: VercelResponse;
  getStatusCode: () => number;
  getJsonPayload: () => unknown;
  getEndCallCount: () => number;
}

function createMockResponse(): MockResponse {
  let statusCode = 0;
  let jsonPayload: unknown = null;
  let endCallCount = 0;

  const response = {
    setHeader: () => undefined,
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
  };
}

function createRequest(
  method: "POST" | "OPTIONS",
  url: string,
  origin: string = "http://localhost:3000"
): VercelRequest {
  return {
    method,
    url,
    headers: {
      origin,
    },
    body: {},
  } as unknown as VercelRequest;
}

async function expectMissingCredentialsResponse(
  handler: PushHandler,
  endpointPath: string
) {
  const req = createRequest("POST", endpointPath);
  const mockRes = createMockResponse();

  await handler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 401);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Unauthorized - missing credentials" })
  );
}

async function expectUnauthorizedOriginResponse(
  handler: PushHandler,
  endpointPath: string,
  method: "POST" | "OPTIONS" = "POST"
) {
  const req = createRequest(method, endpointPath, "https://evil.example");
  const mockRes = createMockResponse();

  await handler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 403);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Unauthorized" })
  );
  assertEq(mockRes.getEndCallCount(), 0);
}

function withMissingPushEnv<T>(run: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(
    withPatchedEnv(
      {
        VERCEL_ENV: "development",
        REDIS_KV_REST_API_URL: undefined,
        REDIS_KV_REST_API_TOKEN: undefined,
        APNS_KEY_ID: undefined,
        APNS_TEAM_ID: undefined,
        APNS_BUNDLE_ID: undefined,
        APNS_PRIVATE_KEY: undefined,
      },
      run
    )
  );
}

async function testRegisterMissingCredentialsTakesPrecedence() {
  await withMissingPushEnv(async () => {
    await expectMissingCredentialsResponse(pushRegisterHandler, "/api/push/register");
  });
}

async function testRegisterUnauthorizedOriginTakesPrecedence() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginResponse(pushRegisterHandler, "/api/push/register");
  });
}

async function testRegisterOptionsUnauthorizedOriginRejected() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginResponse(
      pushRegisterHandler,
      "/api/push/register",
      "OPTIONS"
    );
  });
}

async function testRegisterOptionsAllowedOriginReturnsNoContent() {
  const req = createRequest("OPTIONS", "/api/push/register");
  const mockRes = createMockResponse();

  await pushRegisterHandler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 204);
  assertEq(mockRes.getJsonPayload(), null);
  assertEq(mockRes.getEndCallCount(), 1);
}

async function testUnregisterMissingCredentialsTakesPrecedence() {
  await withMissingPushEnv(async () => {
    await expectMissingCredentialsResponse(
      pushUnregisterHandler,
      "/api/push/unregister"
    );
  });
}

async function testUnregisterUnauthorizedOriginTakesPrecedence() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginResponse(pushUnregisterHandler, "/api/push/unregister");
  });
}

async function testUnregisterOptionsUnauthorizedOriginRejected() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginResponse(
      pushUnregisterHandler,
      "/api/push/unregister",
      "OPTIONS"
    );
  });
}

async function testPushTestMissingCredentialsTakesPrecedence() {
  await withMissingPushEnv(async () => {
    await expectMissingCredentialsResponse(pushTestHandler, "/api/push/test");
  });
}

async function testPushTestUnauthorizedOriginTakesPrecedence() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginResponse(pushTestHandler, "/api/push/test");
  });
}

async function testPushTestOptionsUnauthorizedOriginRejected() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginResponse(pushTestHandler, "/api/push/test", "OPTIONS");
  });
}

async function testPushTestOptionsAllowedOriginReturnsNoContent() {
  const req = createRequest("OPTIONS", "/api/push/test");
  const mockRes = createMockResponse();

  await pushTestHandler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 204);
  assertEq(mockRes.getJsonPayload(), null);
  assertEq(mockRes.getEndCallCount(), 1);
}

async function testUnregisterOptionsAllowedOriginReturnsNoContent() {
  const req = createRequest("OPTIONS", "/api/push/unregister");
  const mockRes = createMockResponse();

  await pushUnregisterHandler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 204);
  assertEq(mockRes.getJsonPayload(), null);
  assertEq(mockRes.getEndCallCount(), 1);
}

export async function runPushAuthOrderTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-auth-order"));
  clearResults();

  await runTest(
    "Push register returns 401 before Redis config checks",
    testRegisterMissingCredentialsTakesPrecedence
  );
  await runTest(
    "Push register returns 403 before env checks for disallowed origin",
    testRegisterUnauthorizedOriginTakesPrecedence
  );
  await runTest(
    "Push register rejects disallowed-origin preflight",
    testRegisterOptionsUnauthorizedOriginRejected
  );
  await runTest(
    "Push register allows localhost preflight",
    testRegisterOptionsAllowedOriginReturnsNoContent
  );
  await runTest(
    "Push unregister returns 401 before Redis config checks",
    testUnregisterMissingCredentialsTakesPrecedence
  );
  await runTest(
    "Push unregister returns 403 before env checks for disallowed origin",
    testUnregisterUnauthorizedOriginTakesPrecedence
  );
  await runTest(
    "Push unregister rejects disallowed-origin preflight",
    testUnregisterOptionsUnauthorizedOriginRejected
  );
  await runTest(
    "Push unregister allows localhost preflight",
    testUnregisterOptionsAllowedOriginReturnsNoContent
  );
  await runTest(
    "Push test returns 401 before Redis/APNs config checks",
    testPushTestMissingCredentialsTakesPrecedence
  );
  await runTest(
    "Push test returns 403 before env checks for disallowed origin",
    testPushTestUnauthorizedOriginTakesPrecedence
  );
  await runTest(
    "Push test rejects disallowed-origin preflight",
    testPushTestOptionsUnauthorizedOriginRejected
  );
  await runTest(
    "Push test allows localhost preflight",
    testPushTestOptionsAllowedOriginReturnsNoContent
  );

  return printSummary();
}

if (import.meta.main) {
  runPushAuthOrderTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
