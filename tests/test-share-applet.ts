#!/usr/bin/env bun
/**
 * Tests for /api/applets endpoint
 */

import {
  BASE_URL,
  runTest,
  assert,
  assertEq,
  printSummary,
  clearResults,
  fetchWithOrigin,
  fetchWithAuth,
  section,
} from "./test-utils";

// Store test data between tests
let testAppletId: string | null = null;
let testToken: string | null = null;
let testUsername: string | null = null;

// ============================================================================
// Setup: Create test user
// ============================================================================

async function setupTestUser(): Promise<void> {
  testUsername = `tuser${Date.now()}`;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: testUsername,
      password: "testpassword123",
    }),
  });

  const payload = await res.json();
  const data = payload.data || payload;

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Failed to create user: ${res.status} - ${JSON.stringify(payload)}`);
  }

  if (!data.token) {
    throw new Error(`No token in response: ${JSON.stringify(payload)}`);
  }
  testToken = data.token;
  testUsername = data.user?.username || testUsername;
}

// ============================================================================
// Test Functions
// ============================================================================

async function testMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applets`, {
    method: "PUT",
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applets`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testGetNonExistentApplet(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/applets/nonexistent12345`
  );
  assertEq(res.status, 404, `Expected 404, got ${res.status}`);
}

async function testPostWithoutAuth(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: "<html><body>Test</body></html>",
      title: "Test Applet",
    }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testPostWithInvalidAuth(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/applets`,
    "invalid_token",
    "invalid_user",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "<html><body>Test</body></html>",
        title: "Test Applet",
      }),
    }
  );
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testPostMissingContent(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("Test user not set up");
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/api/applets`,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Applet",
      }),
    }
  );
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testPostSuccess(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("Test user not set up");
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/api/applets`,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "<html><body><h1>Test Applet</h1></body></html>",
        title: "Test Applet Title",
        icon: "game",
        name: "test-applet",
        windowWidth: 800,
        windowHeight: 600,
      }),
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(data.id, "Expected applet id in response");
  assert(data.shareUrl, "Expected shareUrl in response");
  testAppletId = data.id;
}

async function testGetAppletSuccess(): Promise<void> {
  if (!testAppletId) {
    throw new Error("Test applet not created");
  }
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/applets/${testAppletId}`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(data.content, "Expected content in response");
  assert(data.title === "Test Applet Title", "Expected matching title");
  assert(data.icon === "game", "Expected matching icon");
  assert(data.createdBy?.toLowerCase() === testUsername?.toLowerCase(), "Expected matching creator");
}

async function testListApplets(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/applets?list=true`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(Array.isArray(data.applets), "Expected applets array");
  const found = data.applets.some((a: { id: string }) => a.id === testAppletId);
  assert(found, "Expected test applet in list");
}

async function testUpdateApplet(): Promise<void> {
  if (!testToken || !testUsername || !testAppletId) {
    throw new Error("Test data not set up");
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/api/applets`,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shareId: testAppletId,
        content: "<html><body><h1>Updated Test Applet</h1></body></html>",
        title: "Updated Title",
        icon: "game",
        name: "test-applet",
        windowWidth: 800,
        windowHeight: 600,
      }),
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(data.updated === true, "Expected updated true");
}

// ============================================================================
// Main
// ============================================================================

export async function runShareAppletTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("applets"));
  clearResults();

  console.log("\n  Setup\n");
  await runTest("Setup test user", setupTestUser);

  console.log("\n  Applet endpoints\n");
  await runTest("PUT /api/applets (method not allowed)", testMethodNotAllowed);
  await runTest("OPTIONS /api/applets", testOptionsRequest);
  await runTest("GET /api/applets/:id (missing)", testGetNonExistentApplet);
  await runTest("POST /api/applets without auth", testPostWithoutAuth);
  await runTest("POST /api/applets with invalid auth", testPostWithInvalidAuth);
  await runTest("POST /api/applets missing content", testPostMissingContent);
  await runTest("POST /api/applets success", testPostSuccess);
  await runTest("GET /api/applets/:id success", testGetAppletSuccess);
  await runTest("GET /api/applets?list=true", testListApplets);
  await runTest("POST /api/applets update", testUpdateApplet);

  return printSummary();
}

// Run if executed directly
if (import.meta.main) {
  runShareAppletTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
