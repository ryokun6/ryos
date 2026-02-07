#!/usr/bin/env bun
/**
 * Tests for push endpoint shared helpers.
 */

import {
  extractAuthFromHeaders,
  extractBearerToken,
  extractTokenMetadataOwner,
  getTokenMetaKey,
  getUserTokensKey,
  isTokenMetadataOwnedByUser,
  isPushPlatform,
  isValidPushToken,
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
}

async function testUsernameNormalization() {
  assertEq(normalizeUsername("  Alice "), "alice");
  assertEq(normalizeUsername(""), null);
  assertEq(normalizeUsername(undefined), null);
}

async function testBearerTokenExtraction() {
  assertEq(extractBearerToken("Bearer abc.def"), "abc.def");
  assertEq(extractBearerToken("Bearer      token-value    "), "token-value");
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
}

async function testPlatformValidation() {
  assertEq(isPushPlatform("ios"), true);
  assertEq(isPushPlatform("android"), true);
  assertEq(isPushPlatform("web"), false);
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

export async function runPushSharedTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-shared"));
  clearResults();

  await runTest("Push token format validator", testTokenValidation);
  await runTest("Push redis key generation", testKeyGeneration);
  await runTest("Username normalization helper", testUsernameNormalization);
  await runTest("Bearer token extraction helper", testBearerTokenExtraction);
  await runTest("Auth extraction from request headers", testAuthExtractionFromHeaders);
  await runTest("Push platform validator", testPlatformValidation);
  await runTest("Token metadata ownership helpers", testTokenMetadataOwnershipHelpers);

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
