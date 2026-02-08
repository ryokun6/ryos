#!/usr/bin/env bun
/**
 * Tests for shared push token normalization helper.
 */

import { normalizePushToken } from "../src/utils/pushToken";
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
  const minToken = "a".repeat(20);
  const maxToken = "b".repeat(512);
  const tooShort = "c".repeat(19);
  const tooLong = "d".repeat(513);
  const invalidCharacter = `${"e".repeat(30)}/${"f".repeat(30)}`;

  assertEq(normalizePushToken(minToken), minToken);
  assertEq(normalizePushToken(maxToken), maxToken);
  assertEq(normalizePushToken(tooShort), null);
  assertEq(normalizePushToken(tooLong), null);
  assertEq(normalizePushToken(invalidCharacter), null);
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
