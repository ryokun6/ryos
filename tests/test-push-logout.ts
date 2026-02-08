#!/usr/bin/env bun
/**
 * Tests for push logout token resolution helper.
 */

import {
  resolvePushTokenForLogout,
  unregisterPushTokenForLogout,
} from "../src/utils/pushLogout";
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
  const validToken = "a".repeat(64);
  const token = await resolvePushTokenForLogout({
    isTauriIOSRuntime: () => true,
    getPushTokenRuntime: async () => {
      getPushTokenCalls += 1;
      return `  ${validToken}  `;
    },
    warn: () => undefined,
  });

  assertEq(token, validToken);
  assertEq(getPushTokenCalls, 1);
}

async function testReturnsNullForBlankResolvedToken() {
  let warnCalls = 0;
  const token = await resolvePushTokenForLogout({
    isTauriIOSRuntime: () => true,
    getPushTokenRuntime: async () => "   ",
    warn: () => {
      warnCalls += 1;
    },
  });

  assertEq(token, null);
  assertEq(warnCalls, 0);
}

async function testReturnsNullAndWarnsForInvalidResolvedToken() {
  let warnCalls = 0;
  let warnedMessage = "";
  let warnedData: unknown;

  const token = await resolvePushTokenForLogout({
    isTauriIOSRuntime: () => true,
    getPushTokenRuntime: async () => "invalid/token",
    warn: (message, data) => {
      warnCalls += 1;
      warnedMessage = message;
      warnedData = data;
    },
  });

  assertEq(token, null);
  assertEq(warnCalls, 1);
  assertEq(
    warnedMessage,
    "[ChatsStore] Ignoring invalid iOS push token during logout resolution:"
  );
  assertEq(
    JSON.stringify(warnedData),
    JSON.stringify({ tokenLength: "invalid/token".length })
  );
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

async function testUnregisterSkipsWhenTokenMissing() {
  let fetchCalls = 0;
  await unregisterPushTokenForLogout("user", "token", null, {
    fetchRuntime: async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    },
    getApiUrlRuntime: (path) => path,
    warn: () => undefined,
  });

  assertEq(fetchCalls, 0);
}

async function testUnregisterSendsScopedTokenRequest() {
  let fetchCalls = 0;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const pushToken = "a".repeat(64);

  await unregisterPushTokenForLogout("example-user", "auth-token", pushToken, {
    fetchRuntime: async (url, init) => {
      fetchCalls += 1;
      requestUrl = String(url);
      requestInit = init;
      return new Response(null, { status: 200 });
    },
    getApiUrlRuntime: () => "https://api.example.test/api/push/unregister",
    warn: () => undefined,
  });

  assertEq(fetchCalls, 1);
  assertEq(requestUrl, "https://api.example.test/api/push/unregister");
  assertEq(requestInit?.method, "POST");
  assertEq(
    JSON.stringify(requestInit?.headers),
    JSON.stringify({
      "Content-Type": "application/json",
      Authorization: "Bearer auth-token",
      "X-Username": "example-user",
    })
  );
  assertEq(requestInit?.body, JSON.stringify({ token: pushToken }));
}

async function testUnregisterWarnsWhenFetchFails() {
  const expectedError = new Error("network down");
  let warnCalls = 0;
  let warnedMessage = "";
  let warnedError: unknown;

  await unregisterPushTokenForLogout("example-user", "auth-token", "a".repeat(64), {
    fetchRuntime: async () => {
      throw expectedError;
    },
    getApiUrlRuntime: (path) => path,
    warn: (message, error) => {
      warnCalls += 1;
      warnedMessage = message;
      warnedError = error;
    },
  });

  assertEq(warnCalls, 1);
  assertEq(
    warnedMessage,
    "[ChatsStore] Failed to unregister iOS push token during logout:"
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
    "Push logout resolver returns null and logs for invalid token format",
    testReturnsNullAndWarnsForInvalidResolvedToken
  );
  await runTest(
    "Push logout resolver returns null and logs on resolution errors",
    testReturnsNullAndWarnsOnResolutionError
  );
  await runTest(
    "Push logout unregister skips network call without token",
    testUnregisterSkipsWhenTokenMissing
  );
  await runTest(
    "Push logout unregister sends token-scoped request payload",
    testUnregisterSendsScopedTokenRequest
  );
  await runTest(
    "Push logout unregister warns on network failures",
    testUnregisterWarnsWhenFetchFails
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
