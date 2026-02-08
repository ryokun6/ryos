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
const MIN_LENGTH_TOKEN = "a".repeat(20);
const MAX_LENGTH_TOKEN = "b".repeat(512);
const TOO_SHORT_TOKEN = "c".repeat(19);
const TOO_LONG_TOKEN = "d".repeat(513);
const INVALID_CHAR_TOKEN = `${"e".repeat(30)}/${"f".repeat(30)}`;

async function testRequestBodyMustBeObject() {
  const registerFromArray = normalizeRegisterPushPayload([]);
  assertEq(registerFromArray.ok, false);
  if (!registerFromArray.ok) {
    assertEq(registerFromArray.error, "Request body must be a JSON object");
  }

  const unregisterFromString = normalizeUnregisterPushPayload("bad");
  assertEq(unregisterFromString.ok, false);
  if (!unregisterFromString.ok) {
    assertEq(unregisterFromString.error, "Request body must be a JSON object");
  }
}

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

  const blankPlatform = normalizeRegisterPushPayload({
    token: VALID_TOKEN,
    platform: "   ",
  });
  assertEq(blankPlatform.ok, false);
  if (!blankPlatform.ok) {
    assertEq(blankPlatform.error, "Unsupported push platform");
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

async function testTokenFormatBoundaries() {
  const registerMin = normalizeRegisterPushPayload({
    token: MIN_LENGTH_TOKEN,
    platform: "ios",
  });
  assertEq(registerMin.ok, true);
  if (!registerMin.ok) return;
  assertEq(registerMin.value.token, MIN_LENGTH_TOKEN);

  const registerMax = normalizeRegisterPushPayload({
    token: MAX_LENGTH_TOKEN,
    platform: "ios",
  });
  assertEq(registerMax.ok, true);
  if (!registerMax.ok) return;
  assertEq(registerMax.value.token, MAX_LENGTH_TOKEN);

  const registerTooShort = normalizeRegisterPushPayload({
    token: TOO_SHORT_TOKEN,
    platform: "ios",
  });
  assertEq(registerTooShort.ok, false);
  if (!registerTooShort.ok) {
    assertEq(registerTooShort.error, "Invalid push token format");
  }

  const registerTooLong = normalizeRegisterPushPayload({
    token: TOO_LONG_TOKEN,
    platform: "ios",
  });
  assertEq(registerTooLong.ok, false);
  if (!registerTooLong.ok) {
    assertEq(registerTooLong.error, "Invalid push token format");
  }

  const registerInvalidCharacter = normalizeRegisterPushPayload({
    token: INVALID_CHAR_TOKEN,
    platform: "ios",
  });
  assertEq(registerInvalidCharacter.ok, false);
  if (!registerInvalidCharacter.ok) {
    assertEq(registerInvalidCharacter.error, "Invalid push token format");
  }

  const unregisterMin = normalizeUnregisterPushPayload({
    token: MIN_LENGTH_TOKEN,
  });
  assertEq(unregisterMin.ok, true);
  if (!unregisterMin.ok) return;
  assertEq(unregisterMin.value.token, MIN_LENGTH_TOKEN);

  const unregisterMax = normalizeUnregisterPushPayload({
    token: MAX_LENGTH_TOKEN,
  });
  assertEq(unregisterMax.ok, true);
  if (!unregisterMax.ok) return;
  assertEq(unregisterMax.value.token, MAX_LENGTH_TOKEN);

  const unregisterTooShort = normalizeUnregisterPushPayload({
    token: TOO_SHORT_TOKEN,
  });
  assertEq(unregisterTooShort.ok, false);
  if (!unregisterTooShort.ok) {
    assertEq(unregisterTooShort.error, "Invalid push token format");
  }

  const unregisterTooLong = normalizeUnregisterPushPayload({
    token: TOO_LONG_TOKEN,
  });
  assertEq(unregisterTooLong.ok, false);
  if (!unregisterTooLong.ok) {
    assertEq(unregisterTooLong.error, "Invalid push token format");
  }

  const unregisterInvalidCharacter = normalizeUnregisterPushPayload({
    token: INVALID_CHAR_TOKEN,
  });
  assertEq(unregisterInvalidCharacter.ok, false);
  if (!unregisterInvalidCharacter.ok) {
    assertEq(unregisterInvalidCharacter.error, "Invalid push token format");
  }
}

export async function runPushRequestPayloadTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-request-payloads"));
  clearResults();

  await runTest("Request payload body must be JSON object", testRequestBodyMustBeObject);
  await runTest("Register payload validation errors", testRegisterPayloadValidation);
  await runTest(
    "Register payload success normalization",
    testRegisterPayloadSuccessNormalization
  );
  await runTest("Unregister payload validation errors", testUnregisterPayloadValidation);
  await runTest("Unregister payload success modes", testUnregisterPayloadSuccessModes);
  await runTest("Push payload token format boundaries", testTokenFormatBoundaries);

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
