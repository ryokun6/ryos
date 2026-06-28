/**
 * Security-focused integration tests for listen + presence identity binding.
 *
 * Verifies that caller-supplied usernames in request bodies cannot impersonate
 * another user when auth headers identify a different account.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  BASE_URL,
  fetchWithAuth,
  ensureUserAuth,
} from "./test-utils";

let ownerUsername: string | null = null;
let ownerToken: string | null = null;
let attackerUsername: string | null = null;
let attackerToken: string | null = null;
let sessionId: string | null = null;
let testRoomId: string | null = null;

function requireSetup(
  value: unknown,
  name: string
): asserts value {
  if (!value) throw new Error(`Listen security setup missing ${name}`);
}

async function setupUsersAndRoom(): Promise<void> {
  const ts = Date.now();
  ownerUsername = `listenowner${ts}`;
  attackerUsername = `listenattacker${ts}`;

  ownerToken = await ensureUserAuth(ownerUsername, "testpassword123");
  attackerToken = await ensureUserAuth(attackerUsername, "testpassword123");

  requireSetup(ownerToken, "owner token");
  requireSetup(attackerToken, "attacker token");
  requireSetup(ownerUsername, "owner username");

  const roomsRes = await fetchWithAuth(`${BASE_URL}/api/rooms`, ownerUsername, ownerToken, {
    method: "GET",
  });
  if (!roomsRes.ok) {
    throw new Error(`Listen security room setup failed: ${roomsRes.status}`);
  }
  const roomsData = await roomsRes.json();
  if (Array.isArray(roomsData.rooms) && roomsData.rooms.length > 0) {
    testRoomId = roomsData.rooms[0].id;
  }
  requireSetup(testRoomId, "test room");
}

async function setupListenSession(): Promise<void> {
  requireSetup(ownerUsername, "owner username");
  requireSetup(ownerToken, "owner token");
  const res = await fetchWithAuth(`${BASE_URL}/api/listen/sessions`, ownerUsername, ownerToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ownerUsername }),
  });
  if (res.status === 201) {
    const data = await res.json();
    sessionId = data.session?.id ?? null;
  } else {
    throw new Error(`Listen session setup failed: ${res.status}`);
  }
  requireSetup(sessionId, "session id");
}

describe("Listen Security API", () => {
  beforeAll(async () => {
    await setupUsersAndRoom();
    await setupListenSession();
  });

  describe("Listen Session Identity Binding", () => {
    test("Create session - username mismatch rejected", async () => {
      requireSetup(ownerUsername, "owner username");
      requireSetup(ownerToken, "owner token");
      requireSetup(attackerUsername, "attacker username");
      const res = await fetchWithAuth(`${BASE_URL}/api/listen/sessions`, ownerUsername, ownerToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: attackerUsername }),
      });
      expect(res.status).toBe(403);
    });

    test("Create session - success", async () => {
      requireSetup(ownerUsername, "owner username");
      requireSetup(ownerToken, "owner token");
      const res = await fetchWithAuth(`${BASE_URL}/api/listen/sessions`, ownerUsername, ownerToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: ownerUsername }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.session?.id).toBeTruthy();
      expect(data.session.hostUsername).toBe(ownerUsername);
    });

    test("Join session - username mismatch rejected", async () => {
      requireSetup(sessionId, "session id");
      requireSetup(attackerUsername, "attacker username");
      requireSetup(attackerToken, "attacker token");
      requireSetup(ownerUsername, "owner username");
      const res = await fetchWithAuth(
        `${BASE_URL}/api/listen/sessions/${sessionId}/join`,
        attackerUsername,
        attackerToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: ownerUsername }),
        }
      );
      expect(res.status).toBe(403);
    });

    test("Join session - success", async () => {
      requireSetup(sessionId, "session id");
      requireSetup(attackerUsername, "attacker username");
      requireSetup(attackerToken, "attacker token");
      const res = await fetchWithAuth(
        `${BASE_URL}/api/listen/sessions/${sessionId}/join`,
        attackerUsername,
        attackerToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: attackerUsername }),
        }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      const hasAttacker = data.session?.users?.some(
        (user: { username: string }) => user.username === attackerUsername
      );
      expect(hasAttacker).toBe(true);
    });

    test("Sync - username mismatch rejected", async () => {
      requireSetup(sessionId, "session id");
      requireSetup(ownerUsername, "owner username");
      requireSetup(ownerToken, "owner token");
      requireSetup(attackerUsername, "attacker username");
      const res = await fetchWithAuth(
        `${BASE_URL}/api/listen/sessions/${sessionId}/sync`,
        ownerUsername,
        ownerToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: attackerUsername,
            state: {
              currentTrackId: null,
              currentTrackMeta: null,
              isPlaying: false,
              positionMs: 0,
            },
          }),
        }
      );
      expect(res.status).toBe(403);
    });

    test("Sync - success", async () => {
      requireSetup(sessionId, "session id");
      requireSetup(ownerUsername, "owner username");
      requireSetup(ownerToken, "owner token");
      const res = await fetchWithAuth(
        `${BASE_URL}/api/listen/sessions/${sessionId}/sync`,
        ownerUsername,
        ownerToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: ownerUsername,
            state: {
              currentTrackId: null,
              currentTrackMeta: null,
              isPlaying: false,
              positionMs: 0,
            },
          }),
        }
      );
      expect(res.status).toBe(200);
    });

    test("Reaction - username mismatch rejected", async () => {
      requireSetup(sessionId, "session id");
      requireSetup(ownerUsername, "owner username");
      requireSetup(ownerToken, "owner token");
      requireSetup(attackerUsername, "attacker username");
      const res = await fetchWithAuth(
        `${BASE_URL}/api/listen/sessions/${sessionId}/reaction`,
        ownerUsername,
        ownerToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: attackerUsername, emoji: "🔥" }),
        }
      );
      expect(res.status).toBe(403);
    });

    test("Reaction - success", async () => {
      requireSetup(sessionId, "session id");
      requireSetup(ownerUsername, "owner username");
      requireSetup(ownerToken, "owner token");
      const res = await fetchWithAuth(
        `${BASE_URL}/api/listen/sessions/${sessionId}/reaction`,
        ownerUsername,
        ownerToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: ownerUsername, emoji: "✅" }),
        }
      );
      expect(res.status).toBe(200);
    });
  });

  describe("Presence Identity Binding", () => {
    test("Presence switch - username mismatch rejected", async () => {
      requireSetup(testRoomId, "test room");
      requireSetup(ownerUsername, "owner username");
      requireSetup(ownerToken, "owner token");
      requireSetup(attackerUsername, "attacker username");
      const res = await fetchWithAuth(`${BASE_URL}/api/presence/switch`, ownerUsername, ownerToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousRoomId: null,
          nextRoomId: testRoomId,
          username: attackerUsername,
        }),
      });
      expect(res.status).toBe(403);
    });

    test("Presence switch - success without username claim", async () => {
      requireSetup(testRoomId, "test room");
      requireSetup(ownerUsername, "owner username");
      requireSetup(ownerToken, "owner token");
      const res = await fetchWithAuth(`${BASE_URL}/api/presence/switch`, ownerUsername, ownerToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousRoomId: null,
          nextRoomId: testRoomId,
        }),
      });
      expect(res.status).toBe(200);
    });
  });
});
