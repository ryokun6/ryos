#!/usr/bin/env bun
/**
 * Tests for additional auth-related API endpoints
 * 
 * Tests:
 * - /api/auth/password/set - Set/update password
 * - /api/auth/logout-all - Logout all sessions
 * - /api/users - User search
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
let isAdminUser = false;

// Admin test credentials
const ADMIN_USERNAME = "ryo";
const ADMIN_PASSWORD = "testtest";

const makeRateLimitBypassHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "X-Forwarded-For": `10.3.${Date.now() % 255}.${Math.floor(Math.random() * 255)}`,
});

// ============================================================================
// Setup - Use admin user or create a test user for auth tests
// ============================================================================

async function setupTestUser(): Promise<void> {
  // First, try to login with admin user (more reliable)
  const adminLoginRes = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  
  if (adminLoginRes.status === 200) {
    const data = await adminLoginRes.json();
    testToken = data.token;
    testUsername = ADMIN_USERNAME;
    isAdminUser = true;
    return;
  }
  
  // Fallback: create a new test user
  testUsername = `authextra${Date.now()}`;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username: testUsername, password: "testpassword123" }),
  });
  
  if (res.status === 201) {
    const data = await res.json();
    testToken = data.token;
    isAdminUser = false;
  }
}

// ============================================================================
// Password Set Tests (/api/auth/password/set)
// ============================================================================

async function testPasswordSetMissingAuth(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/password/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "newpassword123" }),
  });
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Unauthorized"), "Expected unauthorized error");
}

async function testPasswordSetMissingToken(): Promise<void> {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Origin", "http://localhost:3000");
  headers.set("X-Username", "someuser");
  // Missing Authorization header
  
  const res = await fetch(`${BASE_URL}/api/auth/password/set`, {
    method: "POST",
    headers,
    body: JSON.stringify({ password: "newpassword123" }),
  });
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("missing credentials"), "Expected missing credentials error");
}

async function testPasswordSetMissingPassword(): Promise<void> {
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth available)");
    return;
  }
  
  const res = await fetchWithAuth(`${BASE_URL}/api/auth/password/set`, testUsername, testToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Password is required"), "Expected password required error");
}

async function testPasswordSetTooShort(): Promise<void> {
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth available)");
    return;
  }
  
  const res = await fetchWithAuth(`${BASE_URL}/api/auth/password/set`, testUsername, testToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "abc" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("at least"), "Expected minimum length error");
}

async function testPasswordSetTooLong(): Promise<void> {
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth available)");
    return;
  }
  
  const longPassword = "a".repeat(200);
  const res = await fetchWithAuth(`${BASE_URL}/api/auth/password/set`, testUsername, testToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: longPassword }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("or less"), "Expected maximum length error");
}

async function testPasswordSetInvalidMethod(): Promise<void> {
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth available)");
    return;
  }
  
  const res = await fetchWithAuth(`${BASE_URL}/api/auth/password/set`, testUsername, testToken, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testPasswordSetSuccess(): Promise<void> {
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth available)");
    return;
  }
  
  // For admin user, set password to same value (safe)
  // For test user, use test password
  const password = isAdminUser ? ADMIN_PASSWORD : "testpassword123";
  
  const res = await fetchWithAuth(`${BASE_URL}/api/auth/password/set`, testUsername, testToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
}

// ============================================================================
// Logout All Tests (/api/auth/logout-all)
// ============================================================================

async function testLogoutAllMissingAuth(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/logout-all`, {
    method: "POST",
  });
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Unauthorized"), "Expected unauthorized error");
}

async function testLogoutAllMissingToken(): Promise<void> {
  const headers = new Headers();
  headers.set("Origin", "http://localhost:3000");
  headers.set("X-Username", "someuser");
  // Missing Authorization header
  
  const res = await fetch(`${BASE_URL}/api/auth/logout-all`, {
    method: "POST",
    headers,
  });
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("missing credentials"), "Expected missing credentials error");
}

async function testLogoutAllInvalidMethod(): Promise<void> {
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth available)");
    return;
  }
  
  const res = await fetchWithAuth(`${BASE_URL}/api/auth/logout-all`, testUsername, testToken, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testLogoutAllInvalidToken(): Promise<void> {
  const headers = new Headers();
  headers.set("Origin", "http://localhost:3000");
  headers.set("Authorization", "Bearer invalid_token_here");
  headers.set("X-Username", "someuser");
  
  const res = await fetch(`${BASE_URL}/api/auth/logout-all`, {
    method: "POST",
    headers,
  });
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("invalid token"), "Expected invalid token error");
}

async function testLogoutAllSuccess(): Promise<void> {
  if (!testToken || !testUsername) {
    console.log("  ⚠️  Skipped (no auth available)");
    return;
  }
  
  if (isAdminUser) {
    // Skip for admin user to avoid logging out admin sessions
    console.log("  ⚠️  Skipped (using admin user - avoiding session invalidation)");
    return;
  }
  
  const res = await fetchWithAuth(`${BASE_URL}/api/auth/logout-all`, testUsername, testToken, {
    method: "POST",
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, "Expected success: true");
  assert(typeof data.deletedCount === "number", "Expected deletedCount to be a number");
  assert(data.message?.includes("Logged out"), "Expected logout message");
}

// ============================================================================
// User Search Tests (/api/users)
// ============================================================================

async function testUserSearchInvalidMethod(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testUserSearchNoQuery(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/users`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.users), "Expected users array in response");
}

async function testUserSearchWithQuery(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/users?search=test`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.users), "Expected users array in response");
}

async function testUserSearchEmptyQuery(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/users?search=`);
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.users), "Expected users array in response");
}

async function testUserSearchSpecialChars(): Promise<void> {
  // Test that special characters in search query don't break the endpoint
  const res = await fetchWithOrigin(`${BASE_URL}/api/users?search=${encodeURIComponent("test@#$%")}`);
  // Should either return 200 with empty results or handle gracefully
  assert(res.status === 200 || res.status === 400, `Expected 200 or 400, got ${res.status}`);
  const data = await res.json();
  if (res.status === 200) {
    assert(Array.isArray(data.users), "Expected users array in response");
  }
}

// ============================================================================
// Main
// ============================================================================

export async function runAuthExtraTests(): Promise<{ passed: number; failed: number }> {
  clearResults();

  console.log("\n🔐 Auth Extra API Tests\n");
  console.log(`Testing against: ${BASE_URL}\n`);

  // Setup
  console.log(section("Setup"));
  await runTest("Create test user", setupTestUser);

  // Password Set Tests
  console.log(section("Password Set Tests (/api/auth/password/set)"));
  await runTest("Password set - missing auth headers", testPasswordSetMissingAuth);
  await runTest("Password set - missing token", testPasswordSetMissingToken);
  await runTest("Password set - missing password", testPasswordSetMissingPassword);
  await runTest("Password set - password too short", testPasswordSetTooShort);
  await runTest("Password set - password too long", testPasswordSetTooLong);
  await runTest("Password set - invalid method (GET)", testPasswordSetInvalidMethod);
  await runTest("Password set - success", testPasswordSetSuccess);

  // Logout All Tests
  console.log(section("Logout All Tests (/api/auth/logout-all)"));
  await runTest("Logout all - missing auth headers", testLogoutAllMissingAuth);
  await runTest("Logout all - missing token", testLogoutAllMissingToken);
  await runTest("Logout all - invalid method (GET)", testLogoutAllInvalidMethod);
  await runTest("Logout all - invalid token", testLogoutAllInvalidToken);
  // Note: Running logout-all success last as it invalidates the test token
  await runTest("Logout all - success", testLogoutAllSuccess);

  // User Search Tests
  console.log(section("User Search Tests (/api/users)"));
  await runTest("User search - invalid method (POST)", testUserSearchInvalidMethod);
  await runTest("User search - no query", testUserSearchNoQuery);
  await runTest("User search - with query", testUserSearchWithQuery);
  await runTest("User search - empty query", testUserSearchEmptyQuery);
  await runTest("User search - special characters", testUserSearchSpecialChars);

  return printSummary();
}

if (import.meta.main) {
  runAuthExtraTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
