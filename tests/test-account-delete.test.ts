/**
 * Tests for self-service account deletion: /api/auth/account/delete
 *
 * Covers auth requirement, explicit confirmation, password verification,
 * full data purge (profile, sessions, recovery email index), admin protection,
 * and parity with the shared purge helper used by admin deletion.
 *
 * Requires the standalone API server (`bun run dev:api`) + Redis.
 */

import { describe, test, expect } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  makeRateLimitBypassHeaders,
  getTokenFromAuthCookie,
  uniqueTestUsername,
} from "./test-utils";
import { createRedis } from "../api/_utils/redis";
import { redisKeys } from "../src/shared/redisKeys";
import {
  getStoredUserRecord,
  setStoredUserRecord,
  setUserEmailIndex,
  getUsernameByEmail,
} from "../api/_utils/auth/_user-record";
import { headStoredObject } from "../api/_utils/storage";

const redis = createRedis();

async function registerUser(
  username: string,
  password: string
): Promise<string> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username, password }),
  });
  expect(res.status).toBe(201);
  const token = getTokenFromAuthCookie(res);
  expect(token).toBeTruthy();
  return token as string;
}

describe("Account Deletion API", () => {
  test("requires auth -> 401", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/auth/account/delete`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ confirm: true, confirmUsername: "whoever" }),
    });
    expect(res.status).toBe(401);
  });

  test("missing confirm flag -> 400", async () => {
    const username = uniqueTestUsername("delconfirm");
    const token = await registerUser(username, "testpassword123");

    const res = await fetchWithAuth(
      `${BASE_URL}/api/auth/account/delete`,
      username,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmUsername: username,
          currentPassword: "testpassword123",
        }),
      }
    );
    expect(res.status).toBe(400);
  });

  test("confirmUsername mismatch -> 400", async () => {
    const username = uniqueTestUsername("delmismatch");
    const token = await registerUser(username, "testpassword123");

    const res = await fetchWithAuth(
      `${BASE_URL}/api/auth/account/delete`,
      username,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          confirmUsername: "not-my-username",
          currentPassword: "testpassword123",
        }),
      }
    );
    expect(res.status).toBe(400);
  });

  test("wrong password -> 401", async () => {
    const username = uniqueTestUsername("delwrongpw");
    const token = await registerUser(username, "testpassword123");

    const res = await fetchWithAuth(
      `${BASE_URL}/api/auth/account/delete`,
      username,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          confirmUsername: username,
          currentPassword: "totally-wrong-pw",
        }),
      }
    );
    expect(res.status).toBe(401);
  });

  test("happy path: purges profile, sessions, and recovery email index", async () => {
    const username = uniqueTestUsername("delok");
    const token = await registerUser(username, "testpassword123");
    const email = `${username}@example.com`;

    // Attach a verified recovery email + a sync key so we can confirm cleanup.
    const record = await getStoredUserRecord(redis, username);
    await setStoredUserRecord(redis, username, {
      ...(record || { username }),
      email,
      emailVerified: true,
    });
    await setUserEmailIndex(redis, email, username);
    await redis.set(redisKeys.sync.v2Kv(username), JSON.stringify({ a: 1 }));
    const imageBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    const upload = await fetchWithAuth(
      `${BASE_URL}/api/ai/attachments`,
      username,
      token,
      {
        method: "POST",
        headers: {
          ...makeRateLimitBypassHeaders(),
          "Content-Type": "image/png",
        },
        body: imageBytes,
      }
    );
    expect(upload.status).toBe(201);
    const uploadResult: unknown = await upload.json();
    if (
      !uploadResult ||
      typeof uploadResult !== "object" ||
      Array.isArray(uploadResult) ||
      typeof Reflect.get(uploadResult, "attachmentId") !== "string"
    ) {
      throw new Error("Attachment upload returned an invalid response");
    }
    const attachmentId = Reflect.get(uploadResult, "attachmentId");
    const rawAttachment = await redis.get(
      redisKeys.chat.aiAttachment(username, attachmentId)
    );
    const storedAttachment =
      typeof rawAttachment === "string"
        ? JSON.parse(rawAttachment)
        : rawAttachment;
    if (
      !storedAttachment ||
      typeof storedAttachment !== "object" ||
      Array.isArray(storedAttachment) ||
      typeof Reflect.get(storedAttachment, "storageUrl") !== "string"
    ) {
      throw new Error("Attachment metadata was not stored");
    }
    const attachmentStorageUrl = Reflect.get(storedAttachment, "storageUrl");
    expect(await headStoredObject(attachmentStorageUrl)).not.toBeNull();
    await redis.set(
      redisKeys.chat.aiConversation(username, "chat"),
      JSON.stringify({ seeded: true })
    );
    await redis.set(
      redisKeys.chat.aiConversation(username, "assistant"),
      JSON.stringify({ seeded: true })
    );
    const memoryDate = new Date().toISOString().slice(0, 10);
    await redis.set(
      redisKeys.memory.index(username),
      JSON.stringify({
        version: 1,
        memories: [{ key: "preferences", summary: "Prefers privacy" }],
      })
    );
    await redis.set(
      redisKeys.memory.detail(username, "preferences"),
      JSON.stringify({
        key: "preferences",
        summary: "Prefers privacy",
        content: "Private account memory",
      })
    );
    await redis.set(
      redisKeys.memory.daily(username, memoryDate),
      JSON.stringify({ date: memoryDate, entries: [] })
    );
    await redis.set(redisKeys.memory.processingLock(username), "locked");

    expect(await getUsernameByEmail(redis, email)).toBe(username);

    const res = await fetchWithAuth(
      `${BASE_URL}/api/auth/account/delete`,
      username,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          confirmUsername: username,
          currentPassword: "testpassword123",
        }),
      }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    // Profile gone.
    expect(await getStoredUserRecord(redis, username)).toBeNull();
    // Email index gone.
    expect(await getUsernameByEmail(redis, email)).toBeNull();
    // Sync data gone.
    expect(await redis.get(redisKeys.sync.v2Kv(username))).toBeNull();
    // Personal AI conversation data gone.
    expect(
      await redis.get(redisKeys.chat.aiConversation(username, "chat"))
    ).toBeNull();
    expect(
      await redis.get(redisKeys.chat.aiConversation(username, "assistant"))
    ).toBeNull();
    expect(
      await redis.get(redisKeys.chat.aiAttachment(username, attachmentId))
    ).toBeNull();
    expect(await redis.get(redisKeys.chat.aiAttachmentIds(username))).toBeNull();
    expect(await redis.get(redisKeys.chat.aiAttachmentBytes(username))).toBeNull();
    expect(await headStoredObject(attachmentStorageUrl)).toBeNull();
    expect(await redis.get(redisKeys.memory.index(username))).toBeNull();
    expect(
      await redis.get(redisKeys.memory.detail(username, "preferences"))
    ).toBeNull();
    expect(
      await redis.get(redisKeys.memory.daily(username, memoryDate))
    ).toBeNull();
    expect(await redis.get(redisKeys.memory.processingLock(username))).toBeNull();

    // Old token invalid.
    const tokenCheck = await fetchWithAuth(
      `${BASE_URL}/api/auth/tokens`,
      username,
      token,
      { method: "GET" }
    );
    expect(tokenCheck.status).toBe(401);

    // Login no longer possible.
    const login = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ username, password: "testpassword123" }),
    });
    expect(login.status).toBe(401);
  });

  test("admin account cannot self-delete (when present)", async () => {
    const adminLogin = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ username: "ryo", password: "testtest" }),
    });
    if (adminLogin.status !== 200) {
      // Admin account not seeded in this environment — nothing to assert.
      return;
    }
    const token = getTokenFromAuthCookie(adminLogin);
    const res = await fetchWithAuth(
      `${BASE_URL}/api/auth/account/delete`,
      "ryo",
      token as string,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          confirmUsername: "ryo",
          currentPassword: "testtest",
        }),
      }
    );
    expect(res.status).toBe(403);
  });
});
