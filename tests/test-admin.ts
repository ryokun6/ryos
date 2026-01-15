#!/usr/bin/env bun
/**
 * Tests for /api/admin endpoints
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

// Test user for admin actions
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

  if (res.status === 200 || res.status === 201) {
    const payload = await res.json();
    const data = payload.data || payload;
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

  if (createRes.status === 200 || createRes.status === 201) {
    const payload = await createRes.json();
    const data = payload.data || payload;
    adminToken = data.token;
  } else {
    throw new Error(`Failed to setup admin auth: ${createRes.status}`);
  }
}

async function setupTestUser(): Promise<void> {
  testUsername = `testuser_${Date.now()}`;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: testUsername,
      password: "testpassword123",
    }),
  });

  assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(data.token, "Expected token for test user");
  testUserToken = data.token;
}

// ============================================================================
// Test Functions
// ============================================================================

async function testAdminGetStats(): Promise<void> {
  if (!adminToken) throw new Error("No admin token available");

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin/stats`,
    adminToken,
    ADMIN_USERNAME,
    { method: "GET" }
  );

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(typeof data.users === "number", "Expected users number");
  assert(typeof data.rooms === "number", "Expected rooms number");
  assert(typeof data.applets === "number", "Expected applets number");
}

async function testAdminGetAllUsers(): Promise<void> {
  if (!adminToken) throw new Error("No admin token available");

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin/users`,
    adminToken,
    ADMIN_USERNAME,
    { method: "GET" }
  );

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(Array.isArray(data.users), "Expected users array");
  assert(data.users.length > 0, "Expected at least one user (admin)");
}

async function testAdminGetUserDetails(): Promise<void> {
  if (!adminToken || !testUsername) throw new Error("Test setup incomplete");

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin/users/${encodeURIComponent(testUsername)}`,
    adminToken,
    ADMIN_USERNAME,
    { method: "GET" }
  );

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  const user = data.user || data;
  assert(user.username === testUsername.toLowerCase(), "Expected matching username");
}

async function testAdminGetUserMessages(): Promise<void> {
  if (!adminToken || !testUsername) throw new Error("Test setup incomplete");

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin/users/${encodeURIComponent(testUsername)}/messages?limit=10`,
    adminToken,
    ADMIN_USERNAME,
    { method: "GET" }
  );

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(Array.isArray(data.messages), "Expected messages array");
}

async function testAdminBanUser(): Promise<void> {
  if (!adminToken || !testUsername) throw new Error("Test setup incomplete");

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin/users/${encodeURIComponent(testUsername)}`,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banned: true, reason: "Test ban" }),
    }
  );

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(data.banned === true, "Expected banned true");
}

async function testAdminUnbanUser(): Promise<void> {
  if (!adminToken || !testUsername) throw new Error("Test setup incomplete");

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin/users/${encodeURIComponent(testUsername)}`,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banned: false }),
    }
  );

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(data.banned === false, "Expected banned false");
}

async function testAdminDeleteUser(): Promise<void> {
  if (!adminToken || !testUsername) throw new Error("Test setup incomplete");

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin/users/${encodeURIComponent(testUsername)}`,
    adminToken,
    ADMIN_USERNAME,
    { method: "DELETE" }
  );

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(data.success === true, "Expected success true");
}

async function testAdminDeleteAdminUser(): Promise<void> {
  if (!adminToken) throw new Error("No admin token available");

  const res = await fetchWithAuth(
    `${BASE_URL}/api/admin/users/${encodeURIComponent(ADMIN_USERNAME)}`,
    adminToken,
    ADMIN_USERNAME,
    { method: "DELETE" }
  );

  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
}

// ============================================================================
// Main
// ============================================================================

export async function runAdminTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("admin"));
  clearResults();

  console.log("\n  Setup\n");
  await runTest("Setup admin auth", setupAdminAuth);
  await runTest("Setup test user", setupTestUser);

  console.log("\n  Admin endpoints\n");
  await runTest("GET /api/admin/stats", testAdminGetStats);
  await runTest("GET /api/admin/users", testAdminGetAllUsers);
  await runTest("GET /api/admin/users/:username", testAdminGetUserDetails);
  await runTest("GET /api/admin/users/:username/messages", testAdminGetUserMessages);
  await runTest("PATCH /api/admin/users/:username (ban)", testAdminBanUser);
  await runTest("PATCH /api/admin/users/:username (unban)", testAdminUnbanUser);
  await runTest("DELETE /api/admin/users/:username", testAdminDeleteUser);
  await runTest("DELETE /api/admin/users/:username (admin forbidden)", testAdminDeleteAdminUser);

  return printSummary();
}

// Run if executed directly
if (import.meta.main) {
  runAdminTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
