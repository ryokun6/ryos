#!/usr/bin/env bun
/**
 * Tests for shared push-token format module.
 */

import {
  isPushTokenFormat,
  normalizePushTokenValue,
  PUSH_TOKEN_MAX_LENGTH,
  PUSH_TOKEN_MIN_LENGTH,
} from "../shared/pushToken";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

async function testSharedTokenFormatBounds() {
  const minToken = "a".repeat(PUSH_TOKEN_MIN_LENGTH);
  const maxToken = "b".repeat(PUSH_TOKEN_MAX_LENGTH);
  const tooShort = "c".repeat(PUSH_TOKEN_MIN_LENGTH - 1);
  const tooLong = "d".repeat(PUSH_TOKEN_MAX_LENGTH + 1);
  const invalidCharacter = `${"e".repeat(30)}/${"f".repeat(30)}`;

  assertEq(isPushTokenFormat(minToken), true);
  assertEq(isPushTokenFormat(maxToken), true);
  assertEq(isPushTokenFormat(tooShort), false);
  assertEq(isPushTokenFormat(tooLong), false);
  assertEq(isPushTokenFormat(invalidCharacter), false);
}

async function testSharedTokenNormalizer() {
  const validToken = "a".repeat(64);
  assertEq(normalizePushTokenValue(validToken), validToken);
  assertEq(normalizePushTokenValue(`  ${validToken}  `), validToken);
  assertEq(normalizePushTokenValue(undefined), null);
  assertEq(normalizePushTokenValue(null), null);
  assertEq(normalizePushTokenValue(""), null);
  assertEq(normalizePushTokenValue("   "), null);
  assertEq(normalizePushTokenValue("invalid/token"), null);
}

export async function runPushTokenSharedTests(): Promise<{
  passed: number;
  failed: number;
}> {
  console.log(section("push-token-shared"));
  clearResults();

  await runTest(
    "Shared push-token format enforces bounds and charset",
    testSharedTokenFormatBounds
  );
  await runTest(
    "Shared push-token normalizer trims and validates values",
    testSharedTokenNormalizer
  );

  return printSummary();
}

if (import.meta.main) {
  runPushTokenSharedTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
