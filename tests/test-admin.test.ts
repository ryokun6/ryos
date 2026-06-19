#!/usr/bin/env bun
/**
 * Tests for /api/admin endpoint
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  getTokenFromAuthCookie,
} from "./test-utils";
import { redisKeys } from "../src/shared/redisKeys";

// Admin user credentials for dev testing
const ADMIN_USERNAME = "ryo";
// Canonical Redis key where the admin user's profile is stored post-cutover.
const ADMIN_PROFILE_KEY = redisKeys.auth.userProfile(ADMIN_USERNAME);
const ADMIN_PASSWORD = "testtest";
let adminToken: string | null = null;

// Test user for deletion tests
let testUserToken: string | null = null;
let testUsername: string | null = null;

describe("admin", () => {
  beforeAll(async () => {
    // Setup - Admin authentication
    const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
    });

    if (res.status === 200) {
      adminToken = getTokenFromAuthCookie(res);
      expect(adminToken).toBeTruthy();
      return;
    }

    const createRes = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
    });

    if (createRes.status === 201) {
      adminToken = getTokenFromAuthCookie(createRes);
      return;
    }

    if (createRes.status === 409) {
      console.log("  ⚠️  Admin user exists with a different password; skipping admin-auth tests");
      return;
    }

    if (createRes.status === 429) {
      console.log("  ⚠️  Admin user setup rate-limited; skipping admin-auth tests");
      return;
    }

    throw new Error(`Failed to setup admin auth: ${createRes.status}`);
  });

  beforeAll(async () => {
    // Setup - Test user
    testUsername = `testuser_${Date.now()}`;
    const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `10.0.${Date.now() % 255}.${Math.floor(Math.random() * 255)}`,
      },
      body: JSON.stringify({
        username: testUsername,
        password: "testpassword123",
      }),
    });

    if (res.status === 201) {
      testUserToken = getTokenFromAuthCookie(res);
      expect(testUserToken).toBeTruthy();
      return;
    }

    if (res.status === 409) {
      const loginRes = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: testUsername,
          password: "testpassword123",
        }),
      });

      if (loginRes.status === 200) {
        testUserToken = getTokenFromAuthCookie(loginRes);
        return;
      }
    }

    if (res.status === 429) {
      console.log("  ⚠️  Test user setup rate-limited; skipping non-admin user tests");
      return;
    }

    throw new Error(`Expected 201 when creating test user, got ${res.status}`);
  });

  describe("Admin Access", () => {
    test("GET getStats - without auth (forbidden)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/admin?action=getStats`, {
        method: "GET",
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Forbidden");
    });

    test("GET getStats - with invalid token (forbidden)", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=getStats`,
        ADMIN_USERNAME,
        "invalid_token_12345",
        { method: "GET" }
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Forbidden");
    });

    test("GET getStats - with non-admin user (forbidden)", async () => {
      if (!testUserToken || !testUsername) {
        console.log("  ⚠️  Skipped (no test user available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=getStats`,
        testUsername,
        testUserToken,
        { method: "GET" }
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Forbidden");
    });

    test("GET getStats - with admin token", async () => {
      if (!adminToken) {
        console.log("  ⚠️  Skipped (no admin token available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=getStats`,
        ADMIN_USERNAME,
        adminToken,
        { method: "GET" }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data.totalUsers).toBe("number");
      expect(typeof data.totalRooms).toBe("number");
      expect(typeof data.totalMessages).toBe("number");
      expect(data.totalUsers).toBeGreaterThanOrEqual(0);
      expect(data.totalRooms).toBeGreaterThanOrEqual(0);
      expect(data.totalMessages).toBeGreaterThanOrEqual(0);
    });

    test("GET getCursorAgentRuns - with admin token", async () => {
      if (!adminToken) {
        console.log("  ⚠️  Skipped (no admin token available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=getCursorAgentRuns&limit=10`,
        ADMIN_USERNAME,
        adminToken,
        { method: "GET" }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.runs)).toBe(true);
      expect(typeof data.truncated).toBe("boolean");
      expect(typeof data.totalCount).toBe("number");
    });
  });

  describe("Admin Operations", () => {
    test("GET getAllUsers - with admin token", async () => {
      if (!adminToken) {
        console.log("  ⚠️  Skipped (no admin token available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=getAllUsers`,
        ADMIN_USERNAME,
        adminToken,
        { method: "GET" }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.users)).toBe(true);
      expect(data.users.length).toBeGreaterThan(0);

      const adminUser = data.users.find(
        (u: { username: string }) => u.username.toLowerCase() === ADMIN_USERNAME.toLowerCase()
      );
      expect(adminUser).toBeTruthy();
      expect(typeof adminUser.lastActive).toBe("number");
    });

    test("GET listRedisKeys - with admin token", async () => {
      if (!adminToken) {
        console.log("  ⚠️  Skipped (no admin token available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=listRedisKeys&pattern=${encodeURIComponent(ADMIN_PROFILE_KEY)}&count=10`,
        ADMIN_USERNAME,
        adminToken,
        { method: "GET" }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.keys)).toBe(true);
      expect(data.keys.some((key: { key: string }) => key.key === ADMIN_PROFILE_KEY)).toBe(true);
      const adminKey = data.keys.find((key: { key: string }) => key.key === ADMIN_PROFILE_KEY);
      expect(adminKey.type).toBe("string");
      expect(typeof adminKey.ttl).toBe("number");
    });

    test("GET getRedisKey - with admin token", async () => {
      if (!adminToken) {
        console.log("  ⚠️  Skipped (no admin token available)");
        return;
      }

      const redisKey = ADMIN_PROFILE_KEY;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=getRedisKey&key=${encodeURIComponent(redisKey)}`,
        ADMIN_USERNAME,
        adminToken,
        { method: "GET" }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.key).toBe(redisKey);
      expect(data.type).toBe("string");
      const valueText =
        typeof data.value === "string" ? data.value : JSON.stringify(data.value);
      expect(valueText).toContain(ADMIN_USERNAME);
    });

    test("GET backupRedisKeys - with admin token", async () => {
      if (!adminToken) {
        console.log("  ⚠️  Skipped (no admin token available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=backupRedisKeys&pattern=${encodeURIComponent(ADMIN_PROFILE_KEY)}&limit=10`,
        ADMIN_USERNAME,
        adminToken,
        { method: "GET" }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.pattern).toBe(ADMIN_PROFILE_KEY);
      expect(data.keyCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(data.keys)).toBe(true);
      expect(data.keys.some((key: { key: string }) => key.key === ADMIN_PROFILE_KEY)).toBe(true);
    });

    test("POST deleteRedisKey - requires exact confirmation", async () => {
      if (!adminToken) {
        console.log("  ⚠️  Skipped (no admin token available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin`,
        ADMIN_USERNAME,
        adminToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deleteRedisKey",
            key: ADMIN_PROFILE_KEY,
            confirmKey: "wrong-key",
          }),
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Confirmation");
    });

    test("POST deleteUser - missing target username", async () => {
      if (!adminToken) {
        console.log("  ⚠️  Skipped (no admin token available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin`,
        ADMIN_USERNAME,
        adminToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deleteUser",
          }),
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Target username");
    });

    test("POST deleteUser - try to delete admin (forbidden)", async () => {
      if (!adminToken) {
        console.log("  ⚠️  Skipped (no admin token available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin`,
        ADMIN_USERNAME,
        adminToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deleteUser",
            targetUsername: ADMIN_USERNAME,
          }),
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("admin");
    });

    test("POST deleteUser - delete test user", async () => {
      if (!adminToken || !testUsername) {
        console.log("  ⚠️  Skipped (no admin token or test user available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin`,
        ADMIN_USERNAME,
        adminToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deleteUser",
            targetUsername: testUsername,
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe("Error Cases", () => {
    test("GET invalid action", async () => {
      if (!adminToken) {
        console.log("  ⚠️  Skipped (no admin token available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=invalidAction`,
        ADMIN_USERNAME,
        adminToken,
        { method: "GET" }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid action");
    });

    test("PUT invalid method", async () => {
      if (!adminToken) {
        console.log("  ⚠️  Skipped (no admin token available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=getStats`,
        ADMIN_USERNAME,
        adminToken,
        { method: "PUT" }
      );

      expect(res.status).toBe(405);
      const data = await res.json();
      expect(data.error).toContain("Method not allowed");
    });
  });
});
