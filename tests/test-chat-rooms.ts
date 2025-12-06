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

let testToken: string | null = null;
let testUsername: string | null = null;

// ============================================================================
// Test Functions
// ============================================================================

async function testGetRooms(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat-rooms?action=getRooms`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.rooms), "Expected rooms array");
}

async function testGetRoomsWithUsername(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/chat-rooms?action=getRooms&username=testuser`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.rooms), "Expected rooms array");
}

async function testCreateUserMissingUsername(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat-rooms?action=createUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Username"), "Expected username error");
}

async function testCreateUserMissingPassword(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat-rooms?action=createUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "testuser_nopwd" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Password"), "Expected password error");
}

async function testCreateUserShortPassword(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat-rooms?action=createUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "testuser_short", password: "123" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Password must be"), "Expected password length error");
}

async function testCreateUserInvalidUsername(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat-rooms?action=createUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "ab", password: "testpassword123" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testCreateUserSuccess(): Promise<void> {
  testUsername = `tuser${Date.now()}`;
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat-rooms?action=createUser`, {
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
    `${BASE_URL}/api/chat-rooms?action=verifyToken`,
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
    `${BASE_URL}/api/chat-rooms?action=verifyToken`,
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
    `${BASE_URL}/api/chat-rooms?action=authenticateWithPassword`,
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
    `${BASE_URL}/api/chat-rooms?action=authenticateWithPassword`,
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
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat-rooms?action=getUsers&search=test`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.users), "Expected users array");
}

async function testGetUsersShortQuery(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat-rooms?action=getUsers&search=a`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.users), "Expected users array");
  assertEq(data.users.length, 0, "Expected empty array for short query");
}

async function testJoinRoomMissingFields(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat-rooms?action=joinRoom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testSendMessageUnauthorized(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat-rooms?action=sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomId: "test",
      username: "test",
      content: "Hello",
    }),
  });
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testDeleteRoomUnauthorized(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/chat-rooms?action=deleteRoom&roomId=test`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  );
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testInvalidAction(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat-rooms?action=invalidAction`);
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testCheckPasswordWithAuth(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("No test token available");
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/api/chat-rooms?action=checkPassword`,
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
    `${BASE_URL}/api/chat-rooms?action=listTokens`,
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
  assert(Array.isArray(data.tokens), "Expected tokens array");
  assert(data.count >= 1, "Expected at least 1 token");
}

// ============================================================================
// Main
// ============================================================================

export async function runChatRoomsTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("chat-rooms"));
  clearResults();

  console.log("\n  Public Endpoints\n");
  await runTest("GET /api/chat-rooms?action=getRooms", testGetRooms);
  await runTest("GET /api/chat-rooms?action=getRooms&username=...", testGetRoomsWithUsername);
  await runTest("GET /api/chat-rooms?action=getUsers", testGetUsers);
  await runTest("GET /api/chat-rooms?action=getUsers (short query)", testGetUsersShortQuery);
  await runTest("GET /api/chat-rooms?action=invalidAction", testInvalidAction);

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
