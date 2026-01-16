#!/usr/bin/env bun
/**
 * Tests for new REST API endpoints
 */

import {
  BASE_URL,
  runTest,
  assert,
  assertEq,
  printSummary,
  clearResults,
  fetchWithOrigin,
  section,
} from "./test-utils";

// Test data
let testToken: string | null = null;
let testUsername: string | null = null;
let testRoomId: string | null = null;

// Admin credentials
const ADMIN_USERNAME = "ryo";
const ADMIN_PASSWORD = "testtest";
let adminToken: string | null = null;

// ============================================================================
// Auth Tests
// ============================================================================

async function testAuthRegister(): Promise<void> {
  testUsername = `testuser_${Date.now()}`;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: testUsername,
      password: "testpassword123",
    }),
  });
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(data.data?.user?.username === testUsername.toLowerCase(), "Expected username match");
  assert(data.data?.token, "Expected token in response");
  testToken = data.data.token;
}

async function testAuthRegisterMissingPassword(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "testuser_nopwd" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testAuthRegisterShortPassword(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "testuser_short", password: "123" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testAuthLogin(): Promise<void> {
  if (!testUsername) throw new Error("testUsername not set");
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: testUsername,
      password: "testpassword123",
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(data.data?.token, "Expected token in response");
}

async function testAuthLoginInvalidPassword(): Promise<void> {
  if (!testUsername) throw new Error("testUsername not set");
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: testUsername,
      password: "wrongpassword",
    }),
  });
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testAuthVerify(): Promise<void> {
  if (!testUsername || !testToken) throw new Error("testUsername or testToken not set");
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/verify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${testToken}`,
      "X-Username": testUsername,
    },
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(data.data?.valid === true, "Expected valid: true");
}

async function testAuthPassword(): Promise<void> {
  if (!testUsername || !testToken) throw new Error("testUsername or testToken not set");
  
  // Check password status
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/password`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${testToken}`,
      "X-Username": testUsername,
    },
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(data.data?.hasPassword === true, "Expected hasPassword: true");
}

async function testAuthRefresh(): Promise<void> {
  if (!testUsername || !testToken) throw new Error("testUsername or testToken not set");
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: testUsername,
      token: testToken,
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(data.data?.token, "Expected new token in response");
  testToken = data.data.token;
}

// ============================================================================
// Room Tests
// ============================================================================

async function testGetRooms(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(Array.isArray(data.data?.rooms), "Expected rooms array");
}

async function testGetRoomsWithUsername(): Promise<void> {
  if (!testUsername) throw new Error("testUsername not set");
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms?username=${testUsername}`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(Array.isArray(data.data?.rooms), "Expected rooms array");
}

async function testAdminLogin(): Promise<void> {
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
    adminToken = data.data?.token;
    assert(adminToken !== null, "Expected admin token");
  } else {
    // If admin doesn't exist, create them
    const createRes = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
    });
    if (createRes.status === 201 || createRes.status === 200) {
      const data = await createRes.json();
      adminToken = data.data?.token;
    }
  }
}

async function testCreatePublicRoomRequiresAdmin(): Promise<void> {
  if (!testUsername || !testToken) throw new Error("testUsername or testToken not set");
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testToken}`,
      "X-Username": testUsername,
    },
    body: JSON.stringify({
      type: "public",
      name: "test-public-room",
    }),
  });
  // Non-admin should not be able to create public rooms
  assertEq(res.status, 403, `Expected 403 for non-admin, got ${res.status}`);
}

async function testCreatePublicRoomAsAdmin(): Promise<void> {
  if (!adminToken) {
    console.log("  (skipped - no admin token)");
    return;
  }
  
  const roomName = `test-room-${Date.now()}`;
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
      "X-Username": ADMIN_USERNAME,
    },
    body: JSON.stringify({
      type: "public",
      name: roomName,
    }),
  });
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(data.data?.room?.id, "Expected room id");
  testRoomId = data.data.room.id;
}

async function testGetRoomMessages(): Promise<void> {
  if (!testRoomId) {
    console.log("  (skipped - no test room)");
    return;
  }
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/messages`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(Array.isArray(data.data?.messages), "Expected messages array");
}

async function testSendMessage(): Promise<void> {
  if (!testRoomId || !testUsername || !testToken) {
    console.log("  (skipped - no test room or auth)");
    return;
  }
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testToken}`,
      "X-Username": testUsername,
    },
    body: JSON.stringify({
      content: "Test message from new API",
    }),
  });
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(data.data?.message?.id, "Expected message id");
}

// ============================================================================
// User Tests
// ============================================================================

async function testSearchUsers(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/users?search=test`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(Array.isArray(data.data?.users), "Expected users array");
}

async function testGetCurrentUser(): Promise<void> {
  if (!testUsername || !testToken) throw new Error("testUsername or testToken not set");
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/users/me`, {
    headers: {
      Authorization: `Bearer ${testToken}`,
      "X-Username": testUsername,
    },
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(data.data?.user?.username === testUsername.toLowerCase(), "Expected username match");
}

// ============================================================================
// Admin Tests
// ============================================================================

async function testAdminStats(): Promise<void> {
  if (!adminToken) {
    console.log("  (skipped - no admin token)");
    return;
  }
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/admin/stats`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "X-Username": ADMIN_USERNAME,
    },
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(typeof data.data?.users === "number", "Expected users count");
}

async function testAdminListUsers(): Promise<void> {
  if (!adminToken) {
    console.log("  (skipped - no admin token)");
    return;
  }
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/admin/user`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "X-Username": ADMIN_USERNAME,
    },
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(Array.isArray(data.data?.users), "Expected users array");
}

// ============================================================================
// Applet Tests
// ============================================================================

async function testListApplets(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applets?list=true`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(Array.isArray(data.data?.applets), "Expected applets array");
}

// ============================================================================
// Cleanup
// ============================================================================

async function testAuthLogout(): Promise<void> {
  if (!testUsername || !testToken) throw new Error("testUsername or testToken not set");
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testToken}`,
      "X-Username": testUsername,
    },
    body: JSON.stringify({ all: false }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
}

// ============================================================================
// Main
// ============================================================================

export async function runNewApiTests(): Promise<{ passed: number; failed: number }> {
  clearResults();
  console.log("\n🧪 Testing New REST API Endpoints\n");
  console.log(`Base URL: ${BASE_URL}\n`);

  // Auth tests
  section("Auth API");
  await runTest("POST /api/auth/register - create user", testAuthRegister);
  await runTest("POST /api/auth/register - missing password", testAuthRegisterMissingPassword);
  await runTest("POST /api/auth/register - short password", testAuthRegisterShortPassword);
  await runTest("POST /api/auth/login - valid credentials", testAuthLogin);
  await runTest("POST /api/auth/login - invalid password", testAuthLoginInvalidPassword);
  await runTest("POST /api/auth/verify - valid token", testAuthVerify);
  await runTest("GET /api/auth/password - check status", testAuthPassword);
  await runTest("POST /api/auth/refresh - refresh token", testAuthRefresh);

  // Admin login (needed for some tests)
  section("Admin Setup");
  await runTest("Admin login", testAdminLogin);

  // Room tests
  section("Rooms API");
  await runTest("GET /api/rooms - list rooms", testGetRooms);
  await runTest("GET /api/rooms - with username", testGetRoomsWithUsername);
  await runTest("POST /api/rooms - public room requires admin", testCreatePublicRoomRequiresAdmin);
  await runTest("POST /api/rooms - create public room as admin", testCreatePublicRoomAsAdmin);
  await runTest("GET /api/rooms/:id/messages - get messages", testGetRoomMessages);
  await runTest("POST /api/rooms/:id/messages - send message", testSendMessage);

  // User tests
  section("Users API");
  await runTest("GET /api/users - search users", testSearchUsers);
  await runTest("GET /api/users/me - current user", testGetCurrentUser);

  // Admin tests
  section("Admin API");
  await runTest("GET /api/admin/stats - system stats", testAdminStats);
  await runTest("GET /api/admin/user - list users", testAdminListUsers);

  // Applet tests
  section("Applets API");
  await runTest("GET /api/applets - list applets", testListApplets);

  // Cleanup
  section("Cleanup");
  await runTest("POST /api/auth/logout - logout", testAuthLogout);

  return printSummary();
}

// Run directly if executed as main script
if (import.meta.main) {
  runNewApiTests().catch(console.error);
}
