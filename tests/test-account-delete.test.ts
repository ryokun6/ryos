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
import { readFileSync } from "node:fs";
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
import { purgeUserAccount } from "../api/_utils/auth/_purge";
import { resolveOwnedStorageObjectUrl } from "../api/_utils/storage";

const redis = createRedis();
const accountDeleteSource = readFileSync(
  "api/auth/account/delete.ts",
  "utf8"
);

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
  test("fails closed when the deletion limiter is unavailable", () => {
    expect(accountDeleteSource).toContain(
      "RateLimit.runFailClosedRateLimit"
    );
    expect(accountDeleteSource).toContain(
      'res.status(503).json({ error: "rate_limit_unavailable" })'
    );
  });

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

    // Old token invalid.
    const tokenCheck = await fetchWithAuth(
      `${BASE_URL}/api/auth/password/check`,
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

  test("shared purge removes private lifecycle data and storage blobs", async () => {
    const username = uniqueTestUsername("purgeprivate").toLowerCase();
    const telegramUserId = `tg-${username}`;
    const telegramChatId = `chat-${username}`;
    const linkCode = `code-${username}`;
    const blobDigest = "a".repeat(64);
    const blobUrl = `s3://test-bucket/sync/${username}/blobs/${blobDigest}.gz`;
    const sharedRoomId = `room-${username}`;
    const sharedMessage = JSON.stringify({
      id: "message-1",
      username,
      content: "shared content remains",
    });

    await setStoredUserRecord(redis, username, {
      username,
      lastActive: Date.now(),
    });
    const telegramAccount = JSON.stringify({
      username,
      telegramUserId,
      chatId: telegramChatId,
      telegramUsername: null,
      firstName: null,
      lastName: null,
      linkedAt: Date.now(),
    });
    await redis.set(
      redisKeys.integration.telegramAccountByUsername(username),
      telegramAccount
    );
    await redis.set(
      redisKeys.integration.telegramAccountByTelegramUser(telegramUserId),
      telegramAccount
    );
    await redis.set(
      redisKeys.integration.telegramPendingLink(username),
      JSON.stringify({ username, code: linkCode, createdAt: Date.now() }),
      { ex: 600 }
    );
    await redis.set(
      redisKeys.integration.telegramLinkCode(linkCode),
      JSON.stringify({ username, createdAt: Date.now() }),
      { ex: 600 }
    );
    await redis.lpush(
      redisKeys.integration.telegramHistory(telegramChatId),
      JSON.stringify({ role: "user", content: "private", createdAt: Date.now() })
    );
    await redis.set(
      redisKeys.integration.telegramHeartbeatSettings(username),
      JSON.stringify({ instructions: "private", updatedAt: Date.now() })
    );
    await redis.set(
      redisKeys.integration.telegramHeartbeat(username, "123"),
      "1"
    );
    await redis.set(redisKeys.memory.index(username), JSON.stringify(["bio"]));
    await redis.set(
      redisKeys.memory.detail(username, "bio"),
      JSON.stringify({ content: "private" })
    );
    await redis.set(
      redisKeys.memory.daily(username, "2026-06-28"),
      JSON.stringify({ entries: [{ content: "private" }] })
    );
    await redis.set(redisKeys.memory.processingLock(username), "1");
    await redis.set(
      redisKeys.system.userHeartbeats(username, "2026-06-28"),
      JSON.stringify({ entries: [{ stateSummary: "private" }] })
    );
    await redis.zadd(redisKeys.presence.globalOnline(), {
      score: Date.now(),
      member: username,
    });
    await redis.hset(redisKeys.sync.v2Blobs(username), {
      [blobDigest]: JSON.stringify({ url: blobUrl, size: 7 }),
    });
    await redis.lpush(redisKeys.chat.roomMessages(sharedRoomId), sharedMessage);

    const deletedObjects: string[] = [];
    const result = await purgeUserAccount(redis, username, {
      resolveObjectUrl: (url, expectedPathname) =>
        resolveOwnedStorageObjectUrl(url, expectedPathname, {
          provider: "s3",
          bucket: "test-bucket",
        }),
      deleteObject: async (url) => {
        expect(
          await redis.hgetall(redisKeys.sync.v2Blobs(username))
        ).not.toBeNull();
        deletedObjects.push(url);
      },
    });

    expect(result.objectStorageFailures).toBe(0);
    expect(deletedObjects).toEqual([blobUrl]);
    expect(
      await redis.exists(
        redisKeys.integration.telegramAccountByUsername(username),
        redisKeys.integration.telegramAccountByTelegramUser(telegramUserId),
        redisKeys.integration.telegramPendingLink(username),
        redisKeys.integration.telegramLinkCode(linkCode),
        redisKeys.integration.telegramHistory(telegramChatId),
        redisKeys.integration.telegramHeartbeatSettings(username),
        redisKeys.integration.telegramHeartbeat(username, "123"),
        redisKeys.memory.index(username),
        redisKeys.memory.detail(username, "bio"),
        redisKeys.memory.daily(username, "2026-06-28"),
        redisKeys.memory.processingLock(username),
        redisKeys.system.userHeartbeats(username, "2026-06-28"),
        redisKeys.sync.v2Blobs(username)
      )
    ).toBe(0);
    expect(
      await redis.zrange(redisKeys.presence.globalOnline(), 0, -1)
    ).not.toContain(username);
    const remainingMessages = await redis.lrange<unknown>(
      redisKeys.chat.roomMessages(sharedRoomId),
      0,
      -1
    );
    const normalizedMessages = remainingMessages.map((message) =>
      typeof message === "string" ? JSON.parse(message) : message
    );
    expect(normalizedMessages).toContainEqual(JSON.parse(sharedMessage));

    await redis.del(redisKeys.chat.roomMessages(sharedRoomId));
  });

  test("shared purge retains the blob registry when object deletion fails", async () => {
    const username = uniqueTestUsername("purgeblobfail").toLowerCase();
    const registryKey = redisKeys.sync.v2Blobs(username);
    const blobDigest = "b".repeat(64);
    await redis.hset(registryKey, {
      [blobDigest]: JSON.stringify({
        url: `s3://test-bucket/sync/${username}/blobs/${blobDigest}.gz`,
        size: 7,
      }),
    });

    const result = await purgeUserAccount(redis, username, {
      resolveObjectUrl: (url, expectedPathname) =>
        resolveOwnedStorageObjectUrl(url, expectedPathname, {
          provider: "s3",
          bucket: "test-bucket",
        }),
      deleteObject: async () => {
        throw new Error("simulated storage failure");
      },
    });

    expect(result.objectStorageFailures).toBe(1);
    expect(await redis.hgetall(registryKey)).not.toBeNull();
    await redis.del(registryKey);
  });

  test("shared purge never deletes another user's registered blob URL", async () => {
    const username = uniqueTestUsername("purgeblobowner").toLowerCase();
    const otherUsername = uniqueTestUsername("purgeblobother").toLowerCase();
    const registryKey = redisKeys.sync.v2Blobs(username);
    const blobDigest = "c".repeat(64);
    const crossUserUrl =
      `s3://test-bucket/sync/${otherUsername}/blobs/${blobDigest}.gz`;
    await redis.hset(registryKey, {
      [blobDigest]: JSON.stringify({ url: crossUserUrl, size: 7 }),
    });

    const deletedObjects: string[] = [];
    const result = await purgeUserAccount(redis, username, {
      resolveObjectUrl: (url, expectedPathname) =>
        resolveOwnedStorageObjectUrl(url, expectedPathname, {
          provider: "s3",
          bucket: "test-bucket",
        }),
      deleteObject: async (url) => {
        deletedObjects.push(url);
      },
    });

    expect(result.objectStorageFailures).toBe(0);
    expect(deletedObjects).toEqual([]);
    expect(await redis.exists(registryKey)).toBe(0);
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
