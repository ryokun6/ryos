#!/usr/bin/env bun
/**
 * Tests for shared CORS helpers used by push endpoints.
 */

import type { VercelRequest } from "@vercel/node";
import {
  CORS_MAX_PREFLIGHT_ALLOW_HEADERS_LENGTH,
  CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH,
  CORS_MAX_PREFLIGHT_REQUESTED_HEADER_TOKENS,
  CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUE_LENGTH,
  CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUES,
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

async function testExportedCorsContractConstants() {
  assertEq(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUES, 50);
  assertEq(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUE_LENGTH, 1024);
  assertEq(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH, 128);
  assertEq(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_TOKENS, 200);
  assertEq(CORS_MAX_PREFLIGHT_ALLOW_HEADERS_LENGTH, 4096);
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

async function testGetEffectiveOriginUsesFirstNonEmptyOriginArrayEntry() {
  const req = createRequest("POST", {
    origin: ["not a valid origin", "http://localhost:3000"],
  });
  assertEq(getEffectiveOrigin(req), "not a valid origin");
}

async function testGetEffectiveOriginUsesFirstNonEmptyRefererArrayEntry() {
  const req = createRequest("POST", {
    origin: ["   "],
    referer: ["not a url", "http://localhost:3000/path"],
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

async function testHandlePreflightMergesRepeatedRequestedHeaderValues() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": [
      "X-First",
      "  X-Second, X-Third  ",
      "   ",
      "X-Fourth",
    ],
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      "X-First, X-Second, X-Third, X-Fourth"
    );
  });
}

async function testHandlePreflightFiltersInvalidRequestedHeaderTokens() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers":
      "X-Valid, invalid token, invalid/token, X-Also-Valid",
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      "X-Valid, X-Also-Valid"
    );
  });
}

async function testHandlePreflightAllowsRequestedHeaderTokensWithPunctuationSet() {
  const allowedToken = "X_Test-Header.1+2^3`4|5~6!7#8$9%0&1'2*3";
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": allowedToken,
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getHeader("Access-Control-Allow-Headers"), allowedToken);
  });
}

async function testHandlePreflightDedupesRequestedHeaderTokensCaseInsensitively() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": "x-test, X-Test, X-TEST, X-Other",
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getHeader("Access-Control-Allow-Headers"), "x-test, X-Other");
  });
}

async function testHandlePreflightDedupesRequestedHeaderTokensAcrossArrayValues() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": ["X-Test", "x-test", "X-Other"],
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getHeader("Access-Control-Allow-Headers"), "X-Test, X-Other");
  });
}

async function testHandlePreflightFallsBackWhenAllRequestedHeaderTokensInvalid() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": "invalid token, invalid/token, @@@",
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
  });
}

async function testHandlePreflightRejectsRequestedHeaderTokensWithUnicodeCharacters() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": "X-Valid, X-Ünicode",
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getHeader("Access-Control-Allow-Headers"), "X-Valid");
  });
}

async function testHandlePreflightUsesRequestedHeaderValueAtScanLimit() {
  const requestedHeaderValues = Array.from(
    { length: CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUES },
    (_, index) =>
      index === CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUES - 1 ? "X-Limit" : "   "
  );

  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": requestedHeaderValues,
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getHeader("Access-Control-Allow-Headers"), "X-Limit");
  });
}

async function testHandlePreflightIgnoresRequestedHeaderValuesBeyondScanLimit() {
  const requestedHeaderValues = Array.from(
    { length: CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUES + 1 },
    (_, index) =>
      index === CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUES ? "X-Beyond-Limit" : "   "
  );

  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": requestedHeaderValues,
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
  });
}

async function testHandlePreflightUsesRequestedHeaderTokenAtTokenScanLimit() {
  const candidates = Array.from(
    { length: CORS_MAX_PREFLIGHT_REQUESTED_HEADER_TOKENS },
    (_, index) =>
      index === CORS_MAX_PREFLIGHT_REQUESTED_HEADER_TOKENS - 1 ? "X-Token-Limit" : " "
  );
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": candidates.join(","),
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getHeader("Access-Control-Allow-Headers"), "X-Token-Limit");
  });
}

async function testHandlePreflightIgnoresRequestedHeaderTokenBeyondTokenScanLimit() {
  const candidates = Array.from(
    { length: CORS_MAX_PREFLIGHT_REQUESTED_HEADER_TOKENS + 1 },
    (_, index) =>
      index === CORS_MAX_PREFLIGHT_REQUESTED_HEADER_TOKENS ? "X-Beyond-Token-Limit" : " "
  );
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": candidates.join(","),
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
  });
}

async function testHandlePreflightUsesRequestedHeaderTokenAtTokenScanLimitAcrossArrayValues() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": [
      Array.from(
        { length: CORS_MAX_PREFLIGHT_REQUESTED_HEADER_TOKENS - 1 },
        () => " "
      ).join(","),
      "X-Token-Limit-Across-Values",
    ],
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      "X-Token-Limit-Across-Values"
    );
  });
}

async function testHandlePreflightIgnoresRequestedHeaderTokenBeyondTokenScanLimitAcrossArrayValues() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": [
      Array.from(
        { length: CORS_MAX_PREFLIGHT_REQUESTED_HEADER_TOKENS },
        () => " "
      ).join(","),
      "X-Beyond-Token-Limit-Across-Values",
    ],
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
  });
}

async function testHandlePreflightIgnoresRequestedHeaderTokenWhenNameTooLong() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": [
      "X".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH + 1),
    ],
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
  });
}

async function testHandlePreflightKeepsValidRequestedHeaderTokenWhenPeerNameTooLong() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": [
      `${"X".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH + 1)}, X-Valid`,
    ],
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getHeader("Access-Control-Allow-Headers"), "X-Valid");
  });
}

async function testHandlePreflightIgnoresRequestedHeaderValueWhenTooLong() {
  const validSizedToken = "A".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH);
  const oversizedRequestedHeaderValue = Array.from(
    { length: 8 },
    (_, index) => `${validSizedToken}${index}`
  ).join(",");
  assertEq(
    oversizedRequestedHeaderValue.length > CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUE_LENGTH,
    true
  );

  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": [oversizedRequestedHeaderValue],
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
  });
}

async function testHandlePreflightAcceptsRequestedHeaderValueAtLengthLimit() {
  const tokenA = "A".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH);
  const tokenB = "B".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH);
  const tokenC = "C".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH);
  const tokenD = "D".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH);
  const tokenE = "E".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH);
  const tokenF = "F".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH);
  const tokenG = "G".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH);
  const tokenH = "H".repeat(121);
  const requestedHeaderTokens = [
    tokenA,
    tokenB,
    tokenC,
    tokenD,
    tokenE,
    tokenF,
    tokenG,
    tokenH,
  ];
  const requestedHeaderValue = requestedHeaderTokens.join(",");
  assertEq(
    requestedHeaderValue.length,
    CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUE_LENGTH
  );

  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": [requestedHeaderValue],
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      requestedHeaderTokens.join(", ")
    );
  });
}

async function testHandlePreflightKeepsValidRequestedHeaderValuesWhenSomeAreTooLong() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": [
      "X".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUE_LENGTH + 1),
      "X-Valid",
    ],
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getHeader("Access-Control-Allow-Headers"), "X-Valid");
  });
}

async function testHandlePreflightFallsBackWhenMergedAllowHeadersWouldBeTooLong() {
  const requestedHeaderValues = Array.from(
    { length: CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUES },
    (_, index) => `X-${String(index).padStart(2, "0")}-${"x".repeat(75)}`
  );
  assertEq(requestedHeaderValues[0].length, 80);
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": requestedHeaderValues,
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
  });
}

async function testHandlePreflightAcceptsMergedAllowHeadersAtLengthLimit() {
  const requestedHeaderValues = [
    `A-${"a".repeat(125)}`,
    ...Array.from(
      { length: CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUES - 1 },
      (_, index) => `${String(index).padStart(2, "0")}-${"b".repeat(76)}`
    ),
  ];
  const expectedAllowHeaders = requestedHeaderValues.join(", ");
  assertEq(expectedAllowHeaders.length, CORS_MAX_PREFLIGHT_ALLOW_HEADERS_LENGTH);

  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": requestedHeaderValues,
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(res.getHeader("Access-Control-Allow-Headers"), expectedAllowHeaders);
  });
}

async function testHandlePreflightAcceptsRequestedHeaderTokenNameAtLengthLimit() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
    "access-control-request-headers": [
      "T".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH),
    ],
  });
  const res = createMockVercelResponseHarness();

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getStatusCode(), 204);
    assertEq(
      res.getHeader("Access-Control-Allow-Headers"),
      "T".repeat(CORS_MAX_PREFLIGHT_REQUESTED_HEADER_NAME_LENGTH)
    );
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

async function testHandlePreflightFallsBackToConfiguredHeadersWhenRequestedHeadersInvalid() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:5173",
    "access-control-request-headers": "invalid token, invalid/token",
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
    assertEq(res.getHeader("Access-Control-Allow-Headers"), "X-App-Header");
  });
}

async function testHandlePreflightAppendsVaryDimensionsToExistingHeader() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
  });
  const res = createMockVercelResponseHarness();
  (res.res as { setHeader: (name: string, value: unknown) => unknown }).setHeader(
    "Vary",
    "Accept-Encoding"
  );

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(
      res.getHeader("Vary"),
      "Accept-Encoding, Origin, Access-Control-Request-Headers"
    );
  });
}

async function testHandlePreflightAvoidsDuplicateVaryDimensions() {
  const req = createRequest("OPTIONS", {
    origin: "http://localhost:3000",
  });
  const res = createMockVercelResponseHarness();
  (res.res as { setHeader: (name: string, value: unknown) => unknown }).setHeader(
    "Vary",
    "Origin, access-control-request-headers"
  );

  await withPatchedEnv({ VERCEL_ENV: "development" }, async () => {
    const handled = handlePreflight(req, res.res);
    assertEq(handled, true);
    assertEq(res.getHeader("Vary"), "Origin, access-control-request-headers");
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
    "Shared CORS helper exported constants remain stable",
    testExportedCorsContractConstants
  );
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
    "CORS helper uses first non-empty origin array entry",
    testGetEffectiveOriginUsesFirstNonEmptyOriginArrayEntry
  );
  await runTest(
    "CORS helper uses first non-empty referer array entry",
    testGetEffectiveOriginUsesFirstNonEmptyRefererArrayEntry
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
    "CORS preflight helper merges repeated requested-header values",
    testHandlePreflightMergesRepeatedRequestedHeaderValues
  );
  await runTest(
    "CORS preflight helper filters invalid requested-header tokens",
    testHandlePreflightFiltersInvalidRequestedHeaderTokens
  );
  await runTest(
    "CORS preflight helper accepts requested-header tokens with allowed punctuation",
    testHandlePreflightAllowsRequestedHeaderTokensWithPunctuationSet
  );
  await runTest(
    "CORS preflight helper dedupes requested-header tokens case-insensitively",
    testHandlePreflightDedupesRequestedHeaderTokensCaseInsensitively
  );
  await runTest(
    "CORS preflight helper dedupes requested-header tokens across array values",
    testHandlePreflightDedupesRequestedHeaderTokensAcrossArrayValues
  );
  await runTest(
    "CORS preflight helper falls back when all requested-header tokens are invalid",
    testHandlePreflightFallsBackWhenAllRequestedHeaderTokensInvalid
  );
  await runTest(
    "CORS preflight helper rejects requested-header tokens with unicode characters",
    testHandlePreflightRejectsRequestedHeaderTokensWithUnicodeCharacters
  );
  await runTest(
    "CORS preflight helper uses requested-header value at scan limit",
    testHandlePreflightUsesRequestedHeaderValueAtScanLimit
  );
  await runTest(
    "CORS preflight helper ignores requested-header values beyond scan limit",
    testHandlePreflightIgnoresRequestedHeaderValuesBeyondScanLimit
  );
  await runTest(
    "CORS preflight helper uses requested-header token at token scan limit",
    testHandlePreflightUsesRequestedHeaderTokenAtTokenScanLimit
  );
  await runTest(
    "CORS preflight helper ignores requested-header token beyond token scan limit",
    testHandlePreflightIgnoresRequestedHeaderTokenBeyondTokenScanLimit
  );
  await runTest(
    "CORS preflight helper uses requested-header token at token scan limit across array values",
    testHandlePreflightUsesRequestedHeaderTokenAtTokenScanLimitAcrossArrayValues
  );
  await runTest(
    "CORS preflight helper ignores requested-header token beyond token scan limit across array values",
    testHandlePreflightIgnoresRequestedHeaderTokenBeyondTokenScanLimitAcrossArrayValues
  );
  await runTest(
    "CORS preflight helper ignores requested-header tokens whose names are too long",
    testHandlePreflightIgnoresRequestedHeaderTokenWhenNameTooLong
  );
  await runTest(
    "CORS preflight helper keeps valid requested-header tokens when peer names are too long",
    testHandlePreflightKeepsValidRequestedHeaderTokenWhenPeerNameTooLong
  );
  await runTest(
    "CORS preflight helper accepts requested-header token names at length limit",
    testHandlePreflightAcceptsRequestedHeaderTokenNameAtLengthLimit
  );
  await runTest(
    "CORS preflight helper ignores overly long requested-header values",
    testHandlePreflightIgnoresRequestedHeaderValueWhenTooLong
  );
  await runTest(
    "CORS preflight helper accepts requested-header values at length limit",
    testHandlePreflightAcceptsRequestedHeaderValueAtLengthLimit
  );
  await runTest(
    "CORS preflight helper keeps valid requested-header values when others are too long",
    testHandlePreflightKeepsValidRequestedHeaderValuesWhenSomeAreTooLong
  );
  await runTest(
    "CORS preflight helper falls back when merged allow-headers would be too long",
    testHandlePreflightFallsBackWhenMergedAllowHeadersWouldBeTooLong
  );
  await runTest(
    "CORS preflight helper accepts merged allow-headers at length limit",
    testHandlePreflightAcceptsMergedAllowHeadersAtLengthLimit
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
    "CORS preflight helper falls back to configured allow headers when requested headers are invalid",
    testHandlePreflightFallsBackToConfiguredHeadersWhenRequestedHeadersInvalid
  );
  await runTest(
    "CORS preflight helper appends Vary dimensions to existing Vary header",
    testHandlePreflightAppendsVaryDimensionsToExistingHeader
  );
  await runTest(
    "CORS preflight helper avoids duplicate Vary dimensions",
    testHandlePreflightAvoidsDuplicateVaryDimensions
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
