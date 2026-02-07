#!/usr/bin/env bun
/**
 * Tests for push payload normalization and validation.
 */

import {
  DEFAULT_PUSH_TEST_BODY,
  DEFAULT_PUSH_TEST_TITLE,
  normalizePushTestPayload,
} from "../_api/push/_payload";
import {
  assert,
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

async function testDefaultsForMissingBody() {
  const fromUndefined = normalizePushTestPayload(undefined);
  assertEq(fromUndefined.ok, true);
  if (!fromUndefined.ok) return;

  assertEq(fromUndefined.value.title, DEFAULT_PUSH_TEST_TITLE);
  assertEq(fromUndefined.value.body, DEFAULT_PUSH_TEST_BODY);

  const fromEmpty = normalizePushTestPayload({});
  assertEq(fromEmpty.ok, true);
  if (!fromEmpty.ok) return;
  assertEq(fromEmpty.value.title, DEFAULT_PUSH_TEST_TITLE);
  assertEq(fromEmpty.value.body, DEFAULT_PUSH_TEST_BODY);
}

async function testRejectsNonObjectBodies() {
  const fromString = normalizePushTestPayload("nope");
  assertEq(fromString.ok, false);
  if (!fromString.ok) {
    assertEq(fromString.error, "Request body must be a JSON object");
  }

  const fromArray = normalizePushTestPayload(["bad"]);
  assertEq(fromArray.ok, false);
}

async function testRejectsInvalidStringFieldTypes() {
  const invalidTitle = normalizePushTestPayload({
    title: 123,
  });
  assertEq(invalidTitle.ok, false);
  if (!invalidTitle.ok) {
    assertEq(invalidTitle.error, "Title must be a string");
  }

  const invalidBody = normalizePushTestPayload({
    body: 123,
  });
  assertEq(invalidBody.ok, false);
  if (!invalidBody.ok) {
    assertEq(invalidBody.error, "Body must be a string");
  }

  const invalidSound = normalizePushTestPayload({
    sound: 123,
  });
  assertEq(invalidSound.ok, false);
  if (!invalidSound.ok) {
    assertEq(invalidSound.error, "Sound must be a string");
  }
}

async function testTrimsOptionalFields() {
  const payload = normalizePushTestPayload({
    title: "  Push title  ",
    body: "  Push body  ",
    token: "  abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789  ",
    sound: "  default  ",
  });
  assertEq(payload.ok, true);
  if (!payload.ok) return;

  assertEq(payload.value.title, "Push title");
  assertEq(payload.value.body, "Push body");
  assertEq(
    payload.value.token,
    "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
  );
  assertEq(payload.value.sound, "default");
}

async function testRejectsInvalidTokenAndBadge() {
  const blankToken = normalizePushTestPayload({
    token: "   ",
  });
  assertEq(blankToken.ok, false);
  if (!blankToken.ok) {
    assertEq(blankToken.error, "Invalid push token format");
  }

  const invalidToken = normalizePushTestPayload({
    token: "short",
  });
  assertEq(invalidToken.ok, false);
  if (!invalidToken.ok) {
    assertEq(invalidToken.error, "Invalid push token format");
  }

  const invalidBadgeType = normalizePushTestPayload({
    badge: 1.5,
  });
  assertEq(invalidBadgeType.ok, false);
  if (!invalidBadgeType.ok) {
    assertEq(invalidBadgeType.error, "Badge must be an integer");
  }

  const invalidBadgeRange = normalizePushTestPayload({
    badge: -1,
  });
  assertEq(invalidBadgeRange.ok, false);
  if (!invalidBadgeRange.ok) {
    assertEq(invalidBadgeRange.error, "Badge must be between 0 and 9999");
  }
}

async function testRejectsLongTextFields() {
  const longTitle = normalizePushTestPayload({
    title: "T".repeat(121),
  });
  assertEq(longTitle.ok, false);

  const longBody = normalizePushTestPayload({
    body: "B".repeat(513),
  });
  assertEq(longBody.ok, false);

  const longSound = normalizePushTestPayload({
    sound: "S".repeat(65),
  });
  assertEq(longSound.ok, false);
}

async function testDataPayloadValidation() {
  const nonObjectData = normalizePushTestPayload({
    data: ["not", "object"],
  });
  assertEq(nonObjectData.ok, false);
  if (!nonObjectData.ok) {
    assertEq(nonObjectData.error, "Data payload must be a JSON object");
  }

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const circularData = normalizePushTestPayload({
    data: circular,
  });
  assertEq(circularData.ok, false);
  if (!circularData.ok) {
    assertEq(circularData.error, "Data payload must be JSON serializable");
  }

  const tooLargeData = normalizePushTestPayload({
    data: {
      text: "x".repeat(3000),
    },
  });
  assertEq(tooLargeData.ok, false);
  if (!tooLargeData.ok) {
    assert(tooLargeData.error.includes("Data payload is too large"), "Expected data size error");
  }

  const validData = normalizePushTestPayload({
    data: {
      feature: "push",
      attempt: 1,
    },
  });
  assertEq(validData.ok, true);
}

export async function runPushPayloadTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-payload"));
  clearResults();

  await runTest("Push payload defaults for missing body", testDefaultsForMissingBody);
  await runTest("Push payload rejects non-object body", testRejectsNonObjectBodies);
  await runTest("Push payload rejects invalid string field types", testRejectsInvalidStringFieldTypes);
  await runTest("Push payload trims optional fields", testTrimsOptionalFields);
  await runTest("Push payload rejects invalid token and badge", testRejectsInvalidTokenAndBadge);
  await runTest("Push payload rejects overly long text fields", testRejectsLongTextFields);
  await runTest("Push payload validates data object", testDataPayloadValidation);

  return printSummary();
}

if (import.meta.main) {
  runPushPayloadTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
