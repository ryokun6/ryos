#!/usr/bin/env bun
/**
 * Test script for chat-rooms API endpoints
 * Run with: bun run scripts/test-chat-rooms.ts
 */

const BASE_URL = process.env.API_URL || "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];
let testToken: string | null = null;
let testUsername: string | null = null;

async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✅ ${name}`);
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    results.push({
      name,
      passed: false,
      error: errorMsg,
      duration: Date.now() - start,
    });
    console.log(`❌ ${name}: ${errorMsg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEq<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${expected}, got ${actual}`
    );
  }
}

// ============================================================================
// Test Functions
// ============================================================================

async function testGetRooms(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=getRooms`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.rooms), "Expected rooms array");
}

async function testGetRoomsWithUsername(): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/chat-rooms?action=getRooms&username=testuser`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.rooms), "Expected rooms array");
}

async function testCreateUserMissingUsername(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=createUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Username"), "Expected username error");
}

async function testCreateUserMissingPassword(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=createUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "testuser_nopwd" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Password"), "Expected password error");
}

async function testCreateUserShortPassword(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=createUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "testuser_short", password: "123" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Password must be"), "Expected password length error");
}

async function testCreateUserInvalidUsername(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=createUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "ab", password: "testpassword123" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testCreateUserSuccess(): Promise<void> {
  // Generate unique username for testing
  testUsername = `testuser_${Date.now()}`;
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=createUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: testUsername,
      password: "testpassword123",
    }),
  });
  // Could be 201 (new user) or 200 (existing user login)
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
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=verifyToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testToken}`,
      "X-Username": testUsername,
    },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.valid === true, "Expected valid token");
  assertEq(data.username, testUsername.toLowerCase(), "Expected matching username");
}

async function testVerifyInvalidToken(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=verifyToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer invalidtoken123",
      "X-Username": "testuser",
    },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testAuthenticateWithPassword(): Promise<void> {
  if (!testUsername) {
    throw new Error("No test username available");
  }
  const res = await fetch(
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
  testToken = data.token; // Update token
}

async function testAuthenticateWithWrongPassword(): Promise<void> {
  if (!testUsername) {
    throw new Error("No test username available");
  }
  const res = await fetch(
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
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=getUsers&search=test`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.users), "Expected users array");
}

async function testGetUsersShortQuery(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=getUsers&search=a`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.users), "Expected users array");
  assertEq(data.users.length, 0, "Expected empty array for short query");
}

async function testJoinRoomMissingFields(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=joinRoom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testSendMessageUnauthorized(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=sendMessage`, {
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
  const res = await fetch(
    `${BASE_URL}/api/chat-rooms?action=deleteRoom&roomId=test`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }
  );
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testInvalidAction(): Promise<void> {
  // Non-public actions require auth first, so invalid action returns 401
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=invalidAction`);
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testCheckPasswordWithAuth(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("No test token available");
  }
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=checkPassword`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${testToken}`,
      "X-Username": testUsername,
    },
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.hasPassword === true, "Expected hasPassword to be true");
}

async function testListTokens(): Promise<void> {
  if (!testToken || !testUsername) {
    throw new Error("No test token available");
  }
  const res = await fetch(`${BASE_URL}/api/chat-rooms?action=listTokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testToken}`,
      "X-Username": testUsername,
    },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.tokens), "Expected tokens array");
  assert(data.count >= 1, "Expected at least 1 token");
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log(`\n🧪 Testing Chat Rooms API at ${BASE_URL}\n`);
  console.log("=".repeat(60));

  // Public endpoints
  console.log("\n📋 Testing Public Endpoints\n");
  await runTest("GET /api/chat-rooms?action=getRooms", testGetRooms);
  await runTest(
    "GET /api/chat-rooms?action=getRooms&username=...",
    testGetRoomsWithUsername
  );
  await runTest("GET /api/chat-rooms?action=getUsers", testGetUsers);
  await runTest(
    "GET /api/chat-rooms?action=getUsers (short query)",
    testGetUsersShortQuery
  );
  await runTest(
    "GET /api/chat-rooms?action=invalidAction",
    testInvalidAction
  );

  // User creation validation
  console.log("\n📋 Testing User Creation Validation\n");
  await runTest(
    "POST createUser - missing username",
    testCreateUserMissingUsername
  );
  await runTest(
    "POST createUser - missing password",
    testCreateUserMissingPassword
  );
  await runTest(
    "POST createUser - short password",
    testCreateUserShortPassword
  );
  await runTest(
    "POST createUser - invalid username",
    testCreateUserInvalidUsername
  );

  // User creation success
  console.log("\n📋 Testing User Creation & Authentication\n");
  await runTest("POST createUser - success", testCreateUserSuccess);
  await runTest("POST verifyToken - valid token", testVerifyToken);
  await runTest("POST verifyToken - invalid token", testVerifyInvalidToken);
  await runTest(
    "POST authenticateWithPassword - success",
    testAuthenticateWithPassword
  );
  await runTest(
    "POST authenticateWithPassword - wrong password",
    testAuthenticateWithWrongPassword
  );

  // Protected endpoints
  console.log("\n📋 Testing Protected Endpoints\n");
  await runTest("GET checkPassword - with auth", testCheckPasswordWithAuth);
  await runTest("POST listTokens - with auth", testListTokens);

  // Authorization checks
  console.log("\n📋 Testing Authorization\n");
  await runTest("POST joinRoom - missing fields", testJoinRoomMissingFields);
  await runTest("POST sendMessage - unauthorized", testSendMessageUnauthorized);
  await runTest("DELETE deleteRoom - unauthorized", testDeleteRoomUnauthorized);

  // Summary
  console.log("\n" + "=".repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n📊 Test Summary:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏱️  Total time: ${totalDuration}ms`);

  if (failed > 0) {
    console.log(`\n❌ Failed tests:`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`   - ${r.name}: ${r.error}`);
      });
    process.exit(1);
  } else {
    console.log(`\n✅ All tests passed!`);
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});

