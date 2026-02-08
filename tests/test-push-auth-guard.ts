#!/usr/bin/env bun
/**
 * Tests for shared push auth guard helpers.
 */

import {
  extractPushAuthCredentialsOrRespond,
  validatePushAuthOrRespond,
} from "../_api/push/_auth-guard";
import {
  assertEq,
  clearResults,
  createMockVercelResponseHarness,
  printSummary,
  runTest,
  section,
} from "./test-utils";

interface MockLogger {
  logger: { response: (statusCode: number, duration?: number) => void };
  responseCalls: Array<{ statusCode: number; duration?: number }>;
}

interface FakeAuthRedis {
  exists: (key: string) => Promise<number>;
  expire: (key: string, ttl: number) => Promise<number>;
  get: (key: string) => Promise<unknown>;
}

function createMockLogger(): MockLogger {
  const responseCalls: Array<{ statusCode: number; duration?: number }> = [];

  return {
    logger: {
      response: (statusCode: number, duration?: number) => {
        responseCalls.push({ statusCode, duration });
      },
    },
    responseCalls,
  };
}

function createFakeAuthRedis(
  existsResult: number,
  options?: { throwOnGet?: boolean }
): {
  redis: FakeAuthRedis;
  existsCalls: string[];
  expireCalls: string[];
  getCallCount: () => number;
} {
  const existsCalls: string[] = [];
  const expireCalls: string[] = [];
  let getCallCount = 0;

  return {
    redis: {
      exists: async (key: string) => {
        existsCalls.push(key);
        return existsResult;
      },
      expire: async (key: string) => {
        expireCalls.push(key);
        return 1;
      },
      get: async () => {
        getCallCount += 1;
        if (options?.throwOnGet) {
          throw new Error("Unexpected grace-token lookup");
        }
        return null;
      },
    },
    existsCalls,
    expireCalls,
    getCallCount: () => getCallCount,
  };
}

async function testExtractAuthMissingCredentialsResponse() {
  const mockRes = createMockVercelResponseHarness();
  const mockLogger = createMockLogger();

  const credentials = extractPushAuthCredentialsOrRespond(
    {
      origin: "http://localhost:3000",
    },
    mockRes.res,
    mockLogger.logger,
    Date.now()
  );

  assertEq(credentials, null);
  assertEq(mockRes.getStatusCode(), 401);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Unauthorized - missing credentials" })
  );
  assertEq(mockLogger.responseCalls.length, 1);
  assertEq(mockLogger.responseCalls[0].statusCode, 401);
}

async function testExtractAuthReturnsNormalizedCredentials() {
  const mockRes = createMockVercelResponseHarness();
  const mockLogger = createMockLogger();

  const credentials = extractPushAuthCredentialsOrRespond(
    {
      authorization: "bearer token-123",
      "x-username": "  ExampleUser  ",
    },
    mockRes.res,
    mockLogger.logger,
    Date.now()
  );

  assertEq(credentials?.username, "exampleuser");
  assertEq(credentials?.token, "token-123");
  assertEq(mockRes.getStatusCode(), 0);
  assertEq(mockLogger.responseCalls.length, 0);
}

async function testExtractAuthSupportsArrayHeaders() {
  const mockRes = createMockVercelResponseHarness();
  const mockLogger = createMockLogger();

  const credentials = extractPushAuthCredentialsOrRespond(
    {
      authorization: ["Bearer first-token", "Bearer ignored-token"],
      "x-username": ["ArrayUser", "ignored-user"],
    },
    mockRes.res,
    mockLogger.logger,
    Date.now()
  );

  assertEq(credentials?.username, "arrayuser");
  assertEq(credentials?.token, "first-token");
  assertEq(mockRes.getStatusCode(), 0);
  assertEq(mockLogger.responseCalls.length, 0);
}

async function testExtractAuthRejectsBlankBearerToken() {
  const mockRes = createMockVercelResponseHarness();
  const mockLogger = createMockLogger();

  const credentials = extractPushAuthCredentialsOrRespond(
    {
      authorization: "Bearer     ",
      "x-username": "valid-user",
    },
    mockRes.res,
    mockLogger.logger,
    Date.now()
  );

  assertEq(credentials, null);
  assertEq(mockRes.getStatusCode(), 401);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Unauthorized - missing credentials" })
  );
  assertEq(mockLogger.responseCalls.length, 1);
  assertEq(mockLogger.responseCalls[0].statusCode, 401);
}

async function testExtractAuthRejectsMissingUsernameWithBearerToken() {
  const mockRes = createMockVercelResponseHarness();
  const mockLogger = createMockLogger();

  const credentials = extractPushAuthCredentialsOrRespond(
    {
      authorization: "Bearer token-123",
      "x-username": "   ",
    },
    mockRes.res,
    mockLogger.logger,
    Date.now()
  );

  assertEq(credentials, null);
  assertEq(mockRes.getStatusCode(), 401);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Unauthorized - missing credentials" })
  );
  assertEq(mockLogger.responseCalls.length, 1);
  assertEq(mockLogger.responseCalls[0].statusCode, 401);
}

async function testExtractAuthRejectsInvalidAuthorizationScheme() {
  const mockRes = createMockVercelResponseHarness();
  const mockLogger = createMockLogger();

  const credentials = extractPushAuthCredentialsOrRespond(
    {
      authorization: "Basic token-123",
      "x-username": "valid-user",
    },
    mockRes.res,
    mockLogger.logger,
    Date.now()
  );

  assertEq(credentials, null);
  assertEq(mockRes.getStatusCode(), 401);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Unauthorized - missing credentials" })
  );
  assertEq(mockLogger.responseCalls.length, 1);
  assertEq(mockLogger.responseCalls[0].statusCode, 401);
}

async function testExtractAuthUsesFirstNonEmptyArrayHeaderValues() {
  const mockRes = createMockVercelResponseHarness();
  const mockLogger = createMockLogger();

  const credentials = extractPushAuthCredentialsOrRespond(
    {
      authorization: ["   ", "Bearer token-from-second"],
      "x-username": ["   ", "SecondUser"],
    },
    mockRes.res,
    mockLogger.logger,
    Date.now()
  );

  assertEq(credentials?.username, "seconduser");
  assertEq(credentials?.token, "token-from-second");
  assertEq(mockRes.getStatusCode(), 0);
  assertEq(mockLogger.responseCalls.length, 0);
}

async function testValidateAuthRejectsInvalidToken() {
  const mockRes = createMockVercelResponseHarness();
  const mockLogger = createMockLogger();
  const { redis, existsCalls, expireCalls, getCallCount } = createFakeAuthRedis(0);

  const isValid = await validatePushAuthOrRespond(
    redis as Parameters<typeof validatePushAuthOrRespond>[0],
    { username: "user", token: "invalid-token" },
    mockRes.res,
    mockLogger.logger,
    Date.now()
  );

  assertEq(isValid, false);
  assertEq(mockRes.getStatusCode(), 401);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Unauthorized - invalid token" })
  );
  assertEq(existsCalls.length, 1);
  assertEq(expireCalls.length, 0);
  assertEq(getCallCount(), 0);
  assertEq(mockLogger.responseCalls.length, 1);
  assertEq(mockLogger.responseCalls[0].statusCode, 401);
}

async function testValidateAuthAcceptsValidTokenAndRefreshesTtl() {
  const mockRes = createMockVercelResponseHarness();
  const mockLogger = createMockLogger();
  const { redis, existsCalls, expireCalls, getCallCount } = createFakeAuthRedis(1);

  const isValid = await validatePushAuthOrRespond(
    redis as Parameters<typeof validatePushAuthOrRespond>[0],
    { username: "user", token: "valid-token" },
    mockRes.res,
    mockLogger.logger,
    Date.now()
  );

  assertEq(isValid, true);
  assertEq(existsCalls.length, 1);
  assertEq(existsCalls[0].includes(":user:user:"), true);
  assertEq(expireCalls.length, 1);
  assertEq(getCallCount(), 0);
  assertEq(mockRes.getStatusCode(), 0);
  assertEq(mockLogger.responseCalls.length, 0);
}

async function testValidateAuthNormalizesUsernameBeforeLookup() {
  const mockRes = createMockVercelResponseHarness();
  const mockLogger = createMockLogger();
  const { redis, existsCalls } = createFakeAuthRedis(1);

  const isValid = await validatePushAuthOrRespond(
    redis as Parameters<typeof validatePushAuthOrRespond>[0],
    { username: "MixedUser", token: "valid-token" },
    mockRes.res,
    mockLogger.logger,
    Date.now()
  );

  assertEq(isValid, true);
  assertEq(existsCalls.length, 1);
  assertEq(existsCalls[0].includes(":user:mixeduser:"), true);
}

async function testValidateAuthSkipsGraceLookupPath() {
  const mockRes = createMockVercelResponseHarness();
  const mockLogger = createMockLogger();
  const { redis, getCallCount } = createFakeAuthRedis(0, { throwOnGet: true });

  const isValid = await validatePushAuthOrRespond(
    redis as Parameters<typeof validatePushAuthOrRespond>[0],
    { username: "user", token: "expired-token" },
    mockRes.res,
    mockLogger.logger,
    Date.now()
  );

  assertEq(isValid, false);
  assertEq(getCallCount(), 0);
}

export async function runPushAuthGuardTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-auth-guard"));
  clearResults();

  await runTest(
    "Push auth guard rejects missing credentials",
    testExtractAuthMissingCredentialsResponse
  );
  await runTest(
    "Push auth guard extracts normalized credentials",
    testExtractAuthReturnsNormalizedCredentials
  );
  await runTest(
    "Push auth guard supports array header values",
    testExtractAuthSupportsArrayHeaders
  );
  await runTest(
    "Push auth guard rejects blank bearer token payload",
    testExtractAuthRejectsBlankBearerToken
  );
  await runTest(
    "Push auth guard rejects missing username even with bearer token",
    testExtractAuthRejectsMissingUsernameWithBearerToken
  );
  await runTest(
    "Push auth guard rejects non-bearer authorization schemes",
    testExtractAuthRejectsInvalidAuthorizationScheme
  );
  await runTest(
    "Push auth guard uses first non-empty array header values",
    testExtractAuthUsesFirstNonEmptyArrayHeaderValues
  );
  await runTest(
    "Push auth guard rejects invalid redis token lookup",
    testValidateAuthRejectsInvalidToken
  );
  await runTest(
    "Push auth guard accepts valid token and refreshes TTL",
    testValidateAuthAcceptsValidTokenAndRefreshesTtl
  );
  await runTest(
    "Push auth guard lowercases username for token lookup",
    testValidateAuthNormalizesUsernameBeforeLookup
  );
  await runTest(
    "Push auth guard skips grace-token lookup path",
    testValidateAuthSkipsGraceLookupPath
  );

  return printSummary();
}

if (import.meta.main) {
  runPushAuthGuardTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
