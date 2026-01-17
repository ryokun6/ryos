#!/usr/bin/env bun
/**
 * Tests for /api/share-applet endpoint
 * Tests: CRUD operations for applets, authentication, authorization
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
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.1.${Date.now() % 255}.${Math.floor(Math.random() * 255)}` },
    body: JSON.stringify({
      username: testUsername,
      password: "testpassword123",
    }),
  });
  
  const data = await res.json();

  if (res.status === 201) {
    if (!data.token) {
      throw new Error(`No token in response: ${JSON.stringify(data)}`);
    }
    testToken = data.token;
    return;
  }

  if (res.status === 409) {
    const loginRes = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUsername,
        password: "testpassword123",
      }),
    });

    if (loginRes.status === 200) {
      const loginData = await loginRes.json();
      testToken = loginData.token;
      return;
    }
  }

  if (res.status === 429) {
    console.log("  ⚠️  Test user setup rate-limited; skipping authenticated share-applet tests");
    return;
  }

  throw new Error(`Failed to create user: ${res.status} - ${JSON.stringify(data)}`);
}

// ============================================================================
// Test Functions
// ============================================================================

async function testMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/share-applet`, {
    method: "PUT",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/share-applet`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testGetMissingId(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/share-applet`);
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("id"), "Expected error about missing id");
}

async function testGetNonExistentApplet(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/share-applet?id=nonexistent12345`
  );
  assertEq(res.status, 404, `Expected 404, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("not found"), "Expected not found error");
}

async function testPostWithoutAuth(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/share-applet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: "<html><body>Test</body></html>",
      title: "Test Applet",
    }),
  });
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testPostWithInvalidAuth(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/share-applet`,
    "invalid_user",
    "invalid_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "<html><body>Test</body></html>",
        title: "Test Applet",
      }),
    }
  );
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testPostMissingContent(): Promise<void> {
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (test user not set up)");
    return;
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/api/share-applet`,
    testUsername,
    testToken,
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
    console.log("  ⚠️  Skipped (test user not set up)");
    return;
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/api/share-applet`,
    testUsername,
    testToken,
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
  const data = await res.json();
  assert(data.id, "Expected applet id in response");
  assert(data.shareUrl, "Expected shareUrl in response");
  testAppletId = data.id;
}

async function testGetAppletSuccess(): Promise<void> {
  if (!testAppletId) {
    console.log("  ⚠️  Skipped (test applet not created)");
    return;
  }
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/share-applet?id=${testAppletId}`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.content, "Expected content in response");
  assert(data.title === "Test Applet Title", "Expected matching title");
  assert(data.icon === "game", "Expected matching icon");
  assert(data.createdBy?.toLowerCase() === testUsername?.toLowerCase(), "Expected matching creator");
}

async function testListApplets(): Promise<void> {
  if (!testAppletId) {
    console.log("  ⚠️  Skipped (test applet not created)");
    return;
  }
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/share-applet?list=true`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.applets), "Expected applets array");
  const found = data.applets.some((a: { id: string }) => a.id === testAppletId);
  assert(found, "Expected test applet in list");
}

async function testUpdateApplet(): Promise<void> {
  if (!testToken || !testUsername || !testAppletId) {
    console.log("  ⚠️  Skipped (test data not set up)");
    return;
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/api/share-applet`,
    testUsername,
    testToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "<html><body><h1>Updated Test Applet</h1></body></html>",
        title: "Updated Title",
        shareId: testAppletId,
      }),
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assertEq(data.id, testAppletId, "Expected same applet id");
  assertEq(data.updated, true, "Expected updated flag");
}

async function testUpdateByNonOwner(): Promise<void> {
  if (!testAppletId) {
    console.log("  ⚠️  Skipped (test applet not created)");
    return;
  }
  const otherUsername = `ouser${Date.now()}`;
  const createRes = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: otherUsername,
      password: "testpassword123",
    }),
  });
  
  if (createRes.status !== 201) {
    throw new Error("Failed to create other user");
  }
  
  const userData = await createRes.json();
  const otherToken = userData.token;
  
  const res = await fetchWithAuth(
    `${BASE_URL}/api/share-applet`,
    otherUsername,
    otherToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "<html><body>Hacked!</body></html>",
        shareId: testAppletId,
      }),
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.id !== testAppletId, "Should create new applet, not update existing");
}

async function testDeleteWithoutAuth(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/share-applet?id=someid`,
    { method: "DELETE" }
  );
  // Admin endpoints return 403 (Forbidden) when no auth is provided
  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
}

async function testDeleteByNonAdmin(): Promise<void> {
  if (!testToken || !testUsername || !testAppletId) {
    console.log("  ⚠️  Skipped (test data not set up)");
    return;
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/api/share-applet?id=${testAppletId}`,
    testUsername,
    testToken,
    { method: "DELETE" }
  );
  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
}

async function testPatchWithoutAuth(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/share-applet?id=someid`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featured: true }),
    }
  );
  // Admin endpoints return 403 (Forbidden) when no auth is provided
  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
}

async function testPatchByNonAdmin(): Promise<void> {
  if (!testToken || !testUsername || !testAppletId) {
    console.log("  ⚠️  Skipped (test data not set up)");
    return;
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/api/share-applet?id=${testAppletId}`,
    testUsername,
    testToken,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featured: true }),
    }
  );
  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
}

async function testDeleteWithInvalidToken(): Promise<void> {
  if (!testAppletId) {
    console.log("  ⚠️  Skipped (test applet ID not set up)");
    return;
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/api/share-applet?id=${testAppletId}`,
    "ryo",
    "invalid_token_12345",
    { method: "DELETE" }
  );
  assertEq(res.status, 403, `Expected 403 for invalid token, got ${res.status}`);
}

async function testPatchWithInvalidToken(): Promise<void> {
  if (!testAppletId) {
    console.log("  ⚠️  Skipped (test applet ID not set up)");
    return;
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/api/share-applet?id=${testAppletId}`,
    "ryo",
    "invalid_token_12345",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featured: true }),
    }
  );
  assertEq(res.status, 403, `Expected 403 for invalid token, got ${res.status}`);
}

// ============================================================================
// Main
// ============================================================================

export async function runShareAppletTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("share-applet"));
  clearResults();

  console.log("\n  Setup\n");
  await runTest("Create test user", setupTestUser);

  console.log("\n  HTTP Methods\n");
  await runTest("PUT method not allowed", testMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testOptionsRequest);

  console.log("\n  GET Operations\n");
  await runTest("GET - missing id parameter", testGetMissingId);
  await runTest("GET - non-existent applet", testGetNonExistentApplet);

  console.log("\n  POST Operations\n");
  await runTest("POST - without auth", testPostWithoutAuth);
  await runTest("POST - with invalid auth", testPostWithInvalidAuth);
  await runTest("POST - missing content", testPostMissingContent);
  await runTest("POST - success (create)", testPostSuccess);
  await runTest("GET - created applet", testGetAppletSuccess);
  await runTest("GET - list applets", testListApplets);
  await runTest("POST - update applet (by owner)", testUpdateApplet);
  await runTest("POST - update by non-owner (should create new)", testUpdateByNonOwner);

  console.log("\n  DELETE Operations\n");
  await runTest("DELETE - without auth", testDeleteWithoutAuth);
  await runTest("DELETE - by non-admin", testDeleteByNonAdmin);
  await runTest("DELETE - with invalid token (forbidden)", testDeleteWithInvalidToken);

  console.log("\n  PATCH Operations\n");
  await runTest("PATCH - without auth", testPatchWithoutAuth);
  await runTest("PATCH - by non-admin", testPatchByNonAdmin);
  await runTest("PATCH - with invalid token (forbidden)", testPatchWithInvalidToken);

  return printSummary();
}

if (import.meta.main) {
  runShareAppletTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
