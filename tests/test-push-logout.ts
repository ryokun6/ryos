#!/usr/bin/env bun
/**
 * Tests for push logout token resolution helper.
 */

import { resolvePushTokenForLogout } from "../src/utils/pushLogout";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

async function testSkipsResolutionOutsideTauriIos() {
  let getPushTokenCalls = 0;
  let warnCalls = 0;

  const token = await resolvePushTokenForLogout({
    isTauriIOSRuntime: () => false,
    getPushTokenRuntime: async () => {
      getPushTokenCalls += 1;
      return "should-not-be-used";
    },
    warn: () => {
      warnCalls += 1;
    },
  });

  assertEq(token, null);
  assertEq(getPushTokenCalls, 0);
  assertEq(warnCalls, 0);
}

async function testReturnsTrimmedTokenOnIos() {
  let getPushTokenCalls = 0;
  const token = await resolvePushTokenForLogout({
    isTauriIOSRuntime: () => true,
    getPushTokenRuntime: async () => {
      getPushTokenCalls += 1;
      return "  token-123  ";
    },
    warn: () => undefined,
  });

  assertEq(token, "token-123");
  assertEq(getPushTokenCalls, 1);
}

async function testReturnsNullForBlankResolvedToken() {
  const token = await resolvePushTokenForLogout({
    isTauriIOSRuntime: () => true,
    getPushTokenRuntime: async () => "   ",
    warn: () => undefined,
  });

  assertEq(token, null);
}

async function testReturnsNullAndWarnsOnResolutionError() {
  let warnCalls = 0;
  let warnedMessage = "";
  let warnedError: unknown;
  const expectedError = new Error("push-unavailable");

  const token = await resolvePushTokenForLogout({
    isTauriIOSRuntime: () => true,
    getPushTokenRuntime: async () => {
      throw expectedError;
    },
    warn: (message, error) => {
      warnCalls += 1;
      warnedMessage = message;
      warnedError = error;
    },
  });

  assertEq(token, null);
  assertEq(warnCalls, 1);
  assertEq(
    warnedMessage,
    "[ChatsStore] Could not resolve iOS push token during logout:"
  );
  assertEq(warnedError, expectedError);
}

export async function runPushLogoutTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-logout"));
  clearResults();

  await runTest(
    "Push logout resolver skips token lookup outside Tauri iOS",
    testSkipsResolutionOutsideTauriIos
  );
  await runTest(
    "Push logout resolver returns trimmed token on iOS",
    testReturnsTrimmedTokenOnIos
  );
  await runTest(
    "Push logout resolver returns null for blank token",
    testReturnsNullForBlankResolvedToken
  );
  await runTest(
    "Push logout resolver returns null and logs on resolution errors",
    testReturnsNullAndWarnsOnResolutionError
  );

  return printSummary();
}

if (import.meta.main) {
  runPushLogoutTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
