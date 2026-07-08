/**
 * Integration tests for POST /api/pusher/auth
 *
 * Verifies that realtime channel authorization is enforced:
 * - unauthenticated requests are rejected
 * - users can only authorize their own per-user channels
 * - private-room channels require membership
 * - public channels (and global presence for authed users) are authorized
 *
 * Requires the standalone API server (`bun run dev:api`) + Redis + Pusher env.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  getTokenFromAuthCookie,
  makeRateLimitBypassHeaders,
} from "../../helpers/test-utils";

const PASSWORD = "testpassword123";

let memberUser: string;
let memberToken: string | null = null;
let outsiderUser: string;
let outsiderToken: string | null = null;
let privateRoomId: string | null = null;

async function register(username: string): Promise<string | null> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (res.status === 201) return getTokenFromAuthCookie(res);
  if (res.status === 200) return getTokenFromAuthCookie(res);
  return null;
}

function pusherAuthBody(channel: string): string {
  return JSON.stringify({ socket_id: "123.456", channel_name: channel });
}

beforeAll(async () => {
  memberUser = `pauth_m_${Date.now()}`;
  outsiderUser = `pauth_o_${Date.now()}`;
  memberToken = await register(memberUser);
  outsiderToken = await register(outsiderUser);

  if (memberToken) {
    const res = await fetchWithAuth(`${BASE_URL}/api/rooms`, memberUser, memberToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "private", members: [memberUser] }),
    });
    if (res.status === 201) {
      const data = await res.json();
      privateRoomId = data?.room?.id ?? data?.roomId ?? null;
    }
  }
});

describe("POST /api/pusher/auth", () => {
  test("unauthenticated request is rejected", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/pusher/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: pusherAuthBody(`private-chats-${memberUser}`),
    });
    expect(res.status).toBe(401);
  });

  test("authorizes the user's own per-user channel", async () => {
    if (!memberToken) throw new Error("missing member token");
    const res = await fetchWithAuth(
      `${BASE_URL}/api/pusher/auth`,
      memberUser,
      memberToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pusherAuthBody(`private-chats-${memberUser}`),
      }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.auth).toBe("string");
    expect(data.auth.length).toBeGreaterThan(0);
  });

  test("denies another user's per-user channel", async () => {
    if (!outsiderToken) throw new Error("missing outsider token");
    const res = await fetchWithAuth(
      `${BASE_URL}/api/pusher/auth`,
      outsiderUser,
      outsiderToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pusherAuthBody(`private-chats-${memberUser}`),
      }
    );
    expect(res.status).toBe(403);
  });

  test("denies another user's sync channel", async () => {
    if (!outsiderToken) throw new Error("missing outsider token");
    const res = await fetchWithAuth(
      `${BASE_URL}/api/pusher/auth`,
      outsiderUser,
      outsiderToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pusherAuthBody(`private-sync-${memberUser}`),
      }
    );
    expect(res.status).toBe(403);
  });

  test("authorizes a private room channel for a member", async () => {
    if (!privateRoomId || !memberToken) return;
    const res = await fetchWithAuth(
      `${BASE_URL}/api/pusher/auth`,
      memberUser,
      memberToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pusherAuthBody(`private-room-${privateRoomId}`),
      }
    );
    expect(res.status).toBe(200);
  });

  test("denies a private room channel for a non-member", async () => {
    if (!privateRoomId || !outsiderToken) return;
    const res = await fetchWithAuth(
      `${BASE_URL}/api/pusher/auth`,
      outsiderUser,
      outsiderToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pusherAuthBody(`private-room-${privateRoomId}`),
      }
    );
    expect(res.status).toBe(403);
  });

  test("authorizes global presence for an authenticated user", async () => {
    if (!memberToken) throw new Error("missing member token");
    const res = await fetchWithAuth(
      `${BASE_URL}/api/pusher/auth`,
      memberUser,
      memberToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pusherAuthBody("presence-global"),
      }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.auth).toBe("string");
    // Presence auth must include channel_data.
    expect(typeof data.channel_data).toBe("string");
  });

  test("authorizes a public channel for any authenticated user", async () => {
    if (!outsiderToken) throw new Error("missing outsider token");
    const res = await fetchWithAuth(
      `${BASE_URL}/api/pusher/auth`,
      outsiderUser,
      outsiderToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pusherAuthBody("chats-public"),
      }
    );
    expect(res.status).toBe(200);
  });

  test("denies unknown private channels", async () => {
    if (!memberToken) throw new Error("missing member token");
    const res = await fetchWithAuth(
      `${BASE_URL}/api/pusher/auth`,
      memberUser,
      memberToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pusherAuthBody("private-something-else"),
      }
    );
    expect(res.status).toBe(403);
  });
});
