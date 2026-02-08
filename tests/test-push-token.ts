#!/usr/bin/env bun
/**
 * Tests for shared push token normalization helper.
 */

import {
  normalizePushToken,
  PUSH_TOKEN_MAX_LENGTH,
  PUSH_TOKEN_MIN_LENGTH,
} from "../src/utils/pushToken";
import {
  normalizePushTokenValue,
  PUSH_TOKEN_MAX_LENGTH as SHARED_PUSH_TOKEN_MAX_LENGTH,
  PUSH_TOKEN_MIN_LENGTH as SHARED_PUSH_TOKEN_MIN_LENGTH,
} from "../shared/pushToken";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

async function testRejectsNonStringValues() {
  assertEq(normalizePushToken(undefined), null);
  assertEq(normalizePushToken(null), null);
  assertEq(normalizePushToken(123), null);
  assertEq(normalizePushToken({ token: "x" }), null);
}

async function testRejectsBlankValues() {
  assertEq(normalizePushToken(""), null);
  assertEq(normalizePushToken("   "), null);
}

async function testAcceptsAndTrimsValidValues() {
  const validToken = "a".repeat(64);
  assertEq(normalizePushToken(validToken), validToken);
  assertEq(normalizePushToken(`  ${validToken}  `), validToken);
}

async function testTokenBoundaryValidation() {
  const minToken = "a".repeat(PUSH_TOKEN_MIN_LENGTH);
  const maxToken = "b".repeat(PUSH_TOKEN_MAX_LENGTH);
  const tooShort = "c".repeat(PUSH_TOKEN_MIN_LENGTH - 1);
  const tooLong = "d".repeat(PUSH_TOKEN_MAX_LENGTH + 1);
  const invalidCharacter = `${"e".repeat(30)}/${"f".repeat(30)}`;

  assertEq(normalizePushToken(minToken), minToken);
  assertEq(normalizePushToken(maxToken), maxToken);
  assertEq(normalizePushToken(tooShort), null);
  assertEq(normalizePushToken(tooLong), null);
  assertEq(normalizePushToken(invalidCharacter), null);
}

async function testTokenAllowedCharacterSet() {
  const allowedCharsetToken = `A1:_-.${"b".repeat(30)}`;
  const normalized = normalizePushToken(allowedCharsetToken);
  assertEq(normalized, allowedCharsetToken);
}

async function testTokenRejectsWhitespaceAndUnicodeCharacters() {
  const tokenWithSpace = `abc def${"a".repeat(20)}`;
  const tokenWithTab = `abc\tdef${"b".repeat(20)}`;
  const tokenWithNewline = `abc\ndef${"c".repeat(20)}`;
  const tokenWithUnicode = `π-token-${"d".repeat(20)}`;

  assertEq(normalizePushToken(tokenWithSpace), null);
  assertEq(normalizePushToken(tokenWithTab), null);
  assertEq(normalizePushToken(tokenWithNewline), null);
  assertEq(normalizePushToken(tokenWithUnicode), null);
}

async function testSrcPushTokenExportsStayInSyncWithSharedModule() {
  assertEq(PUSH_TOKEN_MIN_LENGTH, SHARED_PUSH_TOKEN_MIN_LENGTH);
  assertEq(PUSH_TOKEN_MAX_LENGTH, SHARED_PUSH_TOKEN_MAX_LENGTH);

  const samples: unknown[] = [
    "a".repeat(PUSH_TOKEN_MIN_LENGTH),
    `  ${"b".repeat(64)}  `,
    "",
    "invalid/token",
    42,
  ];

  for (const sample of samples) {
    assertEq(normalizePushToken(sample), normalizePushTokenValue(sample));
  }
}

export async function runPushTokenTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-token"));
  clearResults();

  await runTest("Push token normalizer rejects non-string inputs", testRejectsNonStringValues);
  await runTest("Push token normalizer rejects blank values", testRejectsBlankValues);
  await runTest(
    "Push token normalizer trims and accepts valid values",
    testAcceptsAndTrimsValidValues
  );
  await runTest(
    "Push token normalizer enforces token length and charset boundaries",
    testTokenBoundaryValidation
  );
  await runTest(
    "Push token normalizer accepts allowed punctuation characters",
    testTokenAllowedCharacterSet
  );
  await runTest(
    "Push token normalizer rejects whitespace and unicode characters",
    testTokenRejectsWhitespaceAndUnicodeCharacters
  );
  await runTest(
    "Push token src exports stay in sync with shared module",
    testSrcPushTokenExportsStayInSyncWithSharedModule
  );

  return printSummary();
}

if (import.meta.main) {
  runPushTokenTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
