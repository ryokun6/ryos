#!/usr/bin/env bun
/**
 * Tests for shared push request guard helper.
 */

import type { VercelRequest } from "@vercel/node";
import {
  handlePushPostRequestGuards,
  PUSH_CORS_MAX_REQUESTED_HEADER_COUNT,
  PUSH_CORS_MAX_REQUESTED_HEADER_NAME_LENGTH,
} from "../_api/push/_request-guard";
import {
  assertEq,
  clearResults,
  createMockPushRequestLoggerHarness,
  createMockVercelResponseHarness,
  printSummary,
  runTest,
  section,
  withPatchedEnv,
} from "./test-utils";

const OPTIONS_VARY_HEADER =
  "Origin, Access-Control-Request-Method, Access-Control-Request-Headers";

function createMockLogger() {
  return createMockPushRequestLoggerHarness();
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
  return createRequestWithHeaders(method, { origin }, url);
}

function createRequestWithHeaders(
  method: string | undefined,
  headers: Record<string, string | string[]>,
  url?: string
): VercelRequest {
  return {
    method,
    url,
    headers,
    body: {},
  } as unknown as VercelRequest;
}

function withRuntimeEnv<T>(
  env: "development" | "preview" | "production",
  run: () => T | Promise<T>
): Promise<T> {
  return Promise.resolve(
    withPatchedEnv(
      {
        VERCEL_ENV: env,
      },
      run
    )
  );
}

function withDevelopmentEnv<T>(run: () => T | Promise<T>): Promise<T> {
  return withRuntimeEnv("development", run);
}

function withCustomRuntimeEnv<T>(
  env: string,
  run: () => T | Promise<T>
): Promise<T> {
  return Promise.resolve(
    withPatchedEnv(
      {
        VERCEL_ENV: env,
      },
      run
    )
  );
}

async function testAllowedPostContinuesWithoutHandling() {
  await withDevelopmentEnv(async () => {
    const req = createRequest("POST");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Access-Control-Allow-Methods"), "POST, OPTIONS");
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
    assertEq(mockRes.getHeader("Access-Control-Allow-Credentials"), "true");
    assertEq(mockRes.getHeader("Access-Control-Max-Age"), "86400");
    assertEq(mockRes.getHeader("Vary"), "Origin");
    assertEq(mockLogger.requestCalls.length, 1);
    assertEq(mockLogger.requestCalls[0].method, "POST");
    assertEq(mockLogger.requestCalls[0].url, "/api/push/register");
    assertEq(mockLogger.responseCalls.length, 0);
  });
}

async function testDisallowedPostIsRejected() {
  await withDevelopmentEnv(async () => {
    const req = createRequest("POST", "https://evil.example");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Vary"), "Origin");
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 403);
  });
}

async function testDisallowedPostWithRequestedHeadersIsRejectedWithoutEcho() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "POST",
      {
        origin: "https://evil.example",
        "access-control-request-headers": "x-evil-header, authorization",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Access-Control-Allow-Headers"), undefined);
    assertEq(mockRes.getHeader("Vary"), "Origin");
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 403);
  });
}

async function testDisallowedPostStillSetsAllowHeaderWhenMethodWouldBePostOnly() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "GET",
      {
        origin: "https://evil.example",
        "access-control-request-headers": "x-evil-header, authorization",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Allow"), undefined);
    assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), undefined);
    assertEq(mockRes.getHeader("Access-Control-Allow-Headers"), undefined);
    assertEq(mockRes.getHeader("Vary"), "Origin");
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 403);
  });
}

async function testAllowedOptionsPreflightHandled() {
  await withDevelopmentEnv(async () => {
    const req = createRequest("OPTIONS");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Access-Control-Allow-Methods"), "POST, OPTIONS");
    assertEq(mockRes.getHeader("Vary"), OPTIONS_VARY_HEADER);
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
    assertEq(mockRes.getHeader("Access-Control-Allow-Credentials"), "true");
    assertEq(mockRes.getHeader("Access-Control-Max-Age"), "86400");
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 204);
  });
}

async function testAllowedOptionsPreflightWithRequestedPostMethodHandled() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-method": " post ",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Vary"), OPTIONS_VARY_HEADER);
  });
}

async function testAllowedOptionsPreflightRejectsUnsupportedRequestedMethod() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-method": "DELETE",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Access-Control-Allow-Methods"), "POST, OPTIONS");
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
    assertEq(mockRes.getHeader("Access-Control-Allow-Credentials"), "true");
    assertEq(mockRes.getHeader("Access-Control-Max-Age"), "86400");
    assertEq(mockRes.getHeader("Vary"), OPTIONS_VARY_HEADER);
    assertEq(mockRes.getEndCallCount(), 0);
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 405);
  });
}

async function testAllowedOptionsPreflightEchoesRequestedHeaders() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": "x-custom-header, authorization",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Vary"), OPTIONS_VARY_HEADER);
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "x-custom-header, authorization"
    );
  });
}

async function testAllowedOptionsPreflightNormalizesRequestedHeadersList() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": " x-custom-header , , authorization ,, ",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "x-custom-header, authorization"
    );
  });
}

async function testAllowedOptionsPreflightDeduplicatesRequestedHeaders() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers":
          "x-custom-header, X-CUSTOM-HEADER, authorization, Authorization",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "x-custom-header, authorization"
    );
  });
}

async function testAllowedOptionsPreflightPreservesFirstHeaderCasingWhenDeduplicating() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers":
          "X-Custom-Header, x-custom-header, Authorization, authorization",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "X-Custom-Header, Authorization"
    );
  });
}

async function testAllowedOptionsPreflightDeduplicatesAcrossArrayHeaderValues() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": [
          "X-Custom-Header, Authorization",
          "x-custom-header, authorization, x-extra",
        ],
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "X-Custom-Header, Authorization, x-extra"
    );
  });
}

async function testAllowedOptionsPreflightFallsBackToDefaultsForEmptyRequestedHeaders() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": " ,  ,   ",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
  });
}

async function testAllowedOptionsPreflightFiltersInvalidRequestedHeaders() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers":
          "x-valid-header, invalid header, x-second-valid, bad@header",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "x-valid-header, x-second-valid"
    );
  });
}

async function testAllowedOptionsPreflightFallsBackWhenAllRequestedHeadersInvalid() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": "invalid header, bad@header",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
  });
}

async function testAllowedOptionsPreflightFiltersTooLongRequestedHeaders() {
  await withDevelopmentEnv(async () => {
    const tooLongHeader = `x-${"a".repeat(PUSH_CORS_MAX_REQUESTED_HEADER_NAME_LENGTH + 1)}`;
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": `${tooLongHeader}, x-valid-header`,
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Access-Control-Allow-Headers"), "x-valid-header");
  });
}

async function testAllowedOptionsPreflightAcceptsMaxLengthRequestedHeader() {
  await withDevelopmentEnv(async () => {
    const maxLengthHeader = `x-${"a".repeat(PUSH_CORS_MAX_REQUESTED_HEADER_NAME_LENGTH - 2)}`;
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": `${maxLengthHeader}, authorization`,
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      `${maxLengthHeader}, authorization`
    );
  });
}

async function testAllowedOptionsPreflightCapsRequestedHeaderCount() {
  await withDevelopmentEnv(async () => {
    const requestedHeaders = Array.from(
      { length: PUSH_CORS_MAX_REQUESTED_HEADER_COUNT + 10 },
      (_, index) => `x-header-${index + 1}`
    );
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": requestedHeaders.join(", "),
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      requestedHeaders.slice(0, PUSH_CORS_MAX_REQUESTED_HEADER_COUNT).join(", ")
    );
  });
}

async function testAllowedOptionsPreflightCapsRequestedHeaderCountAcrossRepeatedValues() {
  await withDevelopmentEnv(async () => {
    const firstBatch = Array.from(
      { length: 30 },
      (_, index) => `x-first-${index + 1}`
    );
    const secondBatch = Array.from(
      { length: 30 },
      (_, index) => `x-second-${index + 1}`
    );
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": [
          firstBatch.join(", "),
          secondBatch.join(", "),
        ],
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      firstBatch
        .concat(secondBatch.slice(0, PUSH_CORS_MAX_REQUESTED_HEADER_COUNT - firstBatch.length))
        .join(", ")
    );
  });
}

async function testAllowedOptionsPreflightMergesRequestedHeaderArrayValues() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": [
          "x-first, authorization",
          "x-second",
        ],
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Vary"), OPTIONS_VARY_HEADER);
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "x-first, authorization, x-second"
    );
  });
}

async function testAllowedOptionsPreflightUsesFirstNonEmptyHeaderArrayValue() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": [
          "   ",
          "x-second, authorization",
        ],
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Vary"), OPTIONS_VARY_HEADER);
    assertEq(mockRes.getHeader("Access-Control-Allow-Headers"), "x-second, authorization");
  });
}

async function testAllowedOptionsPreflightCombinesArrayValuesAfterFilteringInvalidTokens() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "http://localhost:3000",
        "access-control-request-headers": [
          "invalid header",
          "x-valid-header, authorization",
        ],
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Vary"), OPTIONS_VARY_HEADER);
    assertEq(mockRes.getHeader("Access-Control-Allow-Headers"), "x-valid-header, authorization");
  });
}

async function testDisallowedOptionsPreflightRejected() {
  await withDevelopmentEnv(async () => {
    const req = createRequest("OPTIONS", "https://evil.example");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Access-Control-Allow-Headers"), undefined);
    assertEq(mockRes.getHeader("Vary"), OPTIONS_VARY_HEADER);
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 403);
  });
}

async function testDisallowedOptionsPreflightWithRequestedHeadersRejectedWithoutEcho() {
  await withDevelopmentEnv(async () => {
    const req = createRequestWithHeaders(
      "OPTIONS",
      {
        origin: "https://evil.example",
        "access-control-request-headers": "x-evil-header, authorization",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Access-Control-Allow-Headers"), undefined);
    assertEq(mockRes.getHeader("Vary"), OPTIONS_VARY_HEADER);
    assertEq(mockRes.getEndCallCount(), 0);
  });
}

async function testUnsupportedMethodSetsAllowHeader() {
  await withDevelopmentEnv(async () => {
    const req = createRequest("GET");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Access-Control-Allow-Methods"), "POST, OPTIONS");
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-Username"
    );
    assertEq(mockRes.getHeader("Access-Control-Allow-Credentials"), "true");
    assertEq(mockRes.getHeader("Access-Control-Max-Age"), "86400");
    assertEq(mockRes.getHeader("Vary"), "Origin");
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 405);
  });
}

async function testWhitespacePaddedGetMethodTriggersMethodGuard() {
  await withDevelopmentEnv(async () => {
    const req = createRawRequest("  get  ");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Vary"), "Origin");
    assertEq(mockLogger.requestCalls.length, 1);
    assertEq(mockLogger.requestCalls[0].method, "GET");
    assertEq(mockLogger.responseCalls.length, 1);
    assertEq(mockLogger.responseCalls[0].statusCode, 405);
  });
}

async function testLowercasePostMethodIsNormalized() {
  await withDevelopmentEnv(async () => {
    const req = createRawRequest("post");
    const mockRes = createMockVercelResponseHarness();
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

async function testWhitespacePaddedPostMethodIsNormalized() {
  await withDevelopmentEnv(async () => {
    const req = createRawRequest("  post  ");
    const mockRes = createMockVercelResponseHarness();
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
    const mockRes = createMockVercelResponseHarness();
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

async function testWhitespaceOnlyMethodDefaultsToPost() {
  await withDevelopmentEnv(async () => {
    const req = createRawRequest("   ");
    const mockRes = createMockVercelResponseHarness();
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
    const mockRes = createMockVercelResponseHarness();
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

async function testWhitespacePaddedOptionsMethodHandledAsPreflight() {
  await withDevelopmentEnv(async () => {
    const req = createRawRequest("  options ");
    const mockRes = createMockVercelResponseHarness();
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
    const mockRes = createMockVercelResponseHarness();
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

async function testProductionRejectsLocalhostOrigin() {
  await withRuntimeEnv("production", async () => {
    const req = createRequest("POST", "http://localhost:3000");
    const mockRes = createMockVercelResponseHarness();
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
  });
}

async function testProductionAllowsPrimaryOrigin() {
  await withRuntimeEnv("production", async () => {
    const req = createRequest("POST", "https://os.ryo.lu");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "https://os.ryo.lu");
  });
}

async function testProductionAllowsPrimaryOriginPreflight() {
  await withRuntimeEnv("production", async () => {
    const req = createRequest("OPTIONS", "https://os.ryo.lu");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "https://os.ryo.lu");
    assertEq(mockRes.getEndCallCount(), 1);
  });
}

async function testProductionAllowsTailscaleOrigin() {
  await withRuntimeEnv("production", async () => {
    const req = createRequest("POST", "https://device.tailb4fa61.ts.net");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Origin"),
      "https://device.tailb4fa61.ts.net"
    );
  });
}

async function testPreviewAllowsProjectPreviewOrigin() {
  await withRuntimeEnv("preview", async () => {
    const req = createRequest("POST", "https://ryos-preview-123.vercel.app");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Origin"),
      "https://ryos-preview-123.vercel.app"
    );
  });
}

async function testPreviewAllowsProjectPreviewOriginPreflight() {
  await withRuntimeEnv("preview", async () => {
    const req = createRequest("OPTIONS", "https://ryos-preview-123.vercel.app");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Origin"),
      "https://ryos-preview-123.vercel.app"
    );
    assertEq(mockRes.getEndCallCount(), 1);
  });
}

async function testPreviewAllowsRyoLuPrefixOrigin() {
  await withRuntimeEnv("preview", async () => {
    const req = createRequest("POST", "https://ryo-lu-sandbox.vercel.app");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Origin"),
      "https://ryo-lu-sandbox.vercel.app"
    );
  });
}

async function testPreviewAllowsOsRyoPrefixOrigin() {
  await withRuntimeEnv("preview", async () => {
    const req = createRequest("POST", "https://os-ryo-feature.vercel.app");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Origin"),
      "https://os-ryo-feature.vercel.app"
    );
  });
}

async function testPreviewRejectsNonProjectPreviewOrigin() {
  await withRuntimeEnv("preview", async () => {
    const req = createRequest("POST", "https://other-project.vercel.app");
    const mockRes = createMockVercelResponseHarness();
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
  });
}

async function testProductionRejectsLocalhostPreflight() {
  await withRuntimeEnv("production", async () => {
    const req = createRequest("OPTIONS", "http://localhost:3000");
    const mockRes = createMockVercelResponseHarness();
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
  });
}

async function testDevelopmentAllowsConfiguredLocalhostPort() {
  await withRuntimeEnv("development", async () => {
    const req = createRequest("POST", "http://localhost:5173");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(mockRes.getHeader("Access-Control-Allow-Origin"), "http://localhost:5173");
  });
}

async function testDevelopmentRejectsUnknownLocalhostPort() {
  await withRuntimeEnv("development", async () => {
    const req = createRequest("POST", "http://localhost:8080");
    const mockRes = createMockVercelResponseHarness();
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
  });
}

async function testOriginFallbackToRefererAllowsLocalhost() {
  await withRuntimeEnv("development", async () => {
    const req = createRequestWithHeaders(
      "POST",
      { referer: "http://localhost:3000/some/path?query=1" },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
  });
}

async function testInvalidRefererOriginIsRejected() {
  await withRuntimeEnv("development", async () => {
    const req = createRequestWithHeaders(
      "POST",
      { referer: "not-a-valid-url" },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
  });
}

async function testOriginHeaderTakesPrecedenceOverRefererFallback() {
  await withRuntimeEnv("development", async () => {
    const req = createRequestWithHeaders(
      "POST",
      {
        origin: "https://evil.example",
        referer: "http://localhost:3000/safe",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
  });
}

async function testAllowedOriginIgnoresDisallowedReferer() {
  await withRuntimeEnv("development", async () => {
    const req = createRequestWithHeaders(
      "POST",
      {
        origin: "http://localhost:3000",
        referer: "https://evil.example/blocked",
      },
      "/api/push/register"
    );
    const mockRes = createMockVercelResponseHarness();
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
  });
}

async function testMissingOriginAndRefererIsRejected() {
  await withRuntimeEnv("development", async () => {
    const req = createRequestWithHeaders("POST", {}, "/api/push/register");
    const mockRes = createMockVercelResponseHarness();
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
  });
}

async function testUnknownRuntimeEnvFallsBackToDevelopmentRules() {
  await withCustomRuntimeEnv("staging", async () => {
    const req = createRequest("POST", "http://localhost:3000");
    const mockRes = createMockVercelResponseHarness();
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
  });
}

async function testTailscaleAllowedInPreviewMode() {
  await withRuntimeEnv("preview", async () => {
    const req = createRequest("POST", "https://desktop.tailb4fa61.ts.net");
    const mockRes = createMockVercelResponseHarness();
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
    assertEq(
      mockRes.getHeader("Access-Control-Allow-Origin"),
      "https://desktop.tailb4fa61.ts.net"
    );
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
    "Push request guard rejects disallowed POST without echoing requested headers",
    testDisallowedPostWithRequestedHeadersIsRejectedWithoutEcho
  );
  await runTest(
    "Push request guard does not leak Allow header on disallowed GET",
    testDisallowedPostStillSetsAllowHeaderWhenMethodWouldBePostOnly
  );
  await runTest(
    "Push request guard handles localhost preflight",
    testAllowedOptionsPreflightHandled
  );
  await runTest(
    "Push request guard handles preflight when requested method is POST",
    testAllowedOptionsPreflightWithRequestedPostMethodHandled
  );
  await runTest(
    "Push request guard rejects preflight when requested method is unsupported",
    testAllowedOptionsPreflightRejectsUnsupportedRequestedMethod
  );
  await runTest(
    "Push request guard echoes requested headers for allowed preflight",
    testAllowedOptionsPreflightEchoesRequestedHeaders
  );
  await runTest(
    "Push request guard normalizes requested preflight header list",
    testAllowedOptionsPreflightNormalizesRequestedHeadersList
  );
  await runTest(
    "Push request guard deduplicates requested preflight headers",
    testAllowedOptionsPreflightDeduplicatesRequestedHeaders
  );
  await runTest(
    "Push request guard preserves first requested-header casing on dedup",
    testAllowedOptionsPreflightPreservesFirstHeaderCasingWhenDeduplicating
  );
  await runTest(
    "Push request guard deduplicates requested headers across repeated header values",
    testAllowedOptionsPreflightDeduplicatesAcrossArrayHeaderValues
  );
  await runTest(
    "Push request guard falls back for empty requested preflight headers",
    testAllowedOptionsPreflightFallsBackToDefaultsForEmptyRequestedHeaders
  );
  await runTest(
    "Push request guard filters invalid requested preflight headers",
    testAllowedOptionsPreflightFiltersInvalidRequestedHeaders
  );
  await runTest(
    "Push request guard falls back when all requested headers are invalid",
    testAllowedOptionsPreflightFallsBackWhenAllRequestedHeadersInvalid
  );
  await runTest(
    "Push request guard filters overlong requested preflight headers",
    testAllowedOptionsPreflightFiltersTooLongRequestedHeaders
  );
  await runTest(
    "Push request guard accepts max-length requested preflight headers",
    testAllowedOptionsPreflightAcceptsMaxLengthRequestedHeader
  );
  await runTest(
    "Push request guard caps requested preflight header count",
    testAllowedOptionsPreflightCapsRequestedHeaderCount
  );
  await runTest(
    "Push request guard caps requested preflight header count across repeated values",
    testAllowedOptionsPreflightCapsRequestedHeaderCountAcrossRepeatedValues
  );
  await runTest(
    "Push request guard merges requested-header values from arrays",
    testAllowedOptionsPreflightMergesRequestedHeaderArrayValues
  );
  await runTest(
    "Push request guard uses first non-empty requested-header array value",
    testAllowedOptionsPreflightUsesFirstNonEmptyHeaderArrayValue
  );
  await runTest(
    "Push request guard combines array values after filtering invalid tokens",
    testAllowedOptionsPreflightCombinesArrayValuesAfterFilteringInvalidTokens
  );
  await runTest(
    "Push request guard rejects disallowed preflight",
    testDisallowedOptionsPreflightRejected
  );
  await runTest(
    "Push request guard rejects disallowed preflight without echoing requested headers",
    testDisallowedOptionsPreflightWithRequestedHeadersRejectedWithoutEcho
  );
  await runTest(
    "Push request guard sets Allow header for unsupported methods",
    testUnsupportedMethodSetsAllowHeader
  );
  await runTest(
    "Push request guard trims GET method before method guard",
    testWhitespacePaddedGetMethodTriggersMethodGuard
  );
  await runTest(
    "Push request guard normalizes lowercase POST method",
    testLowercasePostMethodIsNormalized
  );
  await runTest(
    "Push request guard normalizes whitespace-padded POST method",
    testWhitespacePaddedPostMethodIsNormalized
  );
  await runTest(
    "Push request guard defaults missing method to POST",
    testMissingMethodDefaultsToPost
  );
  await runTest(
    "Push request guard defaults whitespace-only method to POST",
    testWhitespaceOnlyMethodDefaultsToPost
  );
  await runTest(
    "Push request guard normalizes lowercase OPTIONS method",
    testLowercaseOptionsMethodHandledAsPreflight
  );
  await runTest(
    "Push request guard normalizes whitespace-padded OPTIONS method",
    testWhitespacePaddedOptionsMethodHandledAsPreflight
  );
  await runTest(
    "Push request guard falls back to endpoint path when URL missing",
    testMissingUrlFallsBackToEndpointPath
  );
  await runTest(
    "Push request guard rejects localhost origin in production mode",
    testProductionRejectsLocalhostOrigin
  );
  await runTest(
    "Push request guard allows primary production origin",
    testProductionAllowsPrimaryOrigin
  );
  await runTest(
    "Push request guard allows primary production preflight",
    testProductionAllowsPrimaryOriginPreflight
  );
  await runTest(
    "Push request guard allows tailscale origin in production",
    testProductionAllowsTailscaleOrigin
  );
  await runTest(
    "Push request guard allows configured preview origin",
    testPreviewAllowsProjectPreviewOrigin
  );
  await runTest(
    "Push request guard allows configured preview preflight",
    testPreviewAllowsProjectPreviewOriginPreflight
  );
  await runTest(
    "Push request guard allows ryo-lu preview prefix",
    testPreviewAllowsRyoLuPrefixOrigin
  );
  await runTest(
    "Push request guard allows os-ryo preview prefix",
    testPreviewAllowsOsRyoPrefixOrigin
  );
  await runTest(
    "Push request guard rejects unrelated preview origin",
    testPreviewRejectsNonProjectPreviewOrigin
  );
  await runTest(
    "Push request guard rejects localhost preflight in production mode",
    testProductionRejectsLocalhostPreflight
  );
  await runTest(
    "Push request guard allows configured localhost dev port",
    testDevelopmentAllowsConfiguredLocalhostPort
  );
  await runTest(
    "Push request guard rejects unknown localhost dev port",
    testDevelopmentRejectsUnknownLocalhostPort
  );
  await runTest(
    "Push request guard allows localhost via referer fallback",
    testOriginFallbackToRefererAllowsLocalhost
  );
  await runTest(
    "Push request guard rejects invalid referer fallback",
    testInvalidRefererOriginIsRejected
  );
  await runTest(
    "Push request guard prioritizes origin over referer fallback",
    testOriginHeaderTakesPrecedenceOverRefererFallback
  );
  await runTest(
    "Push request guard uses allowed origin even with disallowed referer",
    testAllowedOriginIgnoresDisallowedReferer
  );
  await runTest(
    "Push request guard rejects requests missing origin and referer",
    testMissingOriginAndRefererIsRejected
  );
  await runTest(
    "Push request guard falls back to development rules for unknown runtime env",
    testUnknownRuntimeEnvFallsBackToDevelopmentRules
  );
  await runTest(
    "Push request guard allows tailscale origin in preview mode",
    testTailscaleAllowedInPreviewMode
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
