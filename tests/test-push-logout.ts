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

async function testReturnsNullAndWarnsOnResolutionTimeout() {
  let warnCalls = 0;
  let warnedMessage = "";
  let warnedError: unknown;

  const token = await resolvePushTokenForLogout({
    isTauriIOSRuntime: () => true,
    getPushTokenRuntime: () => new Promise<string>(() => undefined),
    tokenLookupTimeoutMs: 10,
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
  assertEq(warnedError instanceof Error, true);
  if (warnedError instanceof Error) {
    assertEq(
      warnedError.message,
      "Push token lookup timed out after 10ms"
    );
  }
}

async function testTimeoutCanBeDisabledForLookup() {
  let warnCalls = 0;
  const validToken = "z".repeat(64);

  const token = await resolvePushTokenForLogout({
    isTauriIOSRuntime: () => true,
    getPushTokenRuntime: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return validToken;
    },
    tokenLookupTimeoutMs: 0,
    warn: () => {
      warnCalls += 1;
    },
  });

  assertEq(token, validToken);
  assertEq(warnCalls, 0);
}

async function testNegativeLookupTimeoutBehavesAsDisabled() {
  let warnCalls = 0;
  const validToken = "y".repeat(64);

  const token = await resolvePushTokenForLogout({
    isTauriIOSRuntime: () => true,
    getPushTokenRuntime: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return validToken;
    },
    tokenLookupTimeoutMs: -1,
    warn: () => {
      warnCalls += 1;
    },
  });

  assertEq(token, validToken);
  assertEq(warnCalls, 0);
}

async function testUnregisterSkipsWhenTokenMissing() {
  let fetchCalls = 0;
  let warnCalls = 0;
  await unregisterPushTokenForLogout("user", "token", null, {
    fetchRuntime: async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    },
    getApiUrlRuntime: (path) => path,
    warn: () => {
      warnCalls += 1;
    },
  });

  assertEq(fetchCalls, 0);
  assertEq(warnCalls, 0);
}

async function testUnregisterSendsScopedTokenRequest() {
  let fetchCalls = 0;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const pushToken = "a".repeat(64);

  await unregisterPushTokenForLogout("  example-user  ", "  auth-token  ", `  ${pushToken}  `, {
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

async function testUnregisterSkipsWhenAuthContextMissing() {
  let fetchCalls = 0;
  let warnCalls = 0;
  let warnedMessage = "";

  await unregisterPushTokenForLogout("   ", "token", "a".repeat(64), {
    fetchRuntime: async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    },
    getApiUrlRuntime: (path) => path,
    warn: (message) => {
      warnCalls += 1;
      warnedMessage = message;
    },
  });

  assertEq(fetchCalls, 0);
  assertEq(warnCalls, 1);
  assertEq(
    warnedMessage,
    "[ChatsStore] Skipping push unregister during logout due to missing auth context"
  );
}

async function testUnregisterSkipsWhenAuthTokenMissing() {
  let fetchCalls = 0;
  let warnCalls = 0;
  let warnedMessage = "";

  await unregisterPushTokenForLogout("user", "   ", "a".repeat(64), {
    fetchRuntime: async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    },
    getApiUrlRuntime: (path) => path,
    warn: (message) => {
      warnCalls += 1;
      warnedMessage = message;
    },
  });

  assertEq(fetchCalls, 0);
  assertEq(warnCalls, 1);
  assertEq(
    warnedMessage,
    "[ChatsStore] Skipping push unregister during logout due to missing auth context"
  );
}

async function testUnregisterSkipsAndWarnsForInvalidToken() {
  let fetchCalls = 0;
  let warnCalls = 0;
  let warnedMessage = "";
  let warnedData: unknown;

  await unregisterPushTokenForLogout("user", "token", "invalid/token", {
    fetchRuntime: async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    },
    getApiUrlRuntime: (path) => path,
    warn: (message, data) => {
      warnCalls += 1;
      warnedMessage = message;
      warnedData = data;
    },
  });

  assertEq(fetchCalls, 0);
  assertEq(warnCalls, 1);
  assertEq(
    warnedMessage,
    "[ChatsStore] Skipping push unregister during logout due to invalid token format"
  );
  assertEq(
    JSON.stringify(warnedData),
    JSON.stringify({ tokenLength: "invalid/token".length })
  );
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

async function testUnregisterWarnsWhenResponseIsNotOk() {
  let warnCalls = 0;
  let warnedMessage = "";
  let warnedData: unknown;

  await unregisterPushTokenForLogout("example-user", "auth-token", "a".repeat(64), {
    fetchRuntime: async () => new Response(null, { status: 401 }),
    getApiUrlRuntime: (path) => path,
    warn: (message, data) => {
      warnCalls += 1;
      warnedMessage = message;
      warnedData = data;
    },
  });

  assertEq(warnCalls, 1);
  assertEq(
    warnedMessage,
    "[ChatsStore] Push unregister during logout returned non-OK response:"
  );
  assertEq(JSON.stringify(warnedData), JSON.stringify({ status: 401 }));
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
    "Push logout resolver returns null and logs on resolution timeout",
    testReturnsNullAndWarnsOnResolutionTimeout
  );
  await runTest(
    "Push logout resolver supports disabling lookup timeout",
    testTimeoutCanBeDisabledForLookup
  );
  await runTest(
    "Push logout resolver treats negative timeout as disabled",
    testNegativeLookupTimeoutBehavesAsDisabled
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
    "Push logout unregister skips request when auth context is missing",
    testUnregisterSkipsWhenAuthContextMissing
  );
  await runTest(
    "Push logout unregister skips request when auth token is missing",
    testUnregisterSkipsWhenAuthTokenMissing
  );
  await runTest(
    "Push logout unregister skips and warns for invalid token format",
    testUnregisterSkipsAndWarnsForInvalidToken
  );
  await runTest(
    "Push logout unregister warns on network failures",
    testUnregisterWarnsWhenFetchFails
  );
  await runTest(
    "Push logout unregister warns on non-OK responses",
    testUnregisterWarnsWhenResponseIsNotOk
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
