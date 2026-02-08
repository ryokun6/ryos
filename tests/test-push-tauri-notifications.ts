#!/usr/bin/env bun
/**
 * Tests for tauri push-notification utility helpers.
 */

import {
  extractNormalizedPushToken,
  normalizePushNotificationPayload,
  normalizePushPermissionResult,
  normalizePushRegistrationErrorPayload,
  extractPushAlert,
  normalizeInvokedPushToken,
  PUSH_REGISTRATION_ERROR_FALLBACK_MESSAGE,
  PUSH_TOKEN_UNAVAILABLE_ERROR,
} from "../src/utils/tauriPushNotifications";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

const VALID_PUSH_TOKEN = "a".repeat(64);

async function testNormalizeInvokedPushTokenAcceptsAndTrimsValidToken() {
  assertEq(normalizeInvokedPushToken(VALID_PUSH_TOKEN), VALID_PUSH_TOKEN);
  assertEq(
    normalizeInvokedPushToken(`  ${VALID_PUSH_TOKEN}  `),
    VALID_PUSH_TOKEN
  );
}

async function testNormalizeInvokedPushTokenRejectsInvalidValues() {
  const invalidValues: unknown[] = [undefined, null, "", "   ", "invalid/token", 123];

  for (const value of invalidValues) {
    let errorMessage = "";
    try {
      normalizeInvokedPushToken(value);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    assertEq(errorMessage, PUSH_TOKEN_UNAVAILABLE_ERROR);
  }
}

async function testExtractNormalizedPushToken() {
  assertEq(extractNormalizedPushToken({ token: VALID_PUSH_TOKEN }), VALID_PUSH_TOKEN);
  assertEq(
    extractNormalizedPushToken({ token: `  ${VALID_PUSH_TOKEN}  ` }),
    VALID_PUSH_TOKEN
  );
  assertEq(extractNormalizedPushToken({ token: "invalid/token" }), null);
  assertEq(extractNormalizedPushToken({ token: "" }), null);
  assertEq(extractNormalizedPushToken({}), null);
  assertEq(extractNormalizedPushToken(undefined), null);
}

async function testNormalizePushPermissionResult() {
  assertEq(
    JSON.stringify(normalizePushPermissionResult({ granted: true })),
    JSON.stringify({ granted: true })
  );
  assertEq(
    JSON.stringify(normalizePushPermissionResult({ granted: false })),
    JSON.stringify({ granted: false })
  );
  assertEq(
    JSON.stringify(normalizePushPermissionResult({})),
    JSON.stringify({ granted: false })
  );
  assertEq(
    JSON.stringify(normalizePushPermissionResult({ granted: "true" })),
    JSON.stringify({ granted: false })
  );
  assertEq(
    JSON.stringify(normalizePushPermissionResult({ granted: 1 })),
    JSON.stringify({ granted: false })
  );
  assertEq(
    JSON.stringify(normalizePushPermissionResult("bad")),
    JSON.stringify({ granted: false })
  );
}

async function testNormalizePushNotificationPayload() {
  const normalizedObject = normalizePushNotificationPayload({
    aps: { alert: "hello" },
    extra: "value",
  });
  assertEq(
    JSON.stringify(normalizedObject),
    JSON.stringify({ aps: { alert: "hello" }, extra: "value" })
  );

  assertEq(JSON.stringify(normalizePushNotificationPayload("bad")), JSON.stringify({}));
  assertEq(JSON.stringify(normalizePushNotificationPayload(null)), JSON.stringify({}));
  assertEq(JSON.stringify(normalizePushNotificationPayload([])), JSON.stringify({}));
  assertEq(
    JSON.stringify(normalizePushNotificationPayload(new Date("2026-01-01T00:00:00.000Z"))),
    JSON.stringify({})
  );

  const nullPrototypePayload = Object.create(null) as Record<string, unknown>;
  nullPrototypePayload.aps = { alert: "from-null-prototype" };
  assertEq(
    JSON.stringify(normalizePushNotificationPayload(nullPrototypePayload)),
    JSON.stringify({ aps: { alert: "from-null-prototype" } })
  );
}

async function testNormalizePushRegistrationErrorPayload() {
  assertEq(
    JSON.stringify(normalizePushRegistrationErrorPayload({ message: "native failure" })),
    JSON.stringify({ message: "native failure" })
  );
  assertEq(
    JSON.stringify(normalizePushRegistrationErrorPayload({ message: "   trimmed message   " })),
    JSON.stringify({ message: "trimmed message" })
  );
  assertEq(
    JSON.stringify(normalizePushRegistrationErrorPayload({ message: "   " })),
    JSON.stringify({ message: PUSH_REGISTRATION_ERROR_FALLBACK_MESSAGE })
  );
  assertEq(
    JSON.stringify(normalizePushRegistrationErrorPayload({ message: 123 })),
    JSON.stringify({ message: PUSH_REGISTRATION_ERROR_FALLBACK_MESSAGE })
  );
  assertEq(
    JSON.stringify(normalizePushRegistrationErrorPayload("bad")),
    JSON.stringify({ message: PUSH_REGISTRATION_ERROR_FALLBACK_MESSAGE })
  );

  const nullPrototypePayload = Object.create(null) as Record<string, unknown>;
  nullPrototypePayload.message = "null-prototype-message";
  assertEq(
    JSON.stringify(normalizePushRegistrationErrorPayload(nullPrototypePayload)),
    JSON.stringify({ message: "null-prototype-message" })
  );
  assertEq(
    JSON.stringify(
      normalizePushRegistrationErrorPayload(new Date("2026-01-01T00:00:00.000Z"))
    ),
    JSON.stringify({ message: PUSH_REGISTRATION_ERROR_FALLBACK_MESSAGE })
  );
}

async function testExtractPushAlert() {
  assertEq(
    JSON.stringify(extractPushAlert({ aps: { alert: "Hello world" } })),
    JSON.stringify({ title: "Notification", body: "Hello world" })
  );
  assertEq(
    JSON.stringify(
      extractPushAlert({ aps: { alert: { title: "Title", body: "Body" } } })
    ),
    JSON.stringify({ title: "Title", body: "Body" })
  );
  assertEq(
    JSON.stringify(extractPushAlert({ aps: { alert: { body: "Body only" } } })),
    JSON.stringify({ title: "Notification", body: "Body only" })
  );
  assertEq(
    JSON.stringify(extractPushAlert({ aps: { alert: { title: "Title only" } } })),
    JSON.stringify({ title: "Title only", body: "" })
  );
  assertEq(
    JSON.stringify(
      extractPushAlert({
        aps: {
          alert: {
            title: 123 as unknown as string,
            body: false as unknown as string,
          },
        },
      })
    ),
    JSON.stringify({ title: "Notification", body: "" })
  );
  assertEq(
    JSON.stringify(
      extractPushAlert({ aps: { alert: 123 as unknown as string } })
    ),
    JSON.stringify({ title: "Notification", body: "" })
  );
  assertEq(
    JSON.stringify(extractPushAlert({})),
    JSON.stringify({ title: "Notification", body: "" })
  );
}

export async function runPushTauriNotificationsTests(): Promise<{
  passed: number;
  failed: number;
}> {
  console.log(section("push-tauri-notifications"));
  clearResults();

  await runTest(
    "Tauri push helper normalizes invoked push tokens",
    testNormalizeInvokedPushTokenAcceptsAndTrimsValidToken
  );
  await runTest(
    "Tauri push helper rejects invalid invoked push tokens",
    testNormalizeInvokedPushTokenRejectsInvalidValues
  );
  await runTest(
    "Tauri push helper normalizes token payloads",
    testExtractNormalizedPushToken
  );
  await runTest(
    "Tauri push helper normalizes permission payloads",
    testNormalizePushPermissionResult
  );
  await runTest(
    "Tauri push helper normalizes notification payload shapes",
    testNormalizePushNotificationPayload
  );
  await runTest(
    "Tauri push helper normalizes registration-error payloads",
    testNormalizePushRegistrationErrorPayload
  );
  await runTest("Tauri push helper extracts alert payloads", testExtractPushAlert);

  return printSummary();
}

if (import.meta.main) {
  runPushTauriNotificationsTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
