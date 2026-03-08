#!/usr/bin/env bun
/**
 * Tests for /api/admin endpoint
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
} from "./test-utils";

// Admin user credentials for dev testing
const ADMIN_USERNAME = "ryo";
const ADMIN_PASSWORD = "testtest";
let adminToken: string | null = null;

// Test user for deletion tests
let testUserToken: string | null = null;
let testUsername: string | null = null;
let activityRoomId: string | null = null;

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
      const data = await res.json();
      expect(data.token).toBeTruthy();
      adminToken = data.token;
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
      const createData = await createRes.json();
      adminToken = createData.token;
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
      const data = await res.json();
      expect(data.token).toBeTruthy();
      testUserToken = data.token;
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
        const data = await loginRes.json();
        testUserToken = data.token;
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

    test("GET getUserProfile - returns lightweight profile payload", async () => {
      if (!adminToken || !testUsername) {
        console.log("  ⚠️  Skipped (no admin token or test user available)");
        return;
      }

      const res = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=getUserProfile&username=${encodeURIComponent(testUsername)}`,
        ADMIN_USERNAME,
        adminToken,
        { method: "GET" }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.username).toBe(testUsername);
      expect(typeof data.lastActive).toBe("number");
      expect("rooms" in data).toBe(false);
      expect("messageCount" in data).toBe(false);
    });

    test("GET getUserRoomActivity - loads rooms and recent messages on demand", async () => {
      if (!adminToken || !testUserToken || !testUsername) {
        console.log("  ⚠️  Skipped (missing auth setup)");
        return;
      }

      const createRoomRes = await fetchWithAuth(
        `${BASE_URL}/api/rooms`,
        ADMIN_USERNAME,
        adminToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "private",
            members: [testUsername],
          }),
        }
      );
      expect(createRoomRes.status).toBe(201);
      const createRoomData = await createRoomRes.json();
      activityRoomId = createRoomData.room?.id ?? null;
      expect(activityRoomId).toBeTruthy();

      const messageContent = `Admin activity test message ${Date.now()}`;
      const sendMessageRes = await fetchWithAuth(
        `${BASE_URL}/api/rooms/${activityRoomId}/messages`,
        testUsername,
        testUserToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: messageContent }),
        }
      );
      expect(sendMessageRes.status).toBe(201);

      const activityRes = await fetchWithAuth(
        `${BASE_URL}/api/admin?action=getUserRoomActivity&username=${encodeURIComponent(testUsername)}&limit=10`,
        ADMIN_USERNAME,
        adminToken,
        { method: "GET" }
      );
      expect(activityRes.status).toBe(200);
      const activityData = await activityRes.json();

      expect(typeof activityData.messageCount).toBe("number");
      expect(activityData.messageCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(activityData.rooms)).toBe(true);
      expect(Array.isArray(activityData.messages)).toBe(true);
      expect(activityData.rooms.some((room: { id: string }) => room.id === activityRoomId)).toBe(true);
      expect(
        activityData.messages.some(
          (message: { roomId: string; content: string }) =>
            message.roomId === activityRoomId && message.content.includes("Admin activity test message")
        )
      ).toBe(true);
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
