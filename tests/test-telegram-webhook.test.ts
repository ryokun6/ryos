import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  makeRateLimitBypassHeaders,
} from "./test-utils";

const TELEGRAM_TEST_API_PORT = Number(process.env.TELEGRAM_TEST_API_PORT || 3899);
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "telegram-test-secret";
const TEST_BASE_URL = process.env.API_URL || BASE_URL;
const RUN_ID = Date.now();
const UPDATE_ID_BASE = RUN_ID * 10;

let username = "";
let token: string | null = null;
let mockServer: ReturnType<typeof Bun.serve> | null = null;
const mockRequests: Array<{
  method: string;
  path: string;
  body: unknown;
}> = [];

beforeAll(async () => {
  username = `tuser${Date.now()}`;
  const password = "telegram-test-password";

  const registerRes = await fetchWithOrigin(`${TEST_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username, password }),
  });

  if (registerRes.status === 200 || registerRes.status === 201) {
    const data = await registerRes.json();
    token = data.token ?? null;
  } else if (registerRes.status === 409) {
    const loginRes = await fetchWithOrigin(`${TEST_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ username, password }),
    });
    if (loginRes.status === 200) {
      const data = await loginRes.json();
      token = data.token ?? null;
    }
  }

  mockServer = Bun.serve({
    port: TELEGRAM_TEST_API_PORT,
    fetch: async (request) => {
      const url = new URL(request.url);
      let body: unknown = null;
      if (request.method !== "GET") {
        try {
          body = await request.json();
        } catch {
          body = null;
        }
      }

      mockRequests.push({
        method: request.method,
        path: url.pathname,
        body,
      });

      return Response.json({
        ok: true,
        result: {
          message_id: 9001,
        },
      });
    },
  });
});

afterAll(() => {
  mockServer?.stop(true);
});

describe("telegram link api", () => {
  test("status is unlinked initially", async () => {
    expect(token).toBeTruthy();
    const res = await fetchWithAuth(
      `${TEST_BASE_URL}/api/telegram/link/status`,
      username,
      token!,
      { method: "GET" }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.linked).toBe(false);
    expect(data.account).toBeNull();
    expect(data.pendingLink).toBeNull();
  });

  test("create returns a link code", async () => {
    expect(token).toBeTruthy();
    const res = await fetchWithAuth(
      `${TEST_BASE_URL}/api/telegram/link/create`,
      username,
      token!,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.code).toBe("string");
    expect(data.code.length).toBeGreaterThan(0);
    expect(typeof data.expiresIn).toBe("number");
    expect(data.expiresIn).toBeGreaterThan(0);
  });

  test("create reuses an active pending link", async () => {
    expect(token).toBeTruthy();

    const firstRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/telegram/link/create`,
      username,
      token!,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
      }
    );
    expect(firstRes.status).toBe(200);
    const firstData = await firstRes.json();

    const secondRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/telegram/link/create`,
      username,
      token!,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
      }
    );
    expect(secondRes.status).toBe(200);
    const secondData = await secondRes.json();

    expect(secondData.code).toBe(firstData.code);
    expect(secondData.expiresIn).toBeGreaterThan(0);

    const statusRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/telegram/link/status`,
      username,
      token!,
      { method: "GET" }
    );
    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json();
    expect(statusData.linked).toBe(false);
    expect(statusData.pendingLink?.code).toBe(firstData.code);
  });
});

describe("telegram webhook", () => {
  test("rejects invalid webhook secret", async () => {
    const res = await fetch(`${TEST_BASE_URL}/api/webhooks/telegram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": "wrong-secret",
      },
      body: JSON.stringify({
        update_id: UPDATE_ID_BASE + 1,
        message: {
          message_id: 11,
          from: { id: RUN_ID + 7001, first_name: "Ryo" },
          chat: { id: RUN_ID + 7001, type: "private" },
          text: "hello",
        },
      }),
    });

    expect(res.status).toBe(401);
  });

  test("ignores non-private chats", async () => {
    const res = await fetch(`${TEST_BASE_URL}/api/webhooks/telegram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: UPDATE_ID_BASE + 2,
        message: {
          message_id: 12,
          from: { id: RUN_ID + 7002, first_name: "GroupUser" },
          chat: { id: -(RUN_ID + 99), type: "group", title: "Test Group" },
          text: "hello from group",
        },
      }),
    });

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.reason).toBe("non-private-chat");
  });

  test("consumes link code and sends Telegram confirmation", async () => {
    expect(token).toBeTruthy();
    mockRequests.length = 0;

    const createRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/telegram/link/create`,
      username,
      token!,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
      }
    );
    expect(createRes.status).toBe(200);
    const createData = await createRes.json();
    const code = createData.code as string;

    const updateId = UPDATE_ID_BASE + 3;
    const telegramUserId = RUN_ID + 7003;
    const webhookRes = await fetch(`${TEST_BASE_URL}/api/webhooks/telegram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: updateId,
        message: {
          message_id: 13,
          from: {
            id: telegramUserId,
            first_name: "Linked",
            username: "linked_user",
          },
          chat: {
            id: telegramUserId,
            type: "private",
          },
          text: `/start link_${code}`,
        },
      }),
    });

    expect(webhookRes.status).toBe(200);
    const webhookData = await webhookRes.json();
    expect(webhookData.linked).toBe(true);
    expect(mockRequests.some((request) => request.path.endsWith("/sendMessage"))).toBe(
      true
    );

    const statusRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/telegram/link/status`,
      username,
      token!,
      { method: "GET" }
    );
    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json();
    expect(statusData.linked).toBe(true);
    expect(statusData.account.telegramUserId).toBe(String(telegramUserId));

    const duplicateRes = await fetch(`${TEST_BASE_URL}/api/webhooks/telegram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: updateId,
        message: {
          message_id: 13,
          from: {
            id: telegramUserId,
            first_name: "Linked",
            username: "linked_user",
          },
          chat: {
            id: telegramUserId,
            type: "private",
          },
          text: `/start link_${code}`,
        },
      }),
    });

    expect(duplicateRes.status).toBe(202);
    const duplicateData = await duplicateRes.json();
    expect(duplicateData.reason).toBe("duplicate-update");
  });

  test("disconnect clears linked status", async () => {
    expect(token).toBeTruthy();
    const disconnectRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/telegram/link/disconnect`,
      username,
      token!,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
      }
    );

    expect(disconnectRes.status).toBe(200);

    const statusRes = await fetchWithAuth(
      `${TEST_BASE_URL}/api/telegram/link/status`,
      username,
      token!,
      { method: "GET" }
    );
    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json();
    expect(statusData.linked).toBe(false);
    expect(statusData.account).toBeNull();
  });
});
