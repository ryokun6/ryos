#!/usr/bin/env bun
/**
 * Parity checks between frontend push-token normalization
 * and backend push-token validation.
 */

import { isValidPushToken } from "../_api/push/_shared";
import {
  normalizePushToken,
  PUSH_TOKEN_MAX_LENGTH,
  PUSH_TOKEN_MIN_LENGTH,
} from "../src/utils/pushToken";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

const SAMPLE_VALUES: unknown[] = [
  "a".repeat(PUSH_TOKEN_MIN_LENGTH),
  "b".repeat(PUSH_TOKEN_MAX_LENGTH),
  "A1:_-.".repeat(4) + "c".repeat(10),
  "d".repeat(PUSH_TOKEN_MIN_LENGTH - 1),
  "e".repeat(PUSH_TOKEN_MAX_LENGTH + 1),
  "invalid/token",
  "invalid token",
  "  f".repeat(20),
  `  ${"g".repeat(64)}  `,
  "π-token-" + "h".repeat(20),
  "",
  "   ",
  undefined,
  null,
  123,
];

const ALLOWED_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:_-.";
const INVALID_CHARS = ["/", " ", "\t", "\n", "@", ",", "π"];

async function testNormalizedTokensAlwaysPassBackendValidator() {
  for (const value of SAMPLE_VALUES) {
    const normalized = normalizePushToken(value);
    if (!normalized) continue;
    assertEq(isValidPushToken(normalized), true);
  }
}

async function testCanonicalStringInputsMatchBackendValidation() {
  for (const value of SAMPLE_VALUES) {
    if (typeof value !== "string") continue;
    if (value !== value.trim()) continue;

    const normalized = normalizePushToken(value);
    assertEq(
      normalized !== null,
      isValidPushToken(value),
      `Mismatch for canonical token value: "${value}"`
    );
  }
}

async function testGeneratedAllowedTokensMatchBackendValidation() {
  for (
    let length = PUSH_TOKEN_MIN_LENGTH;
    length <= 120;
    length += 10
  ) {
    let token = "";
    for (let index = 0; index < length; index += 1) {
      token += ALLOWED_CHARS[(length + index) % ALLOWED_CHARS.length];
    }

    const normalized = normalizePushToken(token);
    assertEq(normalized, token);
    assertEq(isValidPushToken(token), true);
  }
}

async function testGeneratedInvalidTokensMatchBackendValidation() {
  for (const invalidChar of INVALID_CHARS) {
    const token = `validprefix${invalidChar}${"a".repeat(25)}`;
    const normalized = normalizePushToken(token);
    assertEq(normalized, null);
    assertEq(isValidPushToken(token), false);
  }
}

export async function runPushTokenParityTests(): Promise<{
  passed: number;
  failed: number;
}> {
  console.log(section("push-token-parity"));
  clearResults();

  await runTest(
    "Normalized frontend tokens always pass backend validation",
    testNormalizedTokensAlwaysPassBackendValidator
  );
  await runTest(
    "Canonical token strings match frontend/backend validation parity",
    testCanonicalStringInputsMatchBackendValidation
  );
  await runTest(
    "Generated allowed tokens match backend validation",
    testGeneratedAllowedTokensMatchBackendValidation
  );
  await runTest(
    "Generated invalid tokens match backend validation",
    testGeneratedInvalidTokensMatchBackendValidation
  );

  return printSummary();
}

if (import.meta.main) {
  runPushTokenParityTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
