#!/usr/bin/env bun
/**
 * Tests for push endpoint shared helpers.
 */

import {
  extractAuthFromHeaders,
  extractBearerToken,
  extractTokenMetadataOwner,
  getOptionalTrimmedString,
  parseStoredPushTokens,
  getPushTokenSuffix,
  getRequestBodyObject,
  getTokenMetaKey,
  getUserTokensKey,
  isTokenMetadataOwnedByUser,
  isRedisPositiveCount,
  isPushPlatform,
  isValidPushToken,
  normalizePushPlatform,
  normalizeRedisNonNegativeCount,
  normalizeUsername,
} from "../_api/push/_shared";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

async function testTokenValidation() {
  const valid = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const invalidShort = "abc123";
  const invalidChars = "abc$%^012345678901234567890";

  assertEq(isValidPushToken(valid), true, "Expected long APNs token to be valid");
  assertEq(isValidPushToken(invalidShort), false, "Expected short token to be invalid");
  assertEq(isValidPushToken(invalidChars), false, "Expected token with symbols to be invalid");
}

async function testKeyGeneration() {
  assertEq(getUserTokensKey("ryo"), "push:user:ryo:tokens");
  assertEq(getTokenMetaKey("token123"), "push:token:token123");
  assertEq(getPushTokenSuffix("abcdef0123"), "cdef0123");
  assertEq(getPushTokenSuffix("abcdef0123", 4), "0123");
  assertEq(getPushTokenSuffix("abc", 10), "abc");
  assertEq(getPushTokenSuffix("", 4), "");
  assertEq(getPushTokenSuffix("abc", 0), "");
}

async function testUsernameNormalization() {
  assertEq(normalizeUsername("  Alice "), "alice");
  assertEq(normalizeUsername(""), null);
  assertEq(normalizeUsername(undefined), null);
}

async function testBearerTokenExtraction() {
  assertEq(extractBearerToken("Bearer abc.def"), "abc.def");
  assertEq(extractBearerToken("Bearer      token-value    "), "token-value");
  assertEq(extractBearerToken("Bearer\t\ttab-token"), "tab-token");
  assertEq(extractBearerToken("bearer lower-case-token"), "lower-case-token");
  assertEq(extractBearerToken("  BEARER   mixed-case-token  "), "mixed-case-token");
  assertEq(extractBearerToken("Bearer"), null);
  assertEq(extractBearerToken("Bearer    "), null);
  assertEq(extractBearerToken("Basic abc"), null);
  assertEq(extractBearerToken(undefined), null);
}

async function testAuthExtractionFromHeaders() {
  const auth = extractAuthFromHeaders({
    authorization: "Bearer token-123",
    "x-username": "  UserOne  ",
  });
  assertEq(auth.token, "token-123");
  assertEq(auth.username, "userone");

  const authFromArrayHeaders = extractAuthFromHeaders({
    authorization: ["Bearer token-from-array", "Bearer ignored"],
    "x-username": ["ARRAYUSER"],
  });
  assertEq(authFromArrayHeaders.token, "token-from-array");
  assertEq(authFromArrayHeaders.username, "arrayuser");

  const lowerCaseAuth = extractAuthFromHeaders({
    authorization: "   bearer token-lower",
    "x-username": "LowerUser",
  });
  assertEq(lowerCaseAuth.token, "token-lower");
  assertEq(lowerCaseAuth.username, "loweruser");
}

async function testRedisPositiveCountHelper() {
  assertEq(isRedisPositiveCount(1n), true);
  assertEq(isRedisPositiveCount(0n), false);
  assertEq(isRedisPositiveCount(BigInt(Number.MAX_SAFE_INTEGER) + 1n), false);
  assertEq(isRedisPositiveCount(1), true);
  assertEq(isRedisPositiveCount(1.5), false);
  assertEq(isRedisPositiveCount(2), true);
  assertEq(isRedisPositiveCount(0), false);
  assertEq(isRedisPositiveCount(-1), false);
  assertEq(isRedisPositiveCount("1"), true);
  assertEq(isRedisPositiveCount(" 2 "), true);
  assertEq(isRedisPositiveCount("0.5"), false);
  assertEq(isRedisPositiveCount("0"), false);
  assertEq(isRedisPositiveCount("not-a-number"), false);
  assertEq(isRedisPositiveCount(""), false);
  assertEq(isRedisPositiveCount(Number.POSITIVE_INFINITY), false);
  assertEq(isRedisPositiveCount(true), true);
  assertEq(isRedisPositiveCount(false), false);
  assertEq(isRedisPositiveCount(null), false);
  assertEq(isRedisPositiveCount(undefined), false);
  assertEq(isRedisPositiveCount({}), false);
  assertEq(isRedisPositiveCount([]), false);
}

async function testNormalizeRedisNonNegativeCountHelper() {
  assertEq(normalizeRedisNonNegativeCount(2), 2);
  assertEq(normalizeRedisNonNegativeCount(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assertEq(normalizeRedisNonNegativeCount(Number.MAX_SAFE_INTEGER + 1), 0);
  assertEq(normalizeRedisNonNegativeCount("3"), 3);
  assertEq(normalizeRedisNonNegativeCount("9007199254740993"), 0);
  assertEq(normalizeRedisNonNegativeCount(4n), 4);
  assertEq(normalizeRedisNonNegativeCount(true), 1);
  assertEq(normalizeRedisNonNegativeCount(false), 0);

  assertEq(normalizeRedisNonNegativeCount(-1), 0);
  assertEq(normalizeRedisNonNegativeCount("-2"), 0);
  assertEq(normalizeRedisNonNegativeCount(1.5), 0);
  assertEq(normalizeRedisNonNegativeCount("1.5"), 0);
  assertEq(normalizeRedisNonNegativeCount("bad"), 0);
  assertEq(normalizeRedisNonNegativeCount(BigInt(Number.MAX_SAFE_INTEGER) + 1n), 0);

  assertEq(normalizeRedisNonNegativeCount(-1, 7), 7);
}

async function testPlatformValidation() {
  assertEq(isPushPlatform("ios"), true);
  assertEq(isPushPlatform("android"), true);
  assertEq(isPushPlatform("web"), false);

  assertEq(normalizePushPlatform("IOS"), "ios");
  assertEq(normalizePushPlatform(" android "), "android");
  assertEq(normalizePushPlatform("web"), null);
  assertEq(normalizePushPlatform(123), null);
}

async function testTokenMetadataOwnershipHelpers() {
  const metadata = {
    username: "  Alice  ",
    platform: "ios" as const,
    updatedAt: Date.now(),
  };

  assertEq(extractTokenMetadataOwner(metadata), "alice");
  assertEq(isTokenMetadataOwnedByUser(metadata, "alice"), true);
  assertEq(isTokenMetadataOwnedByUser(metadata, "bob"), false);
  assertEq(extractTokenMetadataOwner(null), null);
}

async function testRequestBodyObjectAndTrimHelpers() {
  const emptyFromUndefined = getRequestBodyObject(undefined);
  assertEq(emptyFromUndefined !== null, true);

  const emptyFromNull = getRequestBodyObject(null);
  assertEq(emptyFromNull !== null, true);

  const obj = getRequestBodyObject({ token: "abc" });
  assertEq(obj !== null, true);
  assertEq(obj?.token, "abc");

  const invalidArray = getRequestBodyObject(["bad"]);
  assertEq(invalidArray, null);

  const invalidString = getRequestBodyObject("bad");
  assertEq(invalidString, null);

  assertEq(getOptionalTrimmedString("  value  "), "value");
  assertEq(getOptionalTrimmedString("    "), undefined);
  assertEq(getOptionalTrimmedString(123), undefined);
}

async function testParseStoredPushTokens() {
  const validToken =
    "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const paddedValidToken = `  ${validToken}  `;
  const parsed = parseStoredPushTokens([
    validToken,
    "invalid-token",
    123,
    validToken,
    paddedValidToken,
    "   ",
  ]);

  assertEq(parsed.validTokens.length, 1);
  assertEq(parsed.invalidTokensToRemove.length, 3);
  assertEq(parsed.invalidTokensToRemove.includes(paddedValidToken), true);
  assertEq(parsed.skippedNonStringCount, 1);

  const emptyParsed = parseStoredPushTokens(null);
  assertEq(emptyParsed.validTokens.length, 0);
  assertEq(emptyParsed.invalidTokensToRemove.length, 0);
  assertEq(emptyParsed.skippedNonStringCount, 0);
}

export async function runPushSharedTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-shared"));
  clearResults();

  await runTest("Push token format validator", testTokenValidation);
  await runTest("Push redis key generation", testKeyGeneration);
  await runTest("Username normalization helper", testUsernameNormalization);
  await runTest("Bearer token extraction helper", testBearerTokenExtraction);
  await runTest("Auth extraction from request headers", testAuthExtractionFromHeaders);
  await runTest("Redis positive-count helper", testRedisPositiveCountHelper);
  await runTest(
    "Redis non-negative count normalization helper",
    testNormalizeRedisNonNegativeCountHelper
  );
  await runTest("Push platform validator", testPlatformValidation);
  await runTest("Token metadata ownership helpers", testTokenMetadataOwnershipHelpers);
  await runTest("Push body/trim helper utilities", testRequestBodyObjectAndTrimHelpers);
  await runTest("Stored token parsing helper", testParseStoredPushTokens);

  return printSummary();
}

if (import.meta.main) {
  runPushSharedTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
