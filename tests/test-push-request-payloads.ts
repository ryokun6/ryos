#!/usr/bin/env bun
/**
 * Tests for register/unregister request payload normalization helpers.
 */

import {
  normalizeRegisterPushPayload,
  normalizeUnregisterPushPayload,
} from "../_api/push/_request-payloads";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

const VALID_TOKEN =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

async function testRegisterPayloadValidation() {
  const missingToken = normalizeRegisterPushPayload({});
  assertEq(missingToken.ok, false);
  if (!missingToken.ok) {
    assertEq(missingToken.error, "Push token is required");
  }

  const invalidTokenType = normalizeRegisterPushPayload({
    token: 123,
  });
  assertEq(invalidTokenType.ok, false);
  if (!invalidTokenType.ok) {
    assertEq(invalidTokenType.error, "Invalid push token format");
  }

  const blankToken = normalizeRegisterPushPayload({
    token: "   ",
  });
  assertEq(blankToken.ok, false);
  if (!blankToken.ok) {
    assertEq(blankToken.error, "Push token is required");
  }

  const invalidPlatform = normalizeRegisterPushPayload({
    token: VALID_TOKEN,
    platform: "web",
  });
  assertEq(invalidPlatform.ok, false);
  if (!invalidPlatform.ok) {
    assertEq(invalidPlatform.error, "Unsupported push platform");
  }

  const invalidPlatformType = normalizeRegisterPushPayload({
    token: VALID_TOKEN,
    platform: 123,
  });
  assertEq(invalidPlatformType.ok, false);
  if (!invalidPlatformType.ok) {
    assertEq(invalidPlatformType.error, "Unsupported push platform");
  }
}

async function testRegisterPayloadSuccessNormalization() {
  const normalized = normalizeRegisterPushPayload({
    token: `  ${VALID_TOKEN}  `,
    platform: " IOS ",
  });
  assertEq(normalized.ok, true);
  if (!normalized.ok) return;

  assertEq(normalized.value.token, VALID_TOKEN);
  assertEq(normalized.value.platform, "ios");

  const defaultPlatform = normalizeRegisterPushPayload({
    token: VALID_TOKEN,
  });
  assertEq(defaultPlatform.ok, true);
  if (!defaultPlatform.ok) return;
  assertEq(defaultPlatform.value.platform, "ios");
}

async function testUnregisterPayloadValidation() {
  const invalidType = normalizeUnregisterPushPayload({
    token: 123,
  });
  assertEq(invalidType.ok, false);
  if (!invalidType.ok) {
    assertEq(invalidType.error, "Invalid push token format");
  }

  const blankToken = normalizeUnregisterPushPayload({
    token: "   ",
  });
  assertEq(blankToken.ok, false);
  if (!blankToken.ok) {
    assertEq(blankToken.error, "Invalid push token format");
  }
}

async function testUnregisterPayloadSuccessModes() {
  const allTokensMode = normalizeUnregisterPushPayload({});
  assertEq(allTokensMode.ok, true);
  if (!allTokensMode.ok) return;
  assertEq(allTokensMode.value.token, undefined);

  const singleTokenMode = normalizeUnregisterPushPayload({
    token: ` ${VALID_TOKEN} `,
  });
  assertEq(singleTokenMode.ok, true);
  if (!singleTokenMode.ok) return;
  assertEq(singleTokenMode.value.token, VALID_TOKEN);
}

export async function runPushRequestPayloadTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-request-payloads"));
  clearResults();

  await runTest("Register payload validation errors", testRegisterPayloadValidation);
  await runTest(
    "Register payload success normalization",
    testRegisterPayloadSuccessNormalization
  );
  await runTest("Unregister payload validation errors", testUnregisterPayloadValidation);
  await runTest("Unregister payload success modes", testUnregisterPayloadSuccessModes);

  return printSummary();
}

if (import.meta.main) {
  runPushRequestPayloadTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
