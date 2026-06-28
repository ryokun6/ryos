/**
 * Integration tests for two auth hardening fixes:
 *
 * 1. Banned-user enforcement — a banned account cannot obtain or renew a
 *    session via /api/auth/login, /api/auth/register (existing-user path), or
 *    /api/auth/token/refresh.
 * 2. Register login lockout — the existing-user login path of
 *    /api/auth/register is subject to the same per-username lockout as
 *    /api/auth/login, and the lockout is shared across both endpoints.
 *
 * Requires the standalone API server (`bun run dev:api`) + Redis. The ban tests
 * set the `banned` flag directly in Redis (same store the server reads), so no
 * admin session is required.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  BASE_URL,
  fetchWithAuth,
  fetchWithOrigin,
  getTokenFromAuthCookie,
} from "./test-utils";
import { createRedis } from "../api/_utils/redis";
import {
  getStoredUserRecord,
  patchStoredUserRecord,
  updateStoredUserTimeZone,
} from "../api/_utils/auth/_user-record";
import { getUserPasswordHash, verifyPassword } from "../api/_utils/auth/_password";
import { redisKeys } from "../src/shared/redisKeys";

const PASSWORD = "testpassword123";

function ipHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Forwarded-For": `10.7.${Date.now() % 255}.${Math.floor(Math.random() * 255)}`,
  };
}

async function register(
  username: string,
  password = PASSWORD,
  headers = ipHeaders()
): Promise<Response> {
  return fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username, password }),
  });
}

async function login(username: string, password = PASSWORD): Promise<Response> {
  return fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: ipHeaders(),
    body: JSON.stringify({ username, password }),
  });
}

async function setBanned(username: string, banned: boolean): Promise<void> {
  const redis = createRedis();
  const existing = await getStoredUserRecord(redis, username);
  if (!existing) throw new Error(`Missing test user: ${username}`);
  await patchStoredUserRecord(redis, username, { banned });
}

describe("concurrent registration", () => {
  test("one creator wins without credential or initial-session overwrite", async () => {
    const username = `register_race_${Date.now()}`;
    const passwords = Array.from(
      { length: 8 },
      (_, index) => `concurrent-password-${index}`
    );
    const runIpOctet = (Date.now() % 200) + 20;

    const responses = await Promise.all(
      passwords.map((password, index) =>
        register(username, password, {
          "Content-Type": "application/json",
          "X-Forwarded-For": `10.77.${runIpOctet}.${index + 1}`,
        })
      )
    );
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(
      passwords.length - 1
    );

    const winner = statuses.indexOf(201);
    const redis = createRedis();
    const storedHash = await getUserPasswordHash(redis, username);
    expect(storedHash).toBeTruthy();
    expect(await verifyPassword(passwords[winner]!, storedHash!)).toBe(true);
    expect(
      await redis.smembers(redisKeys.auth.userSessions(username))
    ).toHaveLength(1);

    const existingUserLogin = await register(username, passwords[winner]!);
    expect(existingUserLogin.status).toBe(200);
    const losingPassword = await register(
      username,
      passwords[(winner + 1) % passwords.length]!
    );
    expect(losingPassword.status).toBe(409);
    expect(
      await verifyPassword(
        passwords[winner]!,
        (await getUserPasswordHash(redis, username))!
      )
    ).toBe(true);
  }, 30000);
});

describe("concurrent admin ban and profile updates", () => {
  // Fresh CI intentionally has no seeded real admin. The equivalent record
  // mutation race remains covered by test-auth-user-record-concurrency.
  test.skipIf(process.env.RUN_ADMIN_BAN_RACE_TEST !== "1")(
    "the admin ban remains set after racing atomic profile writes",
    async () => {
      const username = `ban_race_${Date.now()}`;
      const registration = await register(username);
      expect(registration.status).toBe(201);

      const adminLogin = await login("ryo", "testtest");
      expect(adminLogin.status).toBe(200);
      const adminToken = getTokenFromAuthCookie(adminLogin);
      expect(adminToken).toBeTruthy();

      const redis = createRedis();
      const banRequest = fetchWithAuth(
        `${BASE_URL}/api/admin`,
        "ryo",
        adminToken!,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "banUser",
            targetUsername: username,
            reason: "concurrency test",
          }),
        }
      );
      const profileWrites = Array.from({ length: 20 }, (_, index) =>
        Promise.all([
          updateStoredUserTimeZone(redis, username, "America/New_York", index),
          patchStoredUserRecord(redis, username, { lastActive: index }),
        ])
      );

      const [banResponse] = await Promise.all([banRequest, ...profileWrites]);
      expect(banResponse.status).toBe(200);
      const record = await getStoredUserRecord(redis, username);
      expect(record).toMatchObject({
        banned: true,
        banReason: "concurrency test",
        timeZone: "America/New_York",
      });
      expect(typeof record?.lastActive).toBe("number");
    }
  );
});

describe("banned-user enforcement", () => {
  let user: string;

  beforeAll(async () => {
    user = `revoked_${Date.now()}`;
    const res = await register(user);
    expect([200, 201]).toContain(res.status);
  });

  test("a non-banned user can log in", async () => {
    const res = await login(user);
    expect(res.status).toBe(200);
    expect(getTokenFromAuthCookie(res)).toBeTruthy();
  });

  test("login is rejected once the account is banned", async () => {
    await setBanned(user, true);
    const res = await login(user);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(String(data.error).toLowerCase()).toContain("banned");
  });

  test("register login-path is rejected for a banned account", async () => {
    const res = await register(user);
    expect(res.status).toBe(403);
  });

  test("token refresh is rejected for a banned account", async () => {
    const token = "deadbeef".repeat(8);
    const res = await fetchWithOrigin(`${BASE_URL}/api/auth/token/refresh`, {
      method: "POST",
      headers: ipHeaders(),
      body: JSON.stringify({ username: user, oldToken: token }),
    });
    expect(res.status).toBe(403);
  });

  test("login works again after unban", async () => {
    await setBanned(user, false);
    const res = await login(user);
    expect(res.status).toBe(200);
  });
});

describe("register login lockout (shared with /api/auth/login)", () => {
  let user: string;

  beforeAll(async () => {
    user = `lockuser_${Date.now()}`;
    const res = await register(user);
    expect([200, 201]).toContain(res.status);
  });

  test("wrong-password register attempts eventually lock the account", async () => {
    // 21 wrong-password attempts via register (each with a fresh IP to bypass
    // the per-IP register limit) must arm the shared per-username lockout.
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await register(user, "definitely-wrong-password");
      last = res.status;
    }
    // The final loop attempt is either the last wrong-password 409 or the
    // first locked 429 (depends on exactly when the threshold trips); the
    // assertion below pins that the account is definitively locked afterwards.
    expect([409, 429]).toContain(last);

    const lockedRegister = await register(user, "definitely-wrong-password");
    expect(lockedRegister.status).toBe(429);
  }, 30000);

  test("the lockout is shared: /api/auth/login is also locked", async () => {
    // Even with the CORRECT password, login is refused while locked.
    const res = await login(user);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(String(data.error).toLowerCase()).toContain("locked");
  });
});
