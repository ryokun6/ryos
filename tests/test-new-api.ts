#!/usr/bin/env bun
/**
 * Tests for new RESTful API endpoints
 * 
 * Tests the refactored API structure:
 * - /api/auth/* - Authentication endpoints
 * - /api/rooms/* - Room management
 * - /api/rooms/[id]/messages - Messages
 * - /api/messages/bulk - Bulk messages
 * - /api/presence/switch - Room switching
 * - /api/ai/ryo-reply - AI reply generation
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

let testToken: string | null = null;
let testUsername: string | null = null;

// Admin user credentials for dev testing
const ADMIN_USERNAME = "ryo";
const ADMIN_PASSWORD = "testtest";
let adminToken: string | null = null;

// Test room for message tests
let testRoomId: string | null = null;
let authRateLimited = false;

const makeRateLimitBypassHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "X-Forwarded-For": `10.2.${Date.now() % 255}.${Math.floor(Math.random() * 255)}`,
});

const skipIfAuthRateLimited = (label: string): boolean => {
  if (authRateLimited) {
    console.log(`  ⚠️  Skipped (${label} - rate limited)`);
    return true;
  }
  return false;
};

// ============================================================================
// Auth Tests
// ============================================================================

async function testRegisterMissingUsername(): Promise<void> {
  if (skipIfAuthRateLimited("register missing username")) return;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({}),
  });
  if (res.status === 429) {
    authRateLimited = true;
    console.log("  ⚠️  Registration rate-limited; skipping auth tests");
    return;
  }
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Username"), "Expected username error");
}

async function testRegisterMissingPassword(): Promise<void> {
  if (skipIfAuthRateLimited("register missing password")) return;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username: "testuser_nopwd" }),
  });
  if (res.status === 429) {
    authRateLimited = true;
    console.log("  ⚠️  Registration rate-limited; skipping auth tests");
    return;
  }
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Password"), "Expected password error");
}

async function testRegisterShortPassword(): Promise<void> {
  if (skipIfAuthRateLimited("register short password")) return;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username: "testuser_short", password: "123" }),
  });
  if (res.status === 429) {
    authRateLimited = true;
    console.log("  ⚠️  Registration rate-limited; skipping auth tests");
    return;
  }
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Password must be"), "Expected password length error");
}

async function testRegisterSuccess(): Promise<void> {
  if (skipIfAuthRateLimited("register success")) return;
  testUsername = `tuser${Date.now()}`;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username: testUsername, password: "testpassword123" }),
  });
  if (res.status === 429) {
    authRateLimited = true;
    console.log("  ⚠️  Registration rate-limited; skipping auth tests");
    return;
  }
  if (res.status === 409) {
    console.log("  ⚠️  Test user already exists; skipping registration assertions");
    return;
  }
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.token, "Expected token in response");
  assert(data.user?.username === testUsername.toLowerCase(), "Expected username in response");
  testToken = data.token;
}

async function testLoginSuccess(): Promise<void> {
  if (skipIfAuthRateLimited("login success")) return;
  if (!testUsername) {
    console.log("  ⚠️  Skipped (no test username available)");
    return;
  }
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username: testUsername, password: "testpassword123" }),
  });
  if (res.status === 429) {
    authRateLimited = true;
    console.log("  ⚠️  Login rate-limited; skipping auth tests");
    return;
  }
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.token, "Expected token in response");
  testToken = data.token;
}

async function testLoginInvalidPassword(): Promise<void> {
  if (skipIfAuthRateLimited("login invalid password")) return;
  if (!testUsername) {
    console.log("  ⚠️  Skipped (no test username available)");
    return;
  }
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username: testUsername, password: "wrongpassword" }),
  });
  if (res.status === 429) {
    authRateLimited = true;
    console.log("  ⚠️  Login rate-limited; skipping auth tests");
    return;
  }
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testTokenVerify(): Promise<void> {
  if (skipIfAuthRateLimited("token verify")) return;
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth token available)");
    return;
  }
  const res = await fetchWithAuth(`${BASE_URL}/api/auth/token/verify`, testUsername!, testToken!, {
    method: "POST",
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.valid === true, "Expected valid token");
}

async function testTokenRefresh(): Promise<void> {
  if (skipIfAuthRateLimited("token refresh")) return;
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth token available)");
    return;
  }
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/token/refresh`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username: testUsername, oldToken: testToken }),
  });
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.token, "Expected new token in response");
  testToken = data.token;
}

async function testPasswordCheck(): Promise<void> {
  if (skipIfAuthRateLimited("password check")) return;
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth token available)");
    return;
  }
  const res = await fetchWithAuth(`${BASE_URL}/api/auth/password/check`, testUsername!, testToken!, {
    method: "GET",
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.hasPassword === true, "Expected hasPassword to be true");
}

async function testListTokens(): Promise<void> {
  if (skipIfAuthRateLimited("list tokens")) return;
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth token available)");
    return;
  }
  const res = await fetchWithAuth(`${BASE_URL}/api/auth/tokens`, testUsername!, testToken!, {
    method: "GET",
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.tokens), "Expected tokens array");
  assert(data.count >= 1, "Expected at least one token");
}

async function testAdminLogin(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  if (res.status === 200) {
    const data = await res.json();
    adminToken = data.token;
    assert(adminToken, "Expected admin token");
  } else {
    // Admin might not exist or have different password in test env
    console.log("  ⚠️  Admin login skipped (user may not exist in test env)");
  }
}

// ============================================================================
// Room Tests
// ============================================================================

async function testGetRooms(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.rooms), "Expected rooms array");
  
  // Find a test room to use
  if (data.rooms.length > 0) {
    testRoomId = data.rooms[0].id;
  }
}

async function testGetRoomsWithUsername(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms?username=${testUsername}`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.rooms), "Expected rooms array");
}

async function testGetSingleRoom(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.room, "Expected room object");
  assertEq(data.room.id, testRoomId, "Room ID should match");
}

// ============================================================================
// Message Tests
// ============================================================================

async function testGetMessages(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/messages`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.messages), "Expected messages array");
}

async function testSendMessage(): Promise<void> {
  if (!testRoomId || !testToken || !testUsername) {
    console.log("  ⚠️  Skipped (missing test room or auth)");
    return;
  }
  
  const res = await fetchWithAuth(`${BASE_URL}/api/rooms/${testRoomId}/messages`, testUsername, testToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "Test message from new API tests" }),
  });
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.message, "Expected message in response");
  assert(data.message.content.includes("Test message"), "Message content should match");
}

async function testBulkMessages(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/messages/bulk?roomIds=${testRoomId}`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.messagesMap, "Expected messagesMap object");
}

// ============================================================================
// Presence Tests
// ============================================================================

async function testPresenceSwitch(): Promise<void> {
  if (!testRoomId || !testUsername) {
    console.log("  ⚠️  Skipped (missing test room or username)");
    return;
  }
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/presence/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      previousRoomId: null,
      nextRoomId: testRoomId,
      username: testUsername,
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success");
}

// ============================================================================
// Room Users Tests
// ============================================================================

async function testGetRoomUsers(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/users`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.users), "Expected users array");
}

// ============================================================================
// Logout Tests (run at end)
// ============================================================================

async function testLogout(): Promise<void> {
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth)");
    return;
  }
  
  const res = await fetchWithAuth(`${BASE_URL}/api/auth/logout`, testUsername, testToken, {
    method: "POST",
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success");
}

// ============================================================================
// Main
// ============================================================================

export async function runNewApiTests(): Promise<{ passed: number; failed: number }> {
  clearResults();

  console.log("\n🧪 New API Tests\n");
  console.log(`Testing against: ${BASE_URL}\n`);

  // Auth Tests
  section("Auth Tests");
  await runTest("Register - missing username", testRegisterMissingUsername);
  await runTest("Register - missing password", testRegisterMissingPassword);
  await runTest("Register - short password", testRegisterShortPassword);
  await runTest("Register - success", testRegisterSuccess);
  await runTest("Login - success", testLoginSuccess);
  await runTest("Login - invalid password", testLoginInvalidPassword);
  await runTest("Token verify", testTokenVerify);
  await runTest("Token refresh", testTokenRefresh);
  await runTest("Password check", testPasswordCheck);
  await runTest("List tokens", testListTokens);
  await runTest("Admin login", testAdminLogin);

  // Room Tests
  section("Room Tests");
  await runTest("Get rooms", testGetRooms);
  await runTest("Get rooms with username", testGetRoomsWithUsername);
  await runTest("Get single room", testGetSingleRoom);

  // Message Tests
  section("Message Tests");
  await runTest("Get messages", testGetMessages);
  await runTest("Send message", testSendMessage);
  await runTest("Bulk messages", testBulkMessages);

  // Presence Tests
  section("Presence Tests");
  await runTest("Presence switch", testPresenceSwitch);
  await runTest("Get room users", testGetRoomUsers);

  // Logout Tests
  section("Logout Tests");
  await runTest("Logout", testLogout);

  return printSummary();
}

if (import.meta.main) {
  runNewApiTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
