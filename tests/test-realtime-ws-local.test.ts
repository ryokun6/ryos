/**
 * Integration tests for the self-hosted local WebSocket realtime provider.
 *
 * Verifies the ticket handshake + per-subscription authorization:
 * - a private channel cannot be subscribed without a valid ticket
 * - a ticket only authorizes its owner's per-user channels
 * - private-room channels require membership
 * - authorized members actually receive `room-message` events; a public channel
 *   does not require a ticket
 *
 * These require a standalone server started with `REALTIME_PROVIDER=local`.
 * Set `REALTIME_LOCAL_URL` (http origin) to enable; otherwise the suite is
 * skipped so the default (Pusher) API test run is unaffected.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { getAuthCookieHeader } from "./test-utils";

const LOCAL_URL = process.env.REALTIME_LOCAL_URL || "";
const PASSWORD = "testpassword123";

const origin = LOCAL_URL || "http://localhost:3001";
const wsOrigin = origin.replace(/^http/, "ws");

async function register(
  username: string
): Promise<{ cookie: string | null }> {
  const res = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "X-Forwarded-For": `10.9.${Date.now() % 255}.${Math.floor(Math.random() * 255)}`,
    },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  return { cookie: getAuthCookieHeader(res) };
}

async function getTicket(cookie: string): Promise<string | null> {
  const res = await fetch(`${origin}/api/realtime/ticket`, {
    method: "POST",
    headers: { Origin: origin, Cookie: cookie },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { ticket?: string };
  return data.ticket ?? null;
}

interface SubscribeResult {
  authorized: boolean;
  message?: unknown;
}

/**
 * Open a WS (optionally with a ticket), subscribe to `channel`, and report
 * whether the server authorized it. Resolves on the first `subscription_error`
 * (denied) or after `waitForEventMs` with no error (authorized). If
 * `triggerAfterSubscribe` is provided it runs once subscribed, allowing us to
 * also capture a delivered event.
 */
function subscribeOnce(
  ticket: string | null,
  channel: string,
  options: { waitMs?: number; triggerAfterSubscribe?: () => Promise<void> } = {}
): Promise<SubscribeResult> {
  const { waitMs = 1500, triggerAfterSubscribe } = options;
  const url = ticket
    ? `${wsOrigin}/ws?ticket=${encodeURIComponent(ticket)}`
    : `${wsOrigin}/ws`;

  return new Promise<SubscribeResult>((resolve) => {
    const ws = new WebSocket(url);
    let settled = false;
    let receivedMessage: unknown;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: SubscribeResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(result);
    };

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "subscribe", channel }));
      // Assume authorized unless a subscription_error arrives within waitMs.
      timer = setTimeout(() => {
        finish({ authorized: true, message: receivedMessage });
      }, waitMs);
      if (triggerAfterSubscribe) {
        // Give the subscription a moment to register before triggering.
        setTimeout(() => {
          void triggerAfterSubscribe();
        }, 300);
      }
    });

    ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as {
          type?: string;
          channel?: string;
          event?: string;
          data?: unknown;
        };
        if (payload.type === "subscription_error" && payload.channel === channel) {
          finish({ authorized: false });
          return;
        }
        if (payload.type === "event") {
          receivedMessage = payload;
        }
      } catch {
        // ignore non-JSON frames
      }
    });

    ws.addEventListener("error", () => finish({ authorized: false }));
  });
}

function receivesEventAfter(
  ticket: string,
  channel: string,
  trigger: () => Promise<void>,
  waitMs = 1200
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const ws = new WebSocket(
      `${wsOrigin}/ws?ticket=${encodeURIComponent(ticket)}`
    );
    let received = false;
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "subscribe", channel }));
      setTimeout(() => void trigger(), 250);
      setTimeout(() => {
        ws.close();
        resolve(received);
      }, waitMs);
    });
    ws.addEventListener("message", (event) => {
      const payload = JSON.parse(String(event.data)) as { type?: string };
      if (payload.type === "event") received = true;
    });
  });
}

const maybeDescribe = LOCAL_URL ? describe : describe.skip;

maybeDescribe("local WebSocket realtime authorization", () => {
  let memberUser: string;
  let memberCookie: string | null = null;
  let memberTicket: string | null = null;
  let outsiderUser: string;
  let outsiderCookie: string | null = null;
  let outsiderTicket: string | null = null;
  let privateRoomId: string | null = null;

  beforeAll(async () => {
    memberUser = `wsm_${Date.now()}`;
    outsiderUser = `wso_${Date.now()}`;
    memberCookie = (await register(memberUser)).cookie;
    outsiderCookie = (await register(outsiderUser)).cookie;
    if (memberCookie) memberTicket = await getTicket(memberCookie);
    if (outsiderCookie) outsiderTicket = await getTicket(outsiderCookie);

    if (memberCookie) {
      const res = await fetch(`${origin}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: memberCookie,
        },
        body: JSON.stringify({ type: "private", members: [memberUser] }),
      });
      if (res.status === 201) {
        const data = await res.json();
        privateRoomId = data?.room?.id ?? data?.roomId ?? null;
      }
    }
  });

  test("issues a ticket to an authenticated user", () => {
    expect(typeof memberTicket).toBe("string");
    expect((memberTicket || "").length).toBeGreaterThan(16);
  });

  test("public channel needs no ticket", async () => {
    const result = await subscribeOnce(null, "chats-public");
    expect(result.authorized).toBe(true);
  });

  test("private channel is denied without a ticket", async () => {
    const result = await subscribeOnce(null, `private-chats-${memberUser}`);
    expect(result.authorized).toBe(false);
  });

  test("ticket authorizes the owner's per-user channel", async () => {
    const result = await subscribeOnce(memberTicket, `private-chats-${memberUser}`);
    expect(result.authorized).toBe(true);
  });

  test("ticket does not authorize another user's channel", async () => {
    // Outsider mints their own ticket and tries to grab the member's channel.
    const fresh = outsiderCookie ? await getTicket(outsiderCookie) : null;
    const result = await subscribeOnce(fresh, `private-chats-${memberUser}`);
    expect(result.authorized).toBe(false);
  });

  test("AirDrop channel requires its owner's ticket", async () => {
    const ownTicket = memberCookie ? await getTicket(memberCookie) : null;
    const own = await subscribeOnce(
      ownTicket,
      `private-airdrop-${memberUser}`
    );
    expect(own.authorized).toBe(true);

    const otherTicket = outsiderCookie ? await getTicket(outsiderCookie) : null;
    const other = await subscribeOnce(
      otherTicket,
      `private-airdrop-${memberUser}`
    );
    expect(other.authorized).toBe(false);
  });

  test("private room membership is authorized and messages use current-member fanout", async () => {
    if (!privateRoomId || !memberCookie) return;

    const freshMemberTicket = memberCookie ? await getTicket(memberCookie) : null;
    const channel = `private-room-${privateRoomId}`;

    const roomSubscription = await subscribeOnce(freshMemberTicket, channel);
    expect(roomSubscription.authorized).toBe(true);

    const fanoutTicket = memberCookie ? await getTicket(memberCookie) : null;
    const result = await subscribeOnce(fanoutTicket, `private-chats-${memberUser}`, {
      waitMs: 2500,
      triggerAfterSubscribe: async () => {
        await fetch(`${origin}/api/rooms/${privateRoomId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            Cookie: memberCookie as string,
          },
          body: JSON.stringify({ content: "hello private room" }),
        });
      },
    });
    expect(result.authorized).toBe(true);
    expect(result.message).toBeDefined();

    const freshOutsiderTicket = outsiderCookie
      ? await getTicket(outsiderCookie)
      : null;
    const denied = await subscribeOnce(freshOutsiderTicket, channel);
    expect(denied.authorized).toBe(false);

    void outsiderTicket;
  }, 10_000);

  test("revoked private-room subscribers receive no future messages", async () => {
    const suffix = Date.now();
    const revokedUser = `wsr_${suffix}`;
    const remainingA = `wsa_${suffix}`;
    const remainingB = `wsb_${suffix}`;
    const revokedCookie = (await register(revokedUser)).cookie;
    const remainingCookie = (await register(remainingA)).cookie;
    await register(remainingB);
    if (!revokedCookie || !remainingCookie) throw new Error("registration failed");

    const create = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: revokedCookie,
      },
      body: JSON.stringify({
        type: "private",
        members: [revokedUser, remainingA, remainingB],
      }),
    });
    const created = (await create.json()) as { room?: { id?: string } };
    const roomId = created.room?.id;
    if (!roomId) throw new Error("private room creation failed");

    const ticket = await getTicket(revokedCookie);
    if (!ticket) throw new Error("ticket creation failed");
    const received = await receivesEventAfter(
      ticket,
      `private-room-${roomId}`,
      async () => {
        await fetch(`${origin}/api/rooms/${roomId}`, {
          method: "DELETE",
          headers: { Origin: origin, Cookie: revokedCookie },
        });
        await fetch(`${origin}/api/rooms/${roomId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            Cookie: remainingCookie,
          },
          body: JSON.stringify({ content: "after revocation" }),
        });
      }
    );

    expect(received).toBe(false);
  }, 10_000);
});
