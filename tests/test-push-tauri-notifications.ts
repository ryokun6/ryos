#!/usr/bin/env bun
/**
 * Tests for tauri push-notification utility helpers.
 */

import {
  extractNormalizedPushToken,
  extractPushAlert,
  normalizeInvokedPushToken,
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
