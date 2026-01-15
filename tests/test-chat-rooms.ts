#!/usr/bin/env bun
/**
 * Tests for /api/rooms and related auth flows
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
let testRoomId: string | null = null;
let testMessageId: string | null = null;

// ============================================================================
// Setup: Create test user
// ============================================================================

async function setupTestUser(): Promise<void> {
  const username = `tuser${Date.now()}`;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password: "testpassword123",
    }),
  });

  assert(res.status === 201 || res.status === 200, `Expected 200/201, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(data.token, "Expected token for test user");
  assert(data.user?.username, "Expected user in response");

  testUsername = data.user.username;
  testToken = data.token;
}

// ============================================================================
// Test Functions
// ============================================================================

async function testGetRooms(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(Array.isArray(data.rooms), "Expected rooms array");
}

async function testCreatePublicRoomRequiresAdmin(): Promise<void> {
  if (!testToken || !testUsername) throw new Error("Test user not set up");

  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms`,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "public",
        name: "test-public-room",
      }),
    }
  );

  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
}

async function testCreatePrivateRoom(): Promise<void> {
  if (!testToken || !testUsername) throw new Error("Test user not set up");

  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms`,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "private",
        members: [testUsername],
      }),
    }
  );

  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(data.room?.id, "Expected room id");
  testRoomId = data.room.id;
}

async function testJoinRoom(): Promise<void> {
  if (!testRoomId || !testUsername) throw new Error("Test room not set up");

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: testUsername }),
  });

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
}

async function testSendMessage(): Promise<void> {
  if (!testRoomId || !testToken || !testUsername) throw new Error("Test setup incomplete");

  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms/${testRoomId}/messages`,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Hello from test suite" }),
    }
  );

  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(data.message?.id, "Expected message id");
  testMessageId = data.message.id;
}

async function testGetMessages(): Promise<void> {
  if (!testRoomId) throw new Error("Test room not set up");

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/messages`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const payload = await res.json();
  const data = payload.data || payload;
  assert(Array.isArray(data.messages), "Expected messages array");
  assert(data.messages.length > 0, "Expected at least one message");
}

async function testDeleteMessage(): Promise<void> {
  if (!testRoomId || !testMessageId || !testToken || !testUsername) {
    throw new Error("Test setup incomplete");
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/rooms/${testRoomId}/messages?messageId=${testMessageId}`,
    testToken,
    testUsername,
    { method: "DELETE" }
  );

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
}

async function testLeaveRoom(): Promise<void> {
  if (!testRoomId || !testUsername) throw new Error("Test room not set up");

  const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: testUsername }),
  });

  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
}

// ============================================================================
// Main
// ============================================================================

export async function runChatRoomsTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("rooms"));
  clearResults();

  console.log("\n  Setup\n");
  await runTest("Setup test user", setupTestUser);

  console.log("\n  Rooms\n");
  await runTest("GET /api/rooms", testGetRooms);
  await runTest("POST /api/rooms (public requires admin)", testCreatePublicRoomRequiresAdmin);
  await runTest("POST /api/rooms (private)", testCreatePrivateRoom);
  await runTest("POST /api/rooms/:id/join", testJoinRoom);
  await runTest("POST /api/rooms/:id/messages", testSendMessage);
  await runTest("GET /api/rooms/:id/messages", testGetMessages);
  await runTest("DELETE /api/rooms/:id/messages", testDeleteMessage);
  await runTest("POST /api/rooms/:id/leave", testLeaveRoom);

  return printSummary();
}

// Run if executed directly
if (import.meta.main) {
  runChatRoomsTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
