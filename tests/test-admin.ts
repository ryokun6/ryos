#!/usr/bin/env bun
/**
 * Tests for /api/admin endpoint
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

// Admin user credentials for dev testing
const ADMIN_USERNAME = "ryo";
const ADMIN_PASSWORD = "testtest";
let adminToken: string | null = null;

// Test user for deletion tests
let testUserToken: string | null = null;
let testUsername: string | null = null;

// ============================================================================
// Setup Functions
// ============================================================================

async function setupAdminAuth(): Promise<void> {
  // Try to authenticate as admin
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    }),
  });

  if (res.status === 200) {
    const data = await res.json();
    assert(data.token, "Expected token for admin user");
    adminToken = data.token;
    return;
  }

  // Try to create admin user
  const createRes = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    }),
  });

  if (createRes.status === 201) {
    const createData = await createRes.json();
    adminToken = createData.token;
    return;
  }

  if (createRes.status === 409) {
    console.log("  ⚠️  Admin user exists with a different password; skipping admin-auth tests");
    return;
  }

  if (createRes.status === 429) {
    console.log("  ⚠️  Admin user setup rate-limited; skipping admin-auth tests");
    return;
  }

  throw new Error(`Failed to setup admin auth: ${createRes.status}`);
}

async function setupTestUser(): Promise<void> {
  testUsername = `testuser_${Date.now()}`;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.0.${Date.now() % 255}.${Math.floor(Math.random() * 255)}` },
    body: JSON.stringify({
      username: testUsername,
      password: "testpassword123",
    }),
  });

  if (res.status === 201) {
    const data = await res.json();
    assert(data.token, "Expected token for test user");
    testUserToken = data.token;
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
      const data = await loginRes.json();
      testUserToken = data.token;
      return;
    }
  }

  if (res.status === 429) {
    console.log("  ⚠️  Test user setup rate-limited; skipping non-admin user tests");
    return;
  }

  throw new Error(`Expected 201 when creating test user, got ${res.status}`);
}

// ============================================================================
// Test Functions
// ============================================================================

async function testAdminGetStats(): Promise<void> {
  if (!adminToken) {
    console.log("  ⚠️  Skipped (no admin token available)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin?action=getStats`,
    ADMIN_USERNAME,
    adminToken,
    { method: "GET" }
  );

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(typeof data.totalUsers === "number", "Expected totalUsers number");
  assert(typeof data.totalRooms === "number", "Expected totalRooms number");
  assert(typeof data.totalMessages === "number", "Expected totalMessages number");
  assert(data.totalUsers >= 0, "totalUsers should be non-negative");
  assert(data.totalRooms >= 0, "totalRooms should be non-negative");
  assert(data.totalMessages >= 0, "totalMessages should be non-negative");
}

async function testAdminGetAllUsers(): Promise<void> {
  if (!adminToken) {
    console.log("  ⚠️  Skipped (no admin token available)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin?action=getAllUsers`,
    ADMIN_USERNAME,
    adminToken,
    { method: "GET" }
  );

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.users), "Expected users array");
  assert(data.users.length > 0, "Expected at least one user (admin)");
  
  // Check that admin user exists
  const adminUser = data.users.find((u: { username: string }) => 
    u.username.toLowerCase() === ADMIN_USERNAME.toLowerCase()
  );
  assert(adminUser, "Expected admin user in users list");
  assert(typeof adminUser.lastActive === "number", "Expected lastActive timestamp");
}

async function testAdminDeleteUser(): Promise<void> {
  if (!adminToken || !testUsername) {
    console.log("  ⚠️  Skipped (no admin token or test user available)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin`,
    ADMIN_USERNAME,
    adminToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deleteUser",
        targetUsername: testUsername,
      }),
    }
  );

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
}

async function testAdminDeleteUserMissingTarget(): Promise<void> {
  if (!adminToken) {
    console.log("  ⚠️  Skipped (no admin token available)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin`,
    ADMIN_USERNAME,
    adminToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deleteUser",
      }),
    }
  );

  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Target username"), "Expected target username error");
}

async function testAdminDeleteAdminUser(): Promise<void> {
  if (!adminToken) {
    console.log("  ⚠️  Skipped (no admin token available)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin`,
    ADMIN_USERNAME,
    adminToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deleteUser",
        targetUsername: ADMIN_USERNAME,
      }),
    }
  );

  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("admin"), "Expected error about deleting admin");
}

async function testAdminWithoutAuth(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/admin?action=getStats`, {
    method: "GET",
  });

  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Forbidden"), "Expected Forbidden error");
}

async function testAdminWithInvalidToken(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin?action=getStats`,
    ADMIN_USERNAME,
    "invalid_token_12345",
    { method: "GET" }
  );

  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Forbidden"), "Expected Forbidden error");
}

async function testAdminWithNonAdminUser(): Promise<void> {
  if (!testUserToken || !testUsername) {
    console.log("  ⚠️  Skipped (no test user available)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin?action=getStats`,
    testUsername,
    testUserToken,
    { method: "GET" }
  );

  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Forbidden"), "Expected Forbidden error");
}

async function testAdminInvalidAction(): Promise<void> {
  if (!adminToken) {
    console.log("  ⚠️  Skipped (no admin token available)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin?action=invalidAction`,
    ADMIN_USERNAME,
    adminToken,
    { method: "GET" }
  );

  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Invalid action"), "Expected Invalid action error");
}

async function testAdminInvalidMethod(): Promise<void> {
  if (!adminToken) {
    console.log("  ⚠️  Skipped (no admin token available)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin?action=getStats`,
    ADMIN_USERNAME,
    adminToken,
    { method: "PUT" }
  );

  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Method not allowed"), "Expected Method not allowed error");
}

// ============================================================================
// Main Test Runner
// ============================================================================

export async function runAdminTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("admin"));
  clearResults();

  try {
    // Setup
    await runTest("Setup - Admin authentication", setupAdminAuth);
    await runTest("Setup - Test user", setupTestUser);

    // Admin Access Tests
    console.log("\n  Admin Access\n");
    await runTest("GET getStats - without auth (forbidden)", testAdminWithoutAuth);
    await runTest("GET getStats - with invalid token (forbidden)", testAdminWithInvalidToken);
    await runTest("GET getStats - with non-admin user (forbidden)", testAdminWithNonAdminUser);
    await runTest("GET getStats - with admin token", testAdminGetStats);

    // Admin Operations Tests
    console.log("\n  Admin Operations\n");
    await runTest("GET getAllUsers - with admin token", testAdminGetAllUsers);
    await runTest("POST deleteUser - missing target username", testAdminDeleteUserMissingTarget);
    await runTest("POST deleteUser - try to delete admin (forbidden)", testAdminDeleteAdminUser);
    await runTest("POST deleteUser - delete test user", testAdminDeleteUser);

    // Error Cases
    console.log("\n  Error Cases\n");
    await runTest("GET invalid action", testAdminInvalidAction);
    await runTest("PUT invalid method", testAdminInvalidMethod);

    return printSummary();
  } catch (error) {
    console.error("Test suite failed:", error);
    return printSummary();
  }
}

async function main(): Promise<void> {
  await runAdminTests();
}

// Run tests if this file is executed directly
if (import.meta.main) {
  clearResults();
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

