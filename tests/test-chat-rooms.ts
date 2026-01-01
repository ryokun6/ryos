#!/usr/bin/env bun
/**
 * Tests for /api/chat-rooms endpoint
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

const CHAT_ROOMS_BASE = `${BASE_URL}/api/chat-rooms`;
const ROOMS_ENDPOINT = `${CHAT_ROOMS_BASE}/rooms`;
const USERS_ENDPOINT = `${CHAT_ROOMS_BASE}/users`;
const AUTH_SIGNUP = `${CHAT_ROOMS_BASE}/auth/signup`;
const AUTH_LOGIN = `${CHAT_ROOMS_BASE}/auth/login`;
const AUTH_VERIFY = `${CHAT_ROOMS_BASE}/auth/token/verify`;
const AUTH_PASSWORD = `${CHAT_ROOMS_BASE}/auth/password`;
const AUTH_TOKENS = `${CHAT_ROOMS_BASE}/auth/tokens`;
const AUTH_LOGOUT_ALL = `${CHAT_ROOMS_BASE}/auth/logout/all`;
const ADMIN_DEBUG_PRESENCE = `${CHAT_ROOMS_BASE}/admin/presence/debug`;
const ADMIN_CLEANUP_PRESENCE = `${CHAT_ROOMS_BASE}/admin/presence/cleanup`;
const ADMIN_RESET_USER_COUNTS = `${CHAT_ROOMS_BASE}/admin/reset-user-counts`;

let testToken: string | null = null;
let testUsername: string | null = null;

// Admin user credentials for dev testing
const ADMIN_USERNAME = "ryo";
const ADMIN_PASSWORD = "testtest";
let adminToken: string | null = null;

// Test room for message tests
const TEST_ROOM_NAME = "ai";
let testRoomId: string | null = null;
let testMessageId: string | null = null;

// Private room tests
let privateRoomId: string | null = null;
let publicTestRoomId: string | null = null;

// ============================================================================
// Test Functions
// ============================================================================

async function testGetRooms(): Promise<void> {
  const res = await fetchWithOrigin(`${ROOMS_ENDPOINT}`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.rooms), "Expected rooms array");
}

async function testGetRoomsWithUsername(): Promise<void> {
  const res = await fetchWithOrigin(
    `${ROOMS_ENDPOINT}?username=testuser`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.rooms), "Expected rooms array");
}

async function testCreateUserMissingUsername(): Promise<void> {
  const res = await fetchWithOrigin(AUTH_SIGNUP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Username"), "Expected username error");
}

async function testCreateUserMissingPassword(): Promise<void> {
  const res = await fetchWithOrigin(AUTH_SIGNUP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "testuser_nopwd" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Password"), "Expected password error");
}

async function testCreateUserShortPassword(): Promise<void> {
  const res = await fetchWithOrigin(AUTH_SIGNUP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "testuser_short", password: "123" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Password must be"), "Expected password length error");
}

async function testCreateUserInvalidUsername(): Promise<void> {
  const res = await fetchWithOrigin(AUTH_SIGNUP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "ab", password: "testpassword123" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testCreateUserSuccess(): Promise<void> {
  testUsername = `tuser${Date.now()}`;
  const res = await fetchWithOrigin(AUTH_SIGNUP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: testUsername,
      password: "testpassword123",
    }),
  });
  assert(res.status === 201 || res.status === 200, `Expected 201 or 200, got ${res.status}`);
  const data = await res.json();
  assert(data.user, "Expected user object");
  assert(data.token, "Expected token");
  testToken = data.token;
}

async function testVerifyToken(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("No test token available");
  }
  const res = await fetchWithAuth(
    AUTH_VERIFY,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.valid === true, "Expected valid token");
  assertEq(data.username, testUsername.toLowerCase(), "Expected matching username");
}

async function testVerifyInvalidToken(): Promise<void> {
  const res = await fetchWithAuth(
    AUTH_VERIFY,
    "invalidtoken123",
    "testuser",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
  );
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testAuthenticateWithPassword(): Promise<void> {
  if (!testUsername) {
    throw new Error("No test username available");
  }
  const res = await fetchWithOrigin(
    AUTH_LOGIN,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUsername,
        password: "testpassword123",
      }),
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.token, "Expected token");
  testToken = data.token;
}

async function testAuthenticateWithWrongPassword(): Promise<void> {
  if (!testUsername) {
    throw new Error("No test username available");
  }
  const res = await fetchWithOrigin(
    AUTH_LOGIN,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUsername,
        password: "wrongpassword",
      }),
    }
  );
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testGetUsers(): Promise<void> {
  const res = await fetchWithOrigin(`${USERS_ENDPOINT}?search=test`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.users), "Expected users array");
}

async function testGetUsersShortQuery(): Promise<void> {
  const res = await fetchWithOrigin(`${USERS_ENDPOINT}?search=a`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.users), "Expected users array");
  assertEq(data.users.length, 0, "Expected empty array for short query");
}

async function testJoinRoomMissingFields(): Promise<void> {
  const res = await fetchWithOrigin(`${ROOMS_ENDPOINT}/missing-room/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testSendMessageUnauthorized(): Promise<void> {
  const res = await fetchWithOrigin(`${ROOMS_ENDPOINT}/test/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "test",
      content: "Hello",
    }),
  });
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testDeleteRoomUnauthorized(): Promise<void> {
  const res = await fetchWithOrigin(
    `${ROOMS_ENDPOINT}/test`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  );
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testInvalidAction(): Promise<void> {
  const res = await fetchWithOrigin(`${CHAT_ROOMS_BASE}/invalid`);
  assertEq(res.status, 404, `Expected 404, got ${res.status}`);
}

async function testCheckPasswordWithAuth(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("No test token available");
  }
  const res = await fetchWithAuth(
    AUTH_PASSWORD,
    testToken,
    testUsername,
    { method: "GET" }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.hasPassword === true, "Expected hasPassword to be true");
}

async function testListTokens(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("No test token available");
  }
  const res = await fetchWithAuth(
    AUTH_TOKENS,
    testToken,
    testUsername,
    {
      method: "GET",
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.tokens), "Expected tokens array");
  assert(data.count >= 1, "Expected at least 1 token");
}

// ============================================================================
// Admin User Tests (ryo)
// ============================================================================

async function testAdminAuthenticate(): Promise<void> {
  const res = await fetchWithOrigin(
    AUTH_LOGIN,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
    }
  );
  // 200 = successful login, if user doesn't exist we'll get 401
  if (res.status === 401) {
    // Try to create the user first (dev seed)
    const createRes = await fetchWithOrigin(
      AUTH_SIGNUP,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: ADMIN_USERNAME,
          password: ADMIN_PASSWORD,
        }),
      }
    );
    assert(
      createRes.status === 201 || createRes.status === 200,
      `Expected 201 or 200 when creating admin, got ${createRes.status}`
    );
    const createData = await createRes.json();
    adminToken = createData.token;
  } else {
    assertEq(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.token, "Expected token for admin user");
    adminToken = data.token;
  }
}

async function testAdminDebugPresence(): Promise<void> {
  if (!adminToken) {
    throw new Error("No admin token available - run testAdminAuthenticate first");
  }
  const res = await fetchWithAuth(
    ADMIN_DEBUG_PRESENCE,
    adminToken,
    ADMIN_USERNAME,
    { method: "GET" }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.presenceKeys !== undefined || data.rooms !== undefined, "Expected debug data with presenceKeys or rooms");
}

async function testAdminDebugPresenceUnauthorized(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("No test token available");
  }
  // Non-admin user should get 403
  const res = await fetchWithAuth(
    ADMIN_DEBUG_PRESENCE,
    testToken,
    testUsername,
    { method: "GET" }
  );
  assertEq(res.status, 403, `Expected 403 for non-admin, got ${res.status}`);
}

async function testAdminCleanupPresence(): Promise<void> {
  if (!adminToken) {
    throw new Error("No admin token available");
  }
  const res = await fetchWithAuth(
    ADMIN_CLEANUP_PRESENCE,
    adminToken,
    ADMIN_USERNAME,
    { method: "POST" }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success !== undefined || data.roomsUpdated !== undefined, "Expected cleanup response with success or roomsUpdated");
}

async function testAdminCleanupPresenceUnauthorized(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("No test token available");
  }
  // Non-admin user should get 403
  const res = await fetchWithAuth(
    ADMIN_CLEANUP_PRESENCE,
    testToken,
    testUsername,
    { method: "POST" }
  );
  assertEq(res.status, 403, `Expected 403 for non-admin, got ${res.status}`);
}

// ============================================================================
// Message Tests (using #ai channel)
// ============================================================================

async function testSeedOrFindAiChannel(): Promise<void> {
  if (!adminToken) {
    throw new Error("No admin token available - run testAdminAuthenticate first");
  }

  // First, check if #ai channel exists
  const roomsRes = await fetchWithOrigin(`${ROOMS_ENDPOINT}`);
  assertEq(roomsRes.status, 200, `Expected 200, got ${roomsRes.status}`);
  const roomsData = await roomsRes.json();

  const aiRoom = roomsData.rooms.find(
    (room: { name: string; id: string }) => room.name === TEST_ROOM_NAME
  );

  if (aiRoom) {
    testRoomId = aiRoom.id;
    return; // Room already exists
  }

  // Create the #ai channel as admin
  const createRes = await fetchWithAuth(
    ROOMS_ENDPOINT,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: TEST_ROOM_NAME,
        type: "public",
      }),
    }
  );
  assertEq(createRes.status, 201, `Expected 201, got ${createRes.status}`);
  const createData = await createRes.json();
  assert(createData.room, "Expected room object");
  assert(createData.room.id, "Expected room ID");
  testRoomId = createData.room.id;
}

async function testGetMessages(): Promise<void> {
  if (!testRoomId) {
    throw new Error("No test room ID available");
  }

  const res = await fetchWithOrigin(
    `${ROOMS_ENDPOINT}/${testRoomId}/messages`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.messages), "Expected messages array");
}

async function testSendMessageAsAdmin(): Promise<void> {
  if (!adminToken || !testRoomId) {
    throw new Error("No admin token or test room ID available");
  }

  const testContent = `Test message from admin at ${Date.now()}`;
  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${testRoomId}/messages`,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        content: testContent,
      }),
    }
  );
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.message, "Expected message object");
  assert(data.message.id, "Expected message ID");
  assertEq(data.message.content, testContent, "Expected content to match");
  testMessageId = data.message.id;
}

async function testSendMessageAsRegularUser(): Promise<void> {
  if (!testToken || !testUsername || !testRoomId) {
    throw new Error("No test token, username, or room ID available");
  }

  const testContent = `Test message from user at ${Date.now()}`;
  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${testRoomId}/messages`,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUsername,
        content: testContent,
      }),
    }
  );
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.message, "Expected message object");
  assert(data.message.id, "Expected message ID");
}

async function testSendMessageMissingContent(): Promise<void> {
  if (!adminToken || !testRoomId) {
    throw new Error("No admin token or test room ID available");
  }

  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${testRoomId}/messages`,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        content: "",
      }),
    }
  );
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testSendMessageToNonexistentRoom(): Promise<void> {
  if (!adminToken) {
    throw new Error("No admin token available");
  }

  // Use alphanumeric room ID (no hyphens) to pass validation, but room shouldn't exist
  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/aaaa0000bbbb1111cccc2222/messages`,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        content: "Test message",
      }),
    }
  );
  assertEq(res.status, 404, `Expected 404, got ${res.status}`);
}

async function testDeleteMessageAsAdmin(): Promise<void> {
  if (!adminToken || !testRoomId || !testMessageId) {
    throw new Error("No admin token, room ID, or message ID available");
  }

  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${testRoomId}/messages/${testMessageId}`,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success to be true");
}

async function testDeleteMessageAsNonAdmin(): Promise<void> {
  if (!testToken || !testUsername || !testRoomId) {
    throw new Error("No test token, username, or room ID available");
  }

  // First send a message to delete
  const sendRes = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${testRoomId}/messages`,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUsername,
        content: `Message to try delete at ${Date.now()}`,
      }),
    }
  );
  assertEq(sendRes.status, 201, `Expected 201 for send, got ${sendRes.status}`);
  const sendData = await sendRes.json();
  const messageId = sendData.message.id;

  // Try to delete as non-admin (should fail)
  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${testRoomId}/messages/${messageId}`,
    testToken,
    testUsername,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  );
  assertEq(res.status, 403, `Expected 403 for non-admin, got ${res.status}`);

  // Clean up: delete as admin
  if (adminToken) {
    await fetchWithAuth(
      `${ROOMS_ENDPOINT}/${testRoomId}/messages/${messageId}`,
      adminToken,
      ADMIN_USERNAME,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

async function testDeleteNonexistentMessage(): Promise<void> {
  if (!adminToken || !testRoomId) {
    throw new Error("No admin token or room ID available");
  }

  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${testRoomId}/messages/nonexistent-message-id`,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  );
  assertEq(res.status, 404, `Expected 404, got ${res.status}`);
}

// ============================================================================
// Room Creation Tests
// ============================================================================

async function testCreatePublicRoomAsAdmin(): Promise<void> {
  if (!adminToken) {
    throw new Error("No admin token available");
  }

  const roomName = `testroom${Date.now()}`;
  const res = await fetchWithAuth(
    ROOMS_ENDPOINT,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: roomName,
        type: "public",
      }),
    }
  );
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.room, "Expected room object");
  assert(data.room.id, "Expected room ID");
  assertEq(data.room.type, "public", "Expected public room type");
  publicTestRoomId = data.room.id;
}

async function testCreatePublicRoomAsNonAdmin(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("No test token available");
  }

  const res = await fetchWithAuth(
    ROOMS_ENDPOINT,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "unauthorized-room",
        type: "public",
      }),
    }
  );
  assertEq(res.status, 403, `Expected 403 for non-admin, got ${res.status}`);
}

async function testCreatePublicRoomMissingName(): Promise<void> {
  if (!adminToken) {
    throw new Error("No admin token available");
  }

  const res = await fetchWithAuth(
    ROOMS_ENDPOINT,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "public",
      }),
    }
  );
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testCreatePrivateRoom(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("No test token available");
  }

  const res = await fetchWithAuth(
    ROOMS_ENDPOINT,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "private",
        members: [testUsername, ADMIN_USERNAME],
      }),
    }
  );
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.room, "Expected room object");
  assert(data.room.id, "Expected room ID");
  assertEq(data.room.type, "private", "Expected private room type");
  assert(Array.isArray(data.room.members), "Expected members array");
  assert(data.room.members.includes(testUsername.toLowerCase()), "Expected creator in members");
  assert(data.room.members.includes(ADMIN_USERNAME.toLowerCase()), "Expected admin in members");
  privateRoomId = data.room.id;
}

async function testCreatePrivateRoomMissingMembers(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("No test token available");
  }

  const res = await fetchWithAuth(
    ROOMS_ENDPOINT,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "private",
        members: [],
      }),
    }
  );
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testCreateRoomInvalidType(): Promise<void> {
  if (!adminToken) {
    throw new Error("No admin token available");
  }

  const res = await fetchWithAuth(
    ROOMS_ENDPOINT,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "test",
        type: "invalid",
      }),
    }
  );
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

// ============================================================================
// Private Room & Messaging Tests
// ============================================================================

async function testSendMessageInPrivateRoom(): Promise<void> {
  if (!testToken || !testUsername || !privateRoomId) {
    throw new Error("No test token or private room ID available");
  }

  const testContent = `Private message at ${Date.now()}`;
  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${privateRoomId}/messages`,
    testToken,
    testUsername,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUsername,
        content: testContent,
      }),
    }
  );
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.message, "Expected message object");
  assertEq(data.message.content, testContent, "Expected content to match");
}

async function testGetMessagesInPrivateRoom(): Promise<void> {
  if (!testToken || !testUsername || !privateRoomId) {
    throw new Error("No test token or private room ID available");
  }

  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${privateRoomId}/messages`,
    testToken,
    testUsername,
    { method: "GET" }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.messages), "Expected messages array");
  assert(data.messages.length > 0, "Expected at least one message");
}

async function testPrivateRoomVisibility(): Promise<void> {
  if (!testToken || !testUsername || !privateRoomId) {
    throw new Error("No test token or private room ID available");
  }

  // Get rooms as the member - should see private room
  const memberRes = await fetchWithOrigin(
    `${ROOMS_ENDPOINT}?username=${testUsername}`
  );
  assertEq(memberRes.status, 200, `Expected 200, got ${memberRes.status}`);
  const memberData = await memberRes.json();
  const memberSeesRoom = memberData.rooms.some(
    (room: { id: string }) => room.id === privateRoomId
  );
  assert(memberSeesRoom, "Member should see private room in room list");

  // Get rooms without username - should NOT see private room
  const anonRes = await fetchWithOrigin(`${ROOMS_ENDPOINT}`);
  assertEq(anonRes.status, 200, `Expected 200, got ${anonRes.status}`);
  const anonData = await anonRes.json();
  const anonSeesRoom = anonData.rooms.some(
    (room: { id: string }) => room.id === privateRoomId
  );
  assert(!anonSeesRoom, "Anonymous user should NOT see private room");
}

async function testAdminCanMessagePrivateRoom(): Promise<void> {
  if (!adminToken || !privateRoomId) {
    throw new Error("No admin token or private room ID available");
  }

  const testContent = `Admin reply in private room at ${Date.now()}`;
  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${privateRoomId}/messages`,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        content: testContent,
      }),
    }
  );
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.message, "Expected message object");
}

async function testDeletePrivateRoomAsMember(): Promise<void> {
  if (!testToken || !testUsername || !privateRoomId) {
    throw new Error("No test token or private room ID available");
  }

  // Member can leave/delete private room
  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${privateRoomId}`,
    testToken,
    testUsername,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success to be true");
}

async function testDeletePublicRoomAsAdmin(): Promise<void> {
  if (!adminToken || !publicTestRoomId) {
    throw new Error("No admin token or public room ID available");
  }

  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${publicTestRoomId}`,
    adminToken,
    ADMIN_USERNAME,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success to be true");
}

async function testDeletePublicRoomAsNonAdmin(): Promise<void> {
  if (!testToken || !testUsername || !testRoomId) {
    throw new Error("No test token or room ID available");
  }

  // Non-admin should not be able to delete public rooms
  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${testRoomId}`,
    testToken,
    testUsername,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  );
  assertEq(res.status, 403, `Expected 403 for non-admin, got ${res.status}`);
}

async function testDeleteMessageWithInvalidToken(): Promise<void> {
  if (!testRoomId || !testMessageId) {
    throw new Error("No room ID or message ID available");
  }

  // Try to delete message with invalid token
  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${testRoomId}/messages/${testMessageId}`,
    "invalid_token_12345",
    ADMIN_USERNAME,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  );
  assertEq(res.status, 401, `Expected 401 for invalid token, got ${res.status}`);
}

async function testDeletePublicRoomWithInvalidToken(): Promise<void> {
  if (!publicTestRoomId) {
    throw new Error("No public room ID available");
  }

  // Try to delete public room with invalid token
  const res = await fetchWithAuth(
    `${ROOMS_ENDPOINT}/${publicTestRoomId}`,
    "invalid_token_12345",
    ADMIN_USERNAME,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  );
  assertEq(res.status, 401, `Expected 401 for invalid token, got ${res.status}`);
}

async function testCreatePublicRoomWithInvalidToken(): Promise<void> {
  const roomName = `testroom${Date.now()}`;
  const res = await fetchWithAuth(
    ROOMS_ENDPOINT,
    "invalid_token_12345",
    ADMIN_USERNAME,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: roomName,
        type: "public",
      }),
    }
  );
  assertEq(res.status, 401, `Expected 401 for invalid token, got ${res.status}`);
}

// ============================================================================
// Main
// ============================================================================

export async function runChatRoomsTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("chat-rooms"));
  clearResults();

  console.log("\n  Public Endpoints\n");
  await runTest("GET /api/chat-rooms/rooms", testGetRooms);
  await runTest("GET /api/chat-rooms/rooms?username=...", testGetRoomsWithUsername);
  await runTest("GET /api/chat-rooms/users", testGetUsers);
  await runTest("GET /api/chat-rooms/users (short query)", testGetUsersShortQuery);
  await runTest("GET /api/chat-rooms/invalid", testInvalidAction);

  console.log("\n  User Creation Validation\n");
  await runTest("POST createUser - missing username", testCreateUserMissingUsername);
  await runTest("POST createUser - missing password", testCreateUserMissingPassword);
  await runTest("POST createUser - short password", testCreateUserShortPassword);
  await runTest("POST createUser - invalid username", testCreateUserInvalidUsername);

  console.log("\n  User Creation & Authentication\n");
  await runTest("POST createUser - success", testCreateUserSuccess);
  await runTest("POST verifyToken - valid token", testVerifyToken);
  await runTest("POST verifyToken - invalid token", testVerifyInvalidToken);
  await runTest("POST authenticateWithPassword - success", testAuthenticateWithPassword);
  await runTest("POST authenticateWithPassword - wrong password", testAuthenticateWithWrongPassword);

  console.log("\n  Protected Endpoints\n");
  await runTest("GET checkPassword - with auth", testCheckPasswordWithAuth);
  await runTest("POST listTokens - with auth", testListTokens);

  console.log("\n  Authorization\n");
  await runTest("POST joinRoom - missing fields", testJoinRoomMissingFields);
  await runTest("POST sendMessage - unauthorized", testSendMessageUnauthorized);
  await runTest("DELETE deleteRoom - unauthorized", testDeleteRoomUnauthorized);

  console.log("\n  Admin User (ryo)\n");
  await runTest("POST authenticateWithPassword - admin (ryo)", testAdminAuthenticate);
  await runTest("GET debugPresence - admin authorized", testAdminDebugPresence);
  await runTest("GET debugPresence - non-admin unauthorized", testAdminDebugPresenceUnauthorized);
  await runTest("POST cleanupPresence - admin authorized", testAdminCleanupPresence);
  await runTest("POST cleanupPresence - non-admin unauthorized", testAdminCleanupPresenceUnauthorized);

  console.log("\n  Messages (#ai channel)\n");
  await runTest("Seed/find #ai channel", testSeedOrFindAiChannel);
  await runTest("GET getMessages", testGetMessages);
  await runTest("POST sendMessage - as admin", testSendMessageAsAdmin);
  await runTest("POST sendMessage - as regular user", testSendMessageAsRegularUser);
  await runTest("POST sendMessage - missing content", testSendMessageMissingContent);
  await runTest("POST sendMessage - nonexistent room", testSendMessageToNonexistentRoom);
  await runTest("DELETE deleteMessage - as admin", testDeleteMessageAsAdmin);
  await runTest("DELETE deleteMessage - as non-admin (forbidden)", testDeleteMessageAsNonAdmin);
  await runTest("DELETE deleteMessage - with invalid token (unauthorized)", testDeleteMessageWithInvalidToken);
  await runTest("DELETE deleteMessage - nonexistent message", testDeleteNonexistentMessage);

  console.log("\n  Room Creation\n");
  await runTest("POST createRoom - public as admin", testCreatePublicRoomAsAdmin);
  await runTest("POST createRoom - public as non-admin (forbidden)", testCreatePublicRoomAsNonAdmin);
  await runTest("POST createRoom - public with invalid token (unauthorized)", testCreatePublicRoomWithInvalidToken);
  await runTest("POST createRoom - public missing name", testCreatePublicRoomMissingName);
  await runTest("POST createRoom - private room", testCreatePrivateRoom);
  await runTest("POST createRoom - private missing members", testCreatePrivateRoomMissingMembers);
  await runTest("POST createRoom - invalid type", testCreateRoomInvalidType);

  console.log("\n  Private Rooms & Messaging\n");
  await runTest("POST sendMessage - in private room", testSendMessageInPrivateRoom);
  await runTest("GET getMessages - in private room", testGetMessagesInPrivateRoom);
  await runTest("GET getRooms - private room visibility", testPrivateRoomVisibility);
  await runTest("POST sendMessage - admin in private room", testAdminCanMessagePrivateRoom);
  await runTest("DELETE deleteRoom - public as non-admin (forbidden)", testDeletePublicRoomAsNonAdmin);
  await runTest("DELETE deleteRoom - public with invalid token (unauthorized)", testDeletePublicRoomWithInvalidToken);
  await runTest("DELETE deleteRoom - private as member", testDeletePrivateRoomAsMember);
  await runTest("DELETE deleteRoom - public as admin", testDeletePublicRoomAsAdmin);

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
