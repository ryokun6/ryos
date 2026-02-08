#!/usr/bin/env bun
/**
 * Tests for shared CORS helpers used by push endpoints.
 */

import type { VercelRequest } from "@vercel/node";
import {
  getEffectiveOrigin,
  handlePreflight,
  isAllowedOrigin,
  setCorsHeaders,
} from "../_api/_utils/_cors";
import {
  assertEq,
  clearResults,
  createMockVercelResponseHarness,
  printSummary,
  runTest,
  section,
  withPatchedEnv,
} from "./test-utils";

function createRequest(
  method: string,
  headers: Record<string, string | string[] | undefined>
): VercelRequest {
  return {
    method,
    url: "/api/test",
    headers,
  } as unknown as VercelRequest;
}

async function testGetEffectiveOriginUsesOriginAndTrimsWhitespace() {
  const req = createRequest("POST", {
    origin: "   http://localhost:3000   ",
    referer: "https://os.ryo.lu/app",
  });
  assertEq(getEffectiveOrigin(req), "http://localhost:3000");
}

async function testGetEffectiveOriginFallsBackToRefererWhenOriginBlank() {
  const req = createRequest("POST", {
    origin: ["   ", "\t"],
    referer: [" ", "http://localhost:5173/path?x=1"],
  });
  assertEq(getEffectiveOrigin(req), "http://localhost:5173");
}

async function testGetEffectiveOriginReturnsNullForInvalidReferer() {
  const req = createRequest("POST", {
    origin: "   ",
    referer: "not a valid url",
  });
  assertEq(getEffectiveOrigin(req), null);
}

async function testIsAllowedOriginPoliciesByRuntimeEnv() {
  withPatchedEnv({ VERCEL_ENV: "production" }, () => {
    assertEq(isAllowedOrigin("https://os.ryo.lu"), true);
    assertEq(isAllowedOrigin("http://localhost:3000"), false);
    assertEq(isAllowedOrigin("https://devbox.tailb4fa61.ts.net"), true);
  });

  withPatchedEnv({ VERCEL_ENV: "preview" }, () => {
    assertEq(isAllowedOrigin("https://ryos-feature.vercel.app"), true);
    assertEq(isAllowedOrigin("https://ryo-lu-git-main-user.vercel.app"), true);
    assertEq(isAllowedOrigin("https://other-app.vercel.app"), false);
    assertEq(isAllowedOrigin("https://qa.tailb4fa61.ts.net"), true);
  });

  withPatchedEnv({ VERCEL_ENV: "development" }, () => {
    assertEq(isAllowedOrigin("http://localhost:3000"), true);
    assertEq(isAllowedOrigin("https://127.0.0.1:5173"), true);
    assertEq(isAllowedOrigin("https://os.ryo.lu"), false);
  });

  withPatchedEnv({ VERCEL_ENV: "qa" }, () => {
    assertEq(isAllowedOrigin("http://localhost:5173"), true);
  });
}

async function testSetCorsHeadersDefaultAndCustomBehavior() {
  const defaultRes = createMockVercelResponseHarness();
  setCorsHeaders(defaultRes.res, "http://localhost:3000");
  assertEq(defaultRes.getHeader("Access-Control-Allow-Origin"), "http://localhost:3000");
  assertEq(defaultRes.getHeader("Vary"), "Origin");
  assertEq(defaultRes.getHeader("Access-Control-Allow-Methods"), "GET, POST, OPTIONS");
  assertEq(
    defaultRes.getHeader("Access-Control-Allow-Headers"),
    "Content-Type, Authorization, X-Username"
  );
  assertEq(defaultRes.getHeader("Access-Control-Allow-Credentials"), "true");
  assertEq(defaultRes.getHeader("Access-Control-Max-Age"), "86400");

  const customRes = createMockVercelResponseHarness();
  setCorsHeaders(customRes.res, null, {
    methods: ["POST", "OPTIONS"],
    headers: ["X-Test"],
    credentials: false,
    maxAge: 120,
  });
  assertEq(customRes.getHeader("Access-Control-Allow-Origin"), undefined);
  assertEq(customRes.getHeader("Vary"), undefined);
  assertEq(customRes.getHeader("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assertEq(customRes.getHeader("Access-Control-Allow-Headers"), "X-Test");
  assertEq(customRes.getHeader("Access-Control-Allow-Credentials"), undefined);
  assertEq(customRes.getHeader("Access-Control-Max-Age"), "120");
}

async function testSetCorsHeadersAppendsOriginToExistingVaryHeader() {
  const res = createMockVercelResponseHarness();
  (res.res as { setHeader: (name: string, value: unknown) => unknown }).setHeader(
    "Vary",
    "Accept-Encoding"
  );

  setCorsHeaders(res.res, "http://localhost:3000");
  assertEq(res.getHeader("Vary"), "Accept-Encoding, Origin");
}

async function testSetCorsHeadersDoesNotDuplicateOriginInExistingVaryHeader() {
  const res = createMockVercelResponseHarness();
  (res.res as { setHeader: (name: string, value: unknown) => unknown }).setHeader(
    "Vary",
    "origin, Accept-Encoding"
  );

  setCorsHeaders(res.res, "http://localhost:3000");
  assertEq(res.getHeader("Vary"), "origin, Accept-Encoding");
}

async function testHandlePreflightRejectsUnauthorizedOrigins() {
  const req = createRequest("OPTIONS", {
    origin: "https://unauthorized.example",
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 403);
    assertEq(res.getSendPayload(), "Unauthorized");
    assertEq(res.getHeader("Vary"), "Origin, Access-Control-Request-Headers");
  });
}

async function testHandlePreflightAllowsOriginAndEchoesRequestedHeaders() {
  const req = createRequest("OPTIONS", {
    origin: ["  ", "http://localhost:3000"],
    "access-control-request-headers": [" ", "X-Test, X-Username"],
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getEndCallCount(), 1);
    assertEq(res.getHeader("Vary"), "Origin, Access-Control-Request-Headers");
    assertEq(res.getHeader("Access-Control-Allow-Origin"), "http://localhost:3000");
    assertEq(res.getHeader("Access-Control-Allow-Headers"), "X-Test, X-Username");
    assertEq(res.getHeader("Access-Control-Allow-Methods"), "GET, POST, OPTIONS");
  });
}

async function testHandlePreflightHandlesLowercaseOptionsMethod() {
  const req = createRequest("options", {
    origin: "http://localhost:3000",
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getEndCallCount(), 1);
    assertEq(res.getHeader("Vary"), "Origin, Access-Control-Request-Headers");
  });
}

async function testHandlePreflightHandlesWhitespacePaddedOptionsMethod() {
  const req = createRequest("  options  ", {
    origin: "http://localhost:3000",
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getEndCallCount(), 1);
    assertEq(res.getHeader("Vary"), "Origin, Access-Control-Request-Headers");
  });
}

async function testHandlePreflightFallsBackToConfiguredHeadersWhenRequestedHeaderMissing() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:5173",
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res, {
      methods: ["POST", "OPTIONS"],
      headers: ["X-App-Header"],
      maxAge: 300,
    });
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getHeader("Vary"), "Origin, Access-Control-Request-Headers");
    assertEq(res.getHeader("Access-Control-Allow-Methods"), "POST, OPTIONS");
    assertEq(res.getHeader("Access-Control-Allow-Headers"), "X-App-Header");
    assertEq(res.getHeader("Access-Control-Max-Age"), "300");
  });
}

async function testHandlePreflightSkipsNonOptionsRequests() {
  const req = createRequest("POST", {
    origin: "http://localhost:3000",
  });
  const res = createMockVercelResponseHarness();

  const handled = handlePreflight(req, res.res);
  assertEq(handled, false);
  assertEq(res.getStatusCode(), 0);
  assertEq(res.getEndCallCount(), 0);
}

export async function runPushCorsUtilsTests(): Promise<{
  passed: number;
  failed: number;
}> {
  console.log(section("push-cors-utils"));
  clearResults();

  await runTest(
    "CORS helper resolves origin header and trims whitespace",
    testGetEffectiveOriginUsesOriginAndTrimsWhitespace
  );
  await runTest(
    "CORS helper falls back to referer when origin headers are blank",
    testGetEffectiveOriginFallsBackToRefererWhenOriginBlank
  );
  await runTest(
    "CORS helper rejects invalid referer fallback values",
    testGetEffectiveOriginReturnsNullForInvalidReferer
  );
  await runTest(
    "CORS origin allow-list respects runtime environment policies",
    testIsAllowedOriginPoliciesByRuntimeEnv
  );
  await runTest(
    "CORS header setter applies default and custom options",
    testSetCorsHeadersDefaultAndCustomBehavior
  );
  await runTest(
    "CORS header setter appends Origin to existing Vary values",
    testSetCorsHeadersAppendsOriginToExistingVaryHeader
  );
  await runTest(
    "CORS header setter avoids duplicate Origin in existing Vary values",
    testSetCorsHeadersDoesNotDuplicateOriginInExistingVaryHeader
  );
  await runTest(
    "CORS preflight helper rejects unauthorized origins",
    testHandlePreflightRejectsUnauthorizedOrigins
  );
  await runTest(
    "CORS preflight helper echoes requested headers for allowed origins",
    testHandlePreflightAllowsOriginAndEchoesRequestedHeaders
  );
  await runTest(
    "CORS preflight helper normalizes lowercase OPTIONS requests",
    testHandlePreflightHandlesLowercaseOptionsMethod
  );
  await runTest(
    "CORS preflight helper normalizes whitespace-padded OPTIONS requests",
    testHandlePreflightHandlesWhitespacePaddedOptionsMethod
  );
  await runTest(
    "CORS preflight helper falls back to configured allow headers",
    testHandlePreflightFallsBackToConfiguredHeadersWhenRequestedHeaderMissing
  );
  await runTest(
    "CORS preflight helper skips non-OPTIONS requests",
    testHandlePreflightSkipsNonOptionsRequests
  );

  return printSummary();
}

if (import.meta.main) {
  runPushCorsUtilsTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
