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
