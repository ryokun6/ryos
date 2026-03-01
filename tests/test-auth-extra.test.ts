/**
 * Tests for additional auth-related API endpoints
 *
 * Tests:
 * - /api/auth/password/set - Set/update password
 * - /api/auth/logout-all - Logout all sessions
 * - /api/users - User search
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  makeRateLimitBypassHeaders,
} from "./test-utils";

const ADMIN_USERNAME = "ryo";
const ADMIN_PASSWORD = "testtest";

let testToken: string | null = null;
let testUsername: string | null = null;
let isAdminUser = false;

// ============================================================================
// Setup - Use admin user or create a test user for auth tests
// ============================================================================

async function setupTestUser(): Promise<void> {
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

describe("Auth Extra API Tests", () => {
  beforeAll(async () => {
    await setupTestUser();
  });

  // ============================================================================
  // Password Set Tests (/api/auth/password/set)
  // ============================================================================

  describe("Password Set Tests (/api/auth/password/set)", () => {
    test("Password set - missing auth headers", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/password/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "newpassword123" }),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error?.includes("Unauthorized")).toBe(true);
    });

    test("Password set - missing token", async () => {
      const headers = new Headers({ "Content-Type": "application/json" });
      headers.set("Origin", "http://localhost:3000");
      headers.set("X-Username", "someuser");

      const res = await fetch(`${BASE_URL}/api/auth/password/set`, {
        method: "POST",
        headers,
        body: JSON.stringify({ password: "newpassword123" }),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error?.includes("missing credentials")).toBe(true);
    });

    test("Password set - missing password", async () => {
      if (!testToken || !testUsername) return;

      const res = await fetchWithAuth(
        `${BASE_URL}/api/auth/password/set`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.includes("Password is required")).toBe(true);
    });

    test("Password set - password too short", async () => {
      if (!testToken || !testUsername) return;

      const res = await fetchWithAuth(
        `${BASE_URL}/api/auth/password/set`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "abc" }),
        }
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.includes("at least")).toBe(true);
    });

    test("Password set - password too long", async () => {
      if (!testToken || !testUsername) return;

      const longPassword = "a".repeat(200);
      const res = await fetchWithAuth(
        `${BASE_URL}/api/auth/password/set`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: longPassword }),
        }
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.includes("or less")).toBe(true);
    });

    test("Password set - invalid method (GET)", async () => {
      if (!testToken || !testUsername) return;

      const res = await fetchWithAuth(
        `${BASE_URL}/api/auth/password/set`,
        testUsername,
        testToken,
        { method: "GET" }
      );
      expect(res.status).toBe(405);
    });

    test("Password set - success", async () => {
      if (!testToken || !testUsername) return;

      const password = isAdminUser ? ADMIN_PASSWORD : "testpassword123";

      const res = await fetchWithAuth(
        `${BASE_URL}/api/auth/password/set`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  // ============================================================================
  // Logout All Tests (/api/auth/logout-all)
  // ============================================================================

  describe("Logout All Tests (/api/auth/logout-all)", () => {
    test("Logout all - missing auth headers", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/logout-all`, {
        method: "POST",
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error?.includes("Unauthorized")).toBe(true);
    });

    test("Logout all - missing token", async () => {
      const headers = new Headers();
      headers.set("Origin", "http://localhost:3000");
      headers.set("X-Username", "someuser");

      const res = await fetch(`${BASE_URL}/api/auth/logout-all`, {
        method: "POST",
        headers,
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error?.includes("missing credentials")).toBe(true);
    });

    test("Logout all - invalid method (GET)", async () => {
      if (!testToken || !testUsername) return;

      const res = await fetchWithAuth(
        `${BASE_URL}/api/auth/logout-all`,
        testUsername,
        testToken,
        { method: "GET" }
      );
      expect(res.status).toBe(405);
    });

    test("Logout all - invalid token", async () => {
      const headers = new Headers();
      headers.set("Origin", "http://localhost:3000");
      headers.set("Authorization", "Bearer invalid_token_here");
      headers.set("X-Username", "someuser");

      const res = await fetch(`${BASE_URL}/api/auth/logout-all`, {
        method: "POST",
        headers,
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error?.includes("invalid token")).toBe(true);
    });

    test("Logout all - success", async () => {
      if (!testToken || !testUsername) return;

      if (isAdminUser) return;

      const res = await fetchWithAuth(
        `${BASE_URL}/api/auth/logout-all`,
        testUsername,
        testToken,
        { method: "POST" }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(typeof data.deletedCount).toBe("number");
      expect(data.message?.includes("Logged out")).toBe(true);
    });
  });

  // ============================================================================
  // User Search Tests (/api/users)
  // ============================================================================

  describe("User Search Tests (/api/users)", () => {
    test("User search - invalid method (POST)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(405);
    });

    test("User search - no query", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/users`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.users)).toBe(true);
    });

    test("User search - with query", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/users?search=test`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.users)).toBe(true);
    });

    test("User search - empty query", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/users?search=`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.users)).toBe(true);
    });

    test("User search - special characters", async () => {
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/users?search=${encodeURIComponent("test@#$%")}`
      );
      expect(res.status === 200 || res.status === 400).toBe(true);
      const data = await res.json();
      if (res.status === 200) {
        expect(Array.isArray(data.users)).toBe(true);
      }
    });
  });
});
