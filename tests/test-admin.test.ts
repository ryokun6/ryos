#!/usr/bin/env bun
/**
 * Tests for /api/admin endpoint
 *
 * Admin auth + a throwaway test user are set up once at module load. When the
 * environment legitimately cannot provide them (admin user pre-exists with a
 * different password, or setup is rate-limited) the dependent tests are
 * SKIPPED via `test.skipIf` — reported as skipped rather than silently passing,
 * so a real auth regression still surfaces (unexpected statuses throw).
 */

import { describe, test, expect } from "bun:test";
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

async function setupAdminToken(): Promise<string | null> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });

  if (res.status === 200) {
    const token = getTokenFromAuthCookie(res);
    if (!token) {
      throw new Error("admin login succeeded but no auth cookie was returned");
    }
    return token;
  }

  const createRes = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });

  if (createRes.status === 201) {
    const token = getTokenFromAuthCookie(createRes);
    if (!token) {
      throw new Error("admin register succeeded but no auth cookie was returned");
    }
    return token;
  }

  // Legit environment limitations -> skip (not fail). Anything else is a real
  // problem and should blow up the suite.
  if (createRes.status === 409 || createRes.status === 429) {
    return null;
  }

  throw new Error(`Failed to setup admin auth: ${createRes.status}`);
}

async function setupTestUser(): Promise<{
  username: string;
  token: string;
} | null> {
  const username = `testuser_${Date.now()}`;
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `10.0.${Date.now() % 255}.${Math.floor(
        Math.random() * 255
      )}`,
    },
    body: JSON.stringify({ username, password: "testpassword123" }),
  });

  if (res.status === 201) {
    const token = getTokenFromAuthCookie(res);
    if (!token) {
      throw new Error("test user register succeeded but no auth cookie was returned");
    }
    return { username, token };
  }

  if (res.status === 409) {
    const loginRes = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "testpassword123" }),
    });
    if (loginRes.status === 200) {
      const token = getTokenFromAuthCookie(loginRes);
      if (!token) {
        throw new Error("test user login succeeded but no auth cookie was returned");
      }
      return { username, token };
    }
  }

  if (res.status === 429) {
    return null;
  }

  throw new Error(`Expected 201 when creating test user, got ${res.status}`);
}

// Top-level setup so the skip conditions are known when tests are defined
// (`test.skipIf` is evaluated at collection time, not after `beforeAll`).
const adminToken = await setupAdminToken();
const testUser = await setupTestUser();
const testUsername = testUser?.username ?? null;
const testUserToken = testUser?.token ?? null;

const skipWithoutAdmin = !adminToken;
const skipWithoutTestUser = !testUserToken || !testUsername;

describe("admin", () => {
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

    test.skipIf(skipWithoutTestUser)(
      "GET getStats - with non-admin user (forbidden)",
      async () => {
        const res = await fetchWithAuth(
          `${BASE_URL}/api/admin?action=getStats`,
          testUsername!,
          testUserToken!,
          { method: "GET" }
        );

        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toContain("Forbidden");
      }
    );

    test.skipIf(skipWithoutAdmin)(
      "GET getStats - with admin token",
      async () => {
        const res = await fetchWithAuth(
          `${BASE_URL}/api/admin?action=getStats`,
          ADMIN_USERNAME,
          adminToken!,
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
      }
    );

    test.skipIf(skipWithoutAdmin)(
      "GET getCursorAgentRuns - with admin token",
      async () => {
        const res = await fetchWithAuth(
          `${BASE_URL}/api/admin?action=getCursorAgentRuns&limit=10`,
          ADMIN_USERNAME,
          adminToken!,
          { method: "GET" }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data.runs)).toBe(true);
        expect(typeof data.truncated).toBe("boolean");
        expect(typeof data.totalCount).toBe("number");
      }
    );
  });

  describe("Admin Operations", () => {
    test.skipIf(skipWithoutAdmin)(
      "GET getAllUsers - with admin token",
      async () => {
        const res = await fetchWithAuth(
          `${BASE_URL}/api/admin?action=getAllUsers`,
          ADMIN_USERNAME,
          adminToken!,
          { method: "GET" }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data.users)).toBe(true);
        expect(data.users.length).toBeGreaterThan(0);

        const adminUser = data.users.find(
          (u: { username: string }) =>
            u.username.toLowerCase() === ADMIN_USERNAME.toLowerCase()
        );
        expect(adminUser).toBeTruthy();
        expect(typeof adminUser.lastActive).toBe("number");
      }
    );

    test.skipIf(skipWithoutAdmin)(
      "GET listRedisKeys - with admin token",
      async () => {
        const res = await fetchWithAuth(
          `${BASE_URL}/api/admin?action=listRedisKeys&pattern=${encodeURIComponent(
            ADMIN_PROFILE_KEY
          )}&count=10`,
          ADMIN_USERNAME,
          adminToken!,
          { method: "GET" }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data.keys)).toBe(true);
        expect(
          data.keys.some((key: { key: string }) => key.key === ADMIN_PROFILE_KEY)
        ).toBe(true);
        const adminKey = data.keys.find(
          (key: { key: string }) => key.key === ADMIN_PROFILE_KEY
        );
        expect(adminKey.type).toBe("string");
        expect(typeof adminKey.ttl).toBe("number");
      }
    );

    test.skipIf(skipWithoutAdmin)(
      "GET getRedisKey - with admin token",
      async () => {
        const redisKey = ADMIN_PROFILE_KEY;
        const res = await fetchWithAuth(
          `${BASE_URL}/api/admin?action=getRedisKey&key=${encodeURIComponent(
            redisKey
          )}`,
          ADMIN_USERNAME,
          adminToken!,
          { method: "GET" }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.key).toBe(redisKey);
        expect(data.type).toBe("string");
        const valueText =
          typeof data.value === "string"
            ? data.value
            : JSON.stringify(data.value);
        expect(valueText).toContain(ADMIN_USERNAME);
      }
    );

    test.skipIf(skipWithoutAdmin)(
      "GET backupRedisKeys - with admin token",
      async () => {
        const res = await fetchWithAuth(
          `${BASE_URL}/api/admin?action=backupRedisKeys&pattern=${encodeURIComponent(
            ADMIN_PROFILE_KEY
          )}&limit=10`,
          ADMIN_USERNAME,
          adminToken!,
          { method: "GET" }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.pattern).toBe(ADMIN_PROFILE_KEY);
        expect(data.keyCount).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(data.keys)).toBe(true);
        expect(
          data.keys.some((key: { key: string }) => key.key === ADMIN_PROFILE_KEY)
        ).toBe(true);
      }
    );

    test.skipIf(skipWithoutAdmin)(
      "POST deleteRedisKey - requires exact confirmation",
      async () => {
        const res = await fetchWithAuth(
          `${BASE_URL}/api/admin`,
          ADMIN_USERNAME,
          adminToken!,
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
      }
    );

    test.skipIf(skipWithoutAdmin)(
      "POST deleteUser - missing target username",
      async () => {
        const res = await fetchWithAuth(
          `${BASE_URL}/api/admin`,
          ADMIN_USERNAME,
          adminToken!,
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
      }
    );

    test.skipIf(skipWithoutAdmin)(
      "POST deleteUser - try to delete admin (forbidden)",
      async () => {
        const res = await fetchWithAuth(
          `${BASE_URL}/api/admin`,
          ADMIN_USERNAME,
          adminToken!,
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
      }
    );

    test.skipIf(skipWithoutAdmin || skipWithoutTestUser)(
      "POST deleteUser - delete test user",
      async () => {
        const res = await fetchWithAuth(
          `${BASE_URL}/api/admin`,
          ADMIN_USERNAME,
          adminToken!,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "deleteUser",
              targetUsername: testUsername!,
            }),
          }
        );

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
      }
    );
  });

  describe("Error Cases", () => {
    test.skipIf(skipWithoutAdmin)("GET invalid action", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=invalidAction`,
        ADMIN_USERNAME,
        adminToken!,
        { method: "GET" }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid action");
    });

    test.skipIf(skipWithoutAdmin)("PUT invalid method", async () => {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=getStats`,
        ADMIN_USERNAME,
        adminToken!,
        { method: "PUT" }
      );

      expect(res.status).toBe(405);
      const data = await res.json();
      expect(data.error).toContain("Method not allowed");
    });
  });
});
