#!/usr/bin/env bun
/**
 * Tests auth-first behavior for push API handlers.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import pushRegisterHandler from "../_api/push/register";
import pushUnregisterHandler from "../_api/push/unregister";
import pushTestHandler from "../_api/push/test";
import {
  PUSH_ALLOW_HEADER_VALUE,
  PUSH_OPTIONS_VARY_HEADER,
} from "../_api/push/_request-guard";
import {
  assertEq,
  clearResults,
  createMockVercelResponseHarness,
  printSummary,
  runTest,
  section,
  withPatchedEnv,
} from "./test-utils";

type PushHandler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

function createRequest(
  method: "POST" | "OPTIONS" | "GET",
  url: string,
  origin: string = "http://localhost:3000",
  extraHeaders?: Record<string, string>
): VercelRequest {
  return {
    method,
    url,
    headers: {
      origin,
      ...(extraHeaders || {}),
    },
    body: {},
  } as unknown as VercelRequest;
}

async function expectMissingCredentialsResponse(
  handler: PushHandler,
  endpointPath: string
) {
  const req = createRequest("POST", endpointPath);
  const mockRes = createMockVercelResponseHarness();

  await handler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 401);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Unauthorized - missing credentials" })
  );
  assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "http://localhost:3000");
  assertEq(mockRes.getHeader("Vary"), "Origin");
  assertEq(mockRes.getHeader("Allow"), undefined);
}

async function expectUnauthorizedOriginResponse(
  handler: PushHandler,
  endpointPath: string,
  method: "POST" | "OPTIONS" | "GET" = "POST"
) {
  const req = createRequest(method, endpointPath, "https://evil.example");
  const mockRes = createMockVercelResponseHarness();
  const expectedVary =
    method === "OPTIONS" ? PUSH_OPTIONS_VARY_HEADER : "Origin";

  await handler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 403);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Unauthorized" })
  );
  assertEq(mockRes.getEndCallCount(), 0);
  assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), undefined);
  assertEq(mockRes.getHeader("Vary"), expectedVary);
  assertEq(mockRes.getHeader("Allow"), undefined);
}

async function expectUnauthorizedOriginOptionsWithRequestedMethodResponse(
  handler: PushHandler,
  endpointPath: string
) {
  const req = createRequest("OPTIONS", endpointPath, "https://evil.example", {
    "access-control-request-method": "DELETE",
  });
  const mockRes = createMockVercelResponseHarness();

  await handler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 403);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Unauthorized" })
  );
  assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), undefined);
  assertEq(mockRes.getHeader("Access-Control-Allow-Headers"), undefined);
  assertEq(mockRes.getHeader("Allow"), undefined);
  assertEq(mockRes.getHeader("Vary"), PUSH_OPTIONS_VARY_HEADER);
}

async function expectMethodNotAllowedResponse(
  handler: PushHandler,
  endpointPath: string
) {
  const req = createRequest("GET", endpointPath);
  const mockRes = createMockVercelResponseHarness();

  await handler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 405);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Method not allowed" })
  );
  assertEq(mockRes.getHeader("Allow"), PUSH_ALLOW_HEADER_VALUE);
  assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "http://localhost:3000");
  assertEq(
    mockRes.getHeader("Access-Control-Allow-Methods"),
    PUSH_ALLOW_HEADER_VALUE
  );
  assertEq(
    mockRes.getHeader("Access-Control-Allow-Headers"),
    "Content-Type, Authorization, X-Username"
  );
  assertEq(mockRes.getHeader("Access-Control-Allow-Credentials"), "true");
  assertEq(mockRes.getHeader("Access-Control-Max-Age"), "86400");
  assertEq(mockRes.getHeader("Vary"), "Origin");
}

async function expectOptionsRequestedMethodNotAllowedResponse(
  handler: PushHandler,
  endpointPath: string
) {
  const req = createRequest("OPTIONS", endpointPath, "http://localhost:3000", {
    "access-control-request-method": "DELETE",
  });
  const mockRes = createMockVercelResponseHarness();

  await handler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 405);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Method not allowed" })
  );
  assertEq(mockRes.getHeader("Allow"), PUSH_ALLOW_HEADER_VALUE);
  assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "http://localhost:3000");
  assertEq(
    mockRes.getHeader("Access-Control-Allow-Methods"),
    PUSH_ALLOW_HEADER_VALUE
  );
  assertEq(
    mockRes.getHeader("Access-Control-Allow-Headers"),
    "Content-Type, Authorization, X-Username"
  );
  assertEq(mockRes.getHeader("Access-Control-Allow-Credentials"), "true");
  assertEq(mockRes.getHeader("Access-Control-Max-Age"), "86400");
  assertEq(mockRes.getHeader("Vary"), PUSH_OPTIONS_VARY_HEADER);
}

async function expectMissingRedisConfigResponse(
  handler: PushHandler,
  endpointPath: string
) {
  const req = createRequest("POST", endpointPath, "http://localhost:3000", {
    authorization: "Bearer valid-looking-token",
    "x-username": "test-user",
  });
  const mockRes = createMockVercelResponseHarness();

  await handler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 500);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({
      error: "Redis is not configured.",
      missingEnvVars: ["REDIS_KV_REST_API_URL", "REDIS_KV_REST_API_TOKEN"],
    })
  );
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

async function testRegisterOptionsUnsupportedRequestedMethodStillRejectedByOrigin() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginOptionsWithRequestedMethodResponse(
      pushRegisterHandler,
      "/api/push/register"
    );
  });
}

async function testRegisterOptionsAllowedOriginReturnsNoContent() {
  const req = createRequest("OPTIONS", "/api/push/register");
  const mockRes = createMockVercelResponseHarness();

  await pushRegisterHandler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 204);
  assertEq(mockRes.getJsonPayload(), null);
  assertEq(mockRes.getEndCallCount(), 1);
  assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "http://localhost:3000");
}

async function testRegisterMethodNotAllowedIncludesAllowHeader() {
  await expectMethodNotAllowedResponse(pushRegisterHandler, "/api/push/register");
}

async function testRegisterOptionsRequestedMethodNotAllowedIncludesAllowHeader() {
  await expectOptionsRequestedMethodNotAllowedResponse(
    pushRegisterHandler,
    "/api/push/register"
  );
}

async function testRegisterDisallowedOriginPrecedesMethodGuard() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginResponse(
      pushRegisterHandler,
      "/api/push/register",
      "GET"
    );
  });
}

async function testRegisterMissingRedisConfigAfterCredentialExtraction() {
  await withMissingPushEnv(async () => {
    await expectMissingRedisConfigResponse(pushRegisterHandler, "/api/push/register");
  });
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

async function testUnregisterOptionsUnsupportedRequestedMethodStillRejectedByOrigin() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginOptionsWithRequestedMethodResponse(
      pushUnregisterHandler,
      "/api/push/unregister"
    );
  });
}

async function testUnregisterMethodNotAllowedIncludesAllowHeader() {
  await expectMethodNotAllowedResponse(pushUnregisterHandler, "/api/push/unregister");
}

async function testUnregisterOptionsRequestedMethodNotAllowedIncludesAllowHeader() {
  await expectOptionsRequestedMethodNotAllowedResponse(
    pushUnregisterHandler,
    "/api/push/unregister"
  );
}

async function testUnregisterDisallowedOriginPrecedesMethodGuard() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginResponse(
      pushUnregisterHandler,
      "/api/push/unregister",
      "GET"
    );
  });
}

async function testUnregisterMissingRedisConfigAfterCredentialExtraction() {
  await withMissingPushEnv(async () => {
    await expectMissingRedisConfigResponse(pushUnregisterHandler, "/api/push/unregister");
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

async function testPushTestOptionsUnsupportedRequestedMethodStillRejectedByOrigin() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginOptionsWithRequestedMethodResponse(
      pushTestHandler,
      "/api/push/test"
    );
  });
}

async function testPushTestOptionsAllowedOriginReturnsNoContent() {
  const req = createRequest("OPTIONS", "/api/push/test");
  const mockRes = createMockVercelResponseHarness();

  await pushTestHandler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 204);
  assertEq(mockRes.getJsonPayload(), null);
  assertEq(mockRes.getEndCallCount(), 1);
  assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "http://localhost:3000");
}

async function testPushTestMethodNotAllowedIncludesAllowHeader() {
  await expectMethodNotAllowedResponse(pushTestHandler, "/api/push/test");
}

async function testPushTestOptionsRequestedMethodNotAllowedIncludesAllowHeader() {
  await expectOptionsRequestedMethodNotAllowedResponse(
    pushTestHandler,
    "/api/push/test"
  );
}

async function testPushTestDisallowedOriginPrecedesMethodGuard() {
  await withMissingPushEnv(async () => {
    await expectUnauthorizedOriginResponse(pushTestHandler, "/api/push/test", "GET");
  });
}

async function testPushTestMissingRedisConfigAfterCredentialExtraction() {
  await withMissingPushEnv(async () => {
    await expectMissingRedisConfigResponse(pushTestHandler, "/api/push/test");
  });
}

async function testUnregisterOptionsAllowedOriginReturnsNoContent() {
  const req = createRequest("OPTIONS", "/api/push/unregister");
  const mockRes = createMockVercelResponseHarness();

  await pushUnregisterHandler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 204);
  assertEq(mockRes.getJsonPayload(), null);
  assertEq(mockRes.getEndCallCount(), 1);
  assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "http://localhost:3000");
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
    "Push register origin guard precedes unsupported preflight requested method",
    testRegisterOptionsUnsupportedRequestedMethodStillRejectedByOrigin
  );
  await runTest(
    "Push register allows localhost preflight",
    testRegisterOptionsAllowedOriginReturnsNoContent
  );
  await runTest(
    "Push register method guard sets Allow header",
    testRegisterMethodNotAllowedIncludesAllowHeader
  );
  await runTest(
    "Push register preflight rejects unsupported requested method",
    testRegisterOptionsRequestedMethodNotAllowedIncludesAllowHeader
  );
  await runTest(
    "Push register disallowed origin takes precedence over method guard",
    testRegisterDisallowedOriginPrecedesMethodGuard
  );
  await runTest(
    "Push register returns Redis config error after credential extraction",
    testRegisterMissingRedisConfigAfterCredentialExtraction
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
    "Push unregister origin guard precedes unsupported preflight requested method",
    testUnregisterOptionsUnsupportedRequestedMethodStillRejectedByOrigin
  );
  await runTest(
    "Push unregister method guard sets Allow header",
    testUnregisterMethodNotAllowedIncludesAllowHeader
  );
  await runTest(
    "Push unregister preflight rejects unsupported requested method",
    testUnregisterOptionsRequestedMethodNotAllowedIncludesAllowHeader
  );
  await runTest(
    "Push unregister disallowed origin takes precedence over method guard",
    testUnregisterDisallowedOriginPrecedesMethodGuard
  );
  await runTest(
    "Push unregister returns Redis config error after credential extraction",
    testUnregisterMissingRedisConfigAfterCredentialExtraction
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
    "Push test origin guard precedes unsupported preflight requested method",
    testPushTestOptionsUnsupportedRequestedMethodStillRejectedByOrigin
  );
  await runTest(
    "Push test allows localhost preflight",
    testPushTestOptionsAllowedOriginReturnsNoContent
  );
  await runTest(
    "Push test method guard sets Allow header",
    testPushTestMethodNotAllowedIncludesAllowHeader
  );
  await runTest(
    "Push test preflight rejects unsupported requested method",
    testPushTestOptionsRequestedMethodNotAllowedIncludesAllowHeader
  );
  await runTest(
    "Push test disallowed origin takes precedence over method guard",
    testPushTestDisallowedOriginPrecedesMethodGuard
  );
  await runTest(
    "Push test returns Redis config error after credential extraction",
    testPushTestMissingRedisConfigAfterCredentialExtraction
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
