/**
 * Tests for RESTful API endpoints:
 * - /api/auth/*
 * - /api/rooms/*
 * - /api/rooms/[id]/messages
 * - /api/messages/bulk
 * - /api/presence/switch
 * - /api/presence/heartbeat
 */

import { describe, test, expect } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  makeRateLimitBypassHeaders,
  ensureUserAuth,
  getTokenFromAuthCookie,
} from "./test-utils";

let testToken: string | null = null;
let testUsername: string | null = null;

const ADMIN_USERNAME = "ryo";
const ADMIN_PASSWORD = "testtest";
let adminToken: string | null = null;

let testRoomId: string | null = null;
let privateRoomId: string | null = null;
let outsiderUsername: string | null = null;
let outsiderToken: string | null = null;

describe("New API", () => {
  // ── Auth ──────────────────────────────────────────────────────────────

  describe("Auth", () => {
    test("Register - missing username → 400", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({}),
      });
      if (res.status === 429) return; // rate-limited, skip
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Username");
    });

    test("Register - missing password → 400", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ username: "testuser_nopwd" }),
      });
      if (res.status === 429) return;
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Password");
    });

    test("Register - short password → 400", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ username: "testuser_short", password: "123" }),
      });
      if (res.status === 429) return;
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Password must be");
    });

    test("Register - success", async () => {
      testUsername = `tuser${Date.now()}`;
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ username: testUsername, password: "testpassword123" }),
      });
      if (res.status === 429 || res.status === 409) return;
      expect(res.status).toBe(201);
      const token = getTokenFromAuthCookie(res);
      expect(token).toBeTruthy();
      const data = await res.json();
      expect(data.user?.username).toBe(testUsername.toLowerCase());
      testToken = token;
    });

    test("Login - success", async () => {
      if (!testUsername) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ username: testUsername, password: "testpassword123" }),
      });
      if (res.status === 429) return;
      expect(res.status).toBe(200);
      const token = getTokenFromAuthCookie(res);
      expect(token).toBeTruthy();
      const data = await res.json();
      expect(data.username).toBe(testUsername.toLowerCase());
      testToken = token;
    });

    test("Login - invalid password → 401", async () => {
      if (!testUsername) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ username: testUsername, password: "wrongpassword" }),
      });
      if (res.status === 429) return;
      expect(res.status).toBe(401);
    });

    test("Token verify", async () => {
      if (!testToken || !testUsername) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/auth/token/verify`, testUsername, testToken, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(true);
    });

    test("Token refresh", async () => {
      if (!testToken || !testUsername) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/token/refresh`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ username: testUsername, oldToken: testToken }),
      });
      expect(res.status).toBe(200);
      const token = getTokenFromAuthCookie(res);
      expect(token).toBeTruthy();
      const data = await res.json();
      expect(data.refreshed).toBe(true);
      testToken = token;
    });

    test("Password check", async () => {
      if (!testToken || !testUsername) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/auth/password/check`, testUsername, testToken, {
        method: "GET",
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.hasPassword).toBe(true);
    });

    test("List tokens", async () => {
      if (!testToken || !testUsername) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/auth/tokens`, testUsername, testToken, {
        method: "GET",
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.tokens)).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(1);
    });

    test("Admin login", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
      });
      if (res.status === 200) {
        adminToken = getTokenFromAuthCookie(res);
        expect(adminToken).toBeTruthy();
      }
      // admin may not exist in test env — that's OK
    });
  });

  // ── Rooms ─────────────────────────────────────────────────────────────

  describe("Rooms", () => {
    test("Get rooms", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/rooms`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.rooms)).toBe(true);
      if (data.rooms.length > 0) testRoomId = data.rooms[0].id;
    });

    test("Get rooms with username", async () => {
      if (!testToken || !testUsername) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/rooms?username=${testUsername}`,
        testUsername, testToken, { method: "GET" },
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.rooms)).toBe(true);
    });

    test("Get single room", async () => {
      if (!testRoomId) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.room).toBeTruthy();
      expect(data.room.id).toBe(testRoomId);
    });

    test("Create private room", async () => {
      if (!testToken || !testUsername) return;
      outsiderUsername = `outsider${Date.now()}`;
      outsiderToken = await ensureUserAuth(outsiderUsername, "testpassword123");
      if (!outsiderToken) return;

      const res = await fetchWithAuth(`${BASE_URL}/api/rooms`, testUsername, testToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "private", members: [testUsername] }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.room?.id).toBeTruthy();
      expect(data.room.type).toBe("private");
      privateRoomId = data.room.id;
    });

    test("Private room hidden from anonymous query spoof", async () => {
      if (!privateRoomId || !testUsername) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/rooms?username=${testUsername}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      const found = data.rooms.some((r: { id: string }) => r.id === privateRoomId);
      expect(found).toBe(false);
    });

    test("Private room visible to authenticated member", async () => {
      if (!privateRoomId || !testToken || !testUsername) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/rooms`, testUsername, testToken, { method: "GET" });
      expect(res.status).toBe(200);
      const data = await res.json();
      const found = data.rooms.some((r: { id: string }) => r.id === privateRoomId);
      expect(found).toBe(true);
    });

    test("Private room read forbidden for outsider", async () => {
      if (!privateRoomId || !outsiderUsername || !outsiderToken) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/rooms/${privateRoomId}`, outsiderUsername, outsiderToken, { method: "GET" });
      expect(res.status).toBe(403);
    });

    test("Private room messages read forbidden for outsider", async () => {
      if (!privateRoomId || !outsiderUsername || !outsiderToken) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/rooms/${privateRoomId}/messages`, outsiderUsername, outsiderToken, { method: "GET" });
      expect(res.status).toBe(403);
    });

    test("Private room message write forbidden for outsider", async () => {
      if (!privateRoomId || !outsiderUsername || !outsiderToken) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/rooms/${privateRoomId}/messages`, outsiderUsername, outsiderToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "outsider write attempt" }),
      });
      expect(res.status).toBe(403);
    });

    test("Private room users read forbidden for outsider", async () => {
      if (!privateRoomId || !outsiderUsername || !outsiderToken) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/rooms/${privateRoomId}/users`, outsiderUsername, outsiderToken, { method: "GET" });
      expect(res.status).toBe(403);
    });
  });

  // ── Messages ──────────────────────────────────────────────────────────

  describe("Messages", () => {
    test("Get messages", async () => {
      if (!testRoomId) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/messages`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.messages)).toBe(true);
    });

    test("Send message", async () => {
      if (!testRoomId || !testToken || !testUsername) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/rooms/${testRoomId}/messages`, testUsername, testToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Test message from bun:test" }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.message).toBeTruthy();
      expect(data.message.content).toContain("Test message");
    });

    test("Bulk messages", async () => {
      if (!testRoomId) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/messages/bulk?roomIds=${testRoomId}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.messagesMap).toBeTruthy();
    });
  });

  // ── Presence ──────────────────────────────────────────────────────────

  describe("Presence", () => {
    test("Presence switch", async () => {
      if (!testRoomId || !testUsername || !testToken) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/presence/switch`, testUsername, testToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousRoomId: null, nextRoomId: testRoomId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    test("Presence heartbeat GET without auth → 401", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/presence/heartbeat`);
      expect(res.status).toBe(401);
    });

    test("Presence heartbeat POST without auth → 401", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/presence/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(401);
    });

    test("Presence heartbeat GET with auth → 200", async () => {
      if (!testUsername || !testToken) return;
      const res = await fetchWithAuth(
        `${BASE_URL}/api/presence/heartbeat`,
        testUsername,
        testToken
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.users)).toBe(true);
    });

    test("Get room users", async () => {
      if (!testRoomId) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/rooms/${testRoomId}/users`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.users)).toBe(true);
    });
  });

  // ── Logout ────────────────────────────────────────────────────────────

  describe("Logout", () => {
    test("Logout", async () => {
      if (!testToken || !testUsername) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/auth/logout`, testUsername, testToken, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
