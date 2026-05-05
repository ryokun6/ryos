/**
 * Tests for room-related API endpoints not covered in test-new-api.ts
 *
 * Tests:
 * - POST /api/rooms/[id]/join - Join a room
 * - POST /api/rooms/[id]/leave - Leave a room
 * - DELETE /api/rooms/[id]/messages/[msgId] - Delete a message (admin only)
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  getTokenFromAuthCookie,
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
    testToken = getTokenFromAuthCookie(res);
  } else if (res.status === 409) {
    // User exists, try login
    const loginRes = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: testUsername, password: "testpassword123" }),
    });
    if (loginRes.ok) {
      testToken = getTokenFromAuthCookie(loginRes);
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
    adminToken = getTokenFromAuthCookie(res);
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
// Main
// ============================================================================

describe("Rooms Extra API", () => {
  beforeAll(async () => {
    await setupTestRoom();
    await setupTestUser();
    await setupAdminUser();
    await setupTestMessage();
  });

  describe("Join Room Tests", () => {
    test("Join room - missing room ID", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/rooms//join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser" }),
      });
      expect(res.status === 400 || res.status === 404 || res.status === 405).toBe(true);
    });

    test("Join room - missing auth", async () => {
      if (!testRoomId) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error?.includes("Unauthorized")).toBe(true);
    });

    test("Join room - invalid token", async () => {
      if (!testRoomId) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/${testRoomId}/join`,
        testUsername || "fallback-user",
        "invalid-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "ab" }),
        }
      );
      expect(res.status).toBe(401);
    });

    test("Join room - non-existent room", async () => {
      if (!testUsername || !testToken) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/nonexistent-room-xyz/join`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: testUsername }),
        }
      );
      expect(res.status === 400 || res.status === 404).toBe(true);
    });

    test("Join room - success", async () => {
      if (!testRoomId || !testUsername || !testToken) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/${testRoomId}/join`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: testUsername }),
        }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    test("Join room - wrong method", async () => {
      if (!testRoomId) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/join`, {
        method: "GET",
      });
      expect(res.status).toBe(405);
    });
  });

  describe("Leave Room Tests", () => {
    test("Leave room - missing auth", async () => {
      if (!testRoomId) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error?.includes("Unauthorized")).toBe(true);
    });

    test("Leave room - invalid token", async () => {
      if (!testRoomId) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/${testRoomId}/leave`,
        testUsername || "fallback-user",
        "invalid-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "x" }),
        }
      );
      expect(res.status).toBe(401);
    });

    test("Leave room - non-existent room", async () => {
      if (!testUsername || !testToken) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/nonexistent-room-xyz/leave`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: testUsername }),
        }
      );
      expect(res.status === 400 || res.status === 404).toBe(true);
    });

    test("Leave room - success", async () => {
      if (!testRoomId || !testUsername || !testToken) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/${testRoomId}/leave`,
        testUsername,
        testToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: testUsername }),
        }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    test("Leave room - wrong method", async () => {
      if (!testRoomId) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/leave`, {
        method: "GET",
      });
      expect(res.status).toBe(405);
    });
  });

  describe("Delete Message Tests", () => {
    test("Delete message - missing auth", async () => {
      if (!testRoomId) return;
      const res = await fetchWithOrigin(
        `${BASE_URL}/api/rooms/${testRoomId}/messages/test-msg-id`,
        { method: "DELETE" }
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error?.includes("Unauthorized")).toBe(true);
    });

    test("Delete message - invalid token", async () => {
      if (!testRoomId) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/${testRoomId}/messages/test-msg-id`,
        "someuser",
        "invalid-token",
        { method: "DELETE" }
      );
      expect(res.status).toBe(401);
    });

    test("Delete message - non-admin user", async () => {
      if (!testRoomId || !testToken || !testUsername) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/${testRoomId}/messages/test-msg-id`,
        testUsername,
        testToken,
        { method: "DELETE" }
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("admin");
    });

    test("Delete message - missing IDs", async () => {
      if (!adminToken) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/${testRoomId}/messages/`,
        ADMIN_USERNAME,
        adminToken,
        { method: "DELETE" }
      );
      expect(res.status === 400 || res.status === 404 || res.status === 405).toBe(true);
    });

    test("Delete message - non-existent room", async () => {
      if (!adminToken) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/nonexistent-room-xyz/messages/some-msg-id`,
        ADMIN_USERNAME,
        adminToken,
        { method: "DELETE" }
      );
      expect(res.status === 400 || res.status === 404).toBe(true);
    });

    test("Delete message - non-existent message", async () => {
      if (!testRoomId || !adminToken) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/${testRoomId}/messages/nonexistent-msg-${Date.now()}`,
        ADMIN_USERNAME,
        adminToken,
        { method: "DELETE" }
      );
      expect(res.status).toBe(404);
    });

    test("Delete message - success", async () => {
      if (!testRoomId || !adminToken || !testMessageId) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/${testRoomId}/messages/${testMessageId}`,
        ADMIN_USERNAME,
        adminToken,
        { method: "DELETE" }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    test("Delete message - wrong method", async () => {
      if (!testRoomId || !adminToken) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms/${testRoomId}/messages/some-msg-id`,
        ADMIN_USERNAME,
        adminToken,
        { method: "GET" }
      );
      expect(res.status).toBe(405);
    });
  });
});
