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

async function setupUsersAndRoom(): Promise<void> {
  const ts = Date.now();
  ownerUsername = `listenowner${ts}`;
  attackerUsername = `listenattacker${ts}`;

  ownerToken = await ensureUserAuth(ownerUsername, "testpassword123");
  attackerToken = await ensureUserAuth(attackerUsername, "testpassword123");

  if (!ownerToken || !attackerToken || !ownerUsername) return;

  const roomsRes = await fetchWithAuth(`${BASE_URL}/api/rooms`, ownerUsername, ownerToken, {
    method: "GET",
  });
  if (!roomsRes.ok) return;
  const roomsData = await roomsRes.json();
  if (Array.isArray(roomsData.rooms) && roomsData.rooms.length > 0) {
    testRoomId = roomsData.rooms[0].id;
  }
}

async function setupListenSession(): Promise<void> {
  if (!ownerUsername || !ownerToken) return;
  const res = await fetchWithAuth(`${BASE_URL}/api/listen/sessions`, ownerUsername, ownerToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ownerUsername }),
  });
  if (res.status === 201) {
    const data = await res.json();
    sessionId = data.session?.id ?? null;
  }
}

describe("Listen Security API", () => {
  beforeAll(async () => {
    await setupUsersAndRoom();
    await setupListenSession();
  });

  describe("Listen Session Identity Binding", () => {
    test("Create session - username mismatch rejected", async () => {
      if (!ownerUsername || !ownerToken || !attackerUsername) return;
      const res = await fetchWithAuth(`${BASE_URL}/api/listen/sessions`, ownerUsername, ownerToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: attackerUsername }),
      });
      expect(res.status).toBe(403);
    });

    test("Create session - success", async () => {
      if (!ownerUsername || !ownerToken) return;
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
      if (!sessionId || !attackerUsername || !attackerToken || !ownerUsername) return;
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
      if (!sessionId || !attackerUsername || !attackerToken) return;
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
      if (!sessionId || !ownerUsername || !ownerToken || !attackerUsername) return;
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
      if (!sessionId || !ownerUsername || !ownerToken) return;
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
      if (!sessionId || !ownerUsername || !ownerToken || !attackerUsername) return;
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
      if (!sessionId || !ownerUsername || !ownerToken) return;
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
      if (!testRoomId || !ownerUsername || !ownerToken || !attackerUsername) return;
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
      if (!testRoomId || !ownerUsername || !ownerToken) return;
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
