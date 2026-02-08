#!/usr/bin/env bun
/**
 * Parity checks between frontend push-token normalization
 * and backend push-token validation.
 */

import { isValidPushToken } from "../_api/push/_shared";
import { normalizePushToken } from "../src/utils/pushToken";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

const SAMPLE_VALUES: unknown[] = [
  "a".repeat(20),
  "b".repeat(512),
  "A1:_-.".repeat(4) + "c".repeat(10),
  "d".repeat(19),
  "e".repeat(513),
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
