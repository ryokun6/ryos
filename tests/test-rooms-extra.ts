#!/usr/bin/env bun
/**
 * Tests for room-related API endpoints not covered in test-new-api.ts
 *
 * Tests:
 * - POST /api/rooms/[id]/join - Join a room
 * - POST /api/rooms/[id]/leave - Leave a room
 * - DELETE /api/rooms/[id]/messages/[msgId] - Delete a message (admin only)
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

// Test state
let testRoomId: string | null = null;
let testUsername: string | null = null;
let testToken: string | null = null;
let testMessageId: string | null = null;

// Admin credentials for dev testing
const ADMIN_USERNAME = "ryo";
const ADMIN_PASSWORD = "testtest";
let adminToken: string | null = null;

// ============================================================================
// Setup Helpers
// ============================================================================

async function setupTestRoom(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms`);
  if (res.ok) {
    const data = await res.json();
    if (data.rooms && data.rooms.length > 0) {
      testRoomId = data.rooms[0].id;
    }
  }
}

async function setupTestUser(): Promise<void> {
  testUsername = `testuser${Date.now()}`;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: testUsername, password: "testpassword123" }),
  });

  if (res.status === 201) {
    const data = await res.json();
    testToken = data.token;
  } else if (res.status === 409) {
    // User exists, try login
    const loginRes = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: testUsername, password: "testpassword123" }),
    });
    if (loginRes.ok) {
      const data = await loginRes.json();
      testToken = data.token;
    }
  }
}

async function setupAdminUser(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  if (res.ok) {
    const data = await res.json();
    adminToken = data.token;
  }
}

async function setupTestMessage(): Promise<void> {
  if (!testRoomId || !testToken || !testUsername) return;

  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms/${testRoomId}/messages`,
    testUsername,
    testToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `Test message for deletion ${Date.now()}` }),
    }
  );

  if (res.status === 201) {
    const data = await res.json();
    testMessageId = data.message?.id;
  }
}

// ============================================================================
// Join Room Tests
// ============================================================================

async function testJoinRoomMissingRoomId(): Promise<void> {
  // Note: Can't really test missing roomId since it's in the URL path
  // Instead test with empty/invalid room ID behavior
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms//join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "testuser" }),
  });
  // Should get 400, 404, or 405 depending on routing
  assert(res.status === 400 || res.status === 404 || res.status === 405, 
    `Expected 400, 404, or 405, got ${res.status}`);
}

async function testJoinRoomMissingUsername(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Username"), "Expected username error");
}

async function testJoinRoomInvalidUsername(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "ab" }), // Too short
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testJoinRoomNonExistentRoom(): Promise<void> {
  if (!testUsername) {
    console.log("  ⚠️  Skipped (no test user available)");
    return;
  }

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/nonexistent-room-xyz/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: testUsername }),
  });
  // API returns 400 for invalid room ID format
  assert(res.status === 400 || res.status === 404, `Expected 400 or 404, got ${res.status}`);
}

async function testJoinRoomNonExistentUser(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `nonexistent_user_${Date.now()}` }),
  });
  assertEq(res.status, 404, `Expected 404, got ${res.status}`);
}

async function testJoinRoomSuccess(): Promise<void> {
  if (!testRoomId || !testUsername) {
    console.log("  ⚠️  Skipped (missing test room or user)");
    return;
  }

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: testUsername }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
}

async function testJoinRoomWrongMethod(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/join`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

// ============================================================================
// Leave Room Tests
// ============================================================================

async function testLeaveRoomMissingUsername(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Username"), "Expected username error");
}

async function testLeaveRoomInvalidUsername(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "x" }), // Too short
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testLeaveRoomNonExistentRoom(): Promise<void> {
  if (!testUsername) {
    console.log("  ⚠️  Skipped (no test user available)");
    return;
  }

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/nonexistent-room-xyz/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: testUsername }),
  });
  // API returns 400 for invalid room ID format
  assert(res.status === 400 || res.status === 404, `Expected 400 or 404, got ${res.status}`);
}

async function testLeaveRoomSuccess(): Promise<void> {
  if (!testRoomId || !testUsername) {
    console.log("  ⚠️  Skipped (missing test room or user)");
    return;
  }

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: testUsername }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
}

async function testLeaveRoomWrongMethod(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/leave`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

// ============================================================================
// Delete Message Tests
// ============================================================================

async function testDeleteMessageMissingAuth(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }

  const res = await fetchWithOrigin(
    `${BASE_URL}/api/rooms/${testRoomId}/messages/test-msg-id`,
    { method: "DELETE" }
  );
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Unauthorized"), "Expected unauthorized error");
}

async function testDeleteMessageInvalidToken(): Promise<void> {
  if (!testRoomId) {
    console.log("  ⚠️  Skipped (no test room available)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms/${testRoomId}/messages/test-msg-id`,
    "someuser",
    "invalid-token",
    { method: "DELETE" }
  );
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testDeleteMessageNonAdmin(): Promise<void> {
  if (!testRoomId || !testToken || !testUsername) {
    console.log("  ⚠️  Skipped (missing test room or auth)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms/${testRoomId}/messages/test-msg-id`,
    testUsername,
    testToken,
    { method: "DELETE" }
  );
  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("admin"), "Expected admin required error");
}

async function testDeleteMessageMissingIds(): Promise<void> {
  if (!adminToken) {
    console.log("  ⚠️  Skipped (no admin token available)");
    return;
  }

  // Test with missing message ID - this depends on routing behavior
  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms/${testRoomId}/messages/`,
    ADMIN_USERNAME,
    adminToken,
    { method: "DELETE" }
  );
  // Should get 400 or 404 depending on routing
  assert(res.status === 400 || res.status === 404 || res.status === 405, 
    `Expected 400, 404, or 405, got ${res.status}`);
}

async function testDeleteMessageNonExistentRoom(): Promise<void> {
  if (!adminToken) {
    console.log("  ⚠️  Skipped (no admin token available)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms/nonexistent-room-xyz/messages/some-msg-id`,
    ADMIN_USERNAME,
    adminToken,
    { method: "DELETE" }
  );
  // API returns 400 for invalid room ID format
  assert(res.status === 400 || res.status === 404, `Expected 400 or 404, got ${res.status}`);
}

async function testDeleteMessageNonExistentMessage(): Promise<void> {
  if (!testRoomId || !adminToken) {
    console.log("  ⚠️  Skipped (missing test room or admin token)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms/${testRoomId}/messages/nonexistent-msg-${Date.now()}`,
    ADMIN_USERNAME,
    adminToken,
    { method: "DELETE" }
  );
  assertEq(res.status, 404, `Expected 404, got ${res.status}`);
}

async function testDeleteMessageSuccess(): Promise<void> {
  if (!testRoomId || !adminToken || !testMessageId) {
    console.log("  ⚠️  Skipped (missing test room, admin token, or message)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms/${testRoomId}/messages/${testMessageId}`,
    ADMIN_USERNAME,
    adminToken,
    { method: "DELETE" }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
}

async function testDeleteMessageWrongMethod(): Promise<void> {
  if (!testRoomId || !adminToken) {
    console.log("  ⚠️  Skipped (missing test room or admin token)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms/${testRoomId}/messages/some-msg-id`,
    ADMIN_USERNAME,
    adminToken,
    { method: "GET" }
  );
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

// ============================================================================
// Main
// ============================================================================

export async function runRoomsExtraTests(): Promise<{ passed: number; failed: number }> {
  clearResults();

  console.log("\n🧪 Rooms Extra API Tests\n");
  console.log(`Testing against: ${BASE_URL}\n`);

  // Setup
  console.log(section("Setup"));
  await setupTestRoom();
  await setupTestUser();
  await setupAdminUser();
  await setupTestMessage();

  console.log(`  Room ID: ${testRoomId || "none"}`);
  console.log(`  Test user: ${testUsername || "none"}`);
  console.log(`  Admin token: ${adminToken ? "obtained" : "none"}`);
  console.log(`  Test message: ${testMessageId || "none"}`);

  // Join Room Tests
  console.log(section("Join Room Tests"));
  await runTest("Join room - missing room ID", testJoinRoomMissingRoomId);
  await runTest("Join room - missing username", testJoinRoomMissingUsername);
  await runTest("Join room - invalid username", testJoinRoomInvalidUsername);
  await runTest("Join room - non-existent room", testJoinRoomNonExistentRoom);
  await runTest("Join room - non-existent user", testJoinRoomNonExistentUser);
  await runTest("Join room - success", testJoinRoomSuccess);
  await runTest("Join room - wrong method", testJoinRoomWrongMethod);

  // Leave Room Tests
  console.log(section("Leave Room Tests"));
  await runTest("Leave room - missing username", testLeaveRoomMissingUsername);
  await runTest("Leave room - invalid username", testLeaveRoomInvalidUsername);
  await runTest("Leave room - non-existent room", testLeaveRoomNonExistentRoom);
  await runTest("Leave room - success", testLeaveRoomSuccess);
  await runTest("Leave room - wrong method", testLeaveRoomWrongMethod);

  // Delete Message Tests
  console.log(section("Delete Message Tests"));
  await runTest("Delete message - missing auth", testDeleteMessageMissingAuth);
  await runTest("Delete message - invalid token", testDeleteMessageInvalidToken);
  await runTest("Delete message - non-admin user", testDeleteMessageNonAdmin);
  await runTest("Delete message - missing IDs", testDeleteMessageMissingIds);
  await runTest("Delete message - non-existent room", testDeleteMessageNonExistentRoom);
  await runTest("Delete message - non-existent message", testDeleteMessageNonExistentMessage);
  await runTest("Delete message - success", testDeleteMessageSuccess);
  await runTest("Delete message - wrong method", testDeleteMessageWrongMethod);

  return printSummary();
}

if (import.meta.main) {
  runRoomsExtraTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
