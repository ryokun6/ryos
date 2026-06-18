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
  fetchWithOrigin,
  getTokenFromAuthCookie,
} from "./test-utils";
import { createRedis } from "../api/_utils/redis";
import {
  getStoredUserRecord,
  setStoredUserRecord,
} from "../api/_utils/auth/_user-record";

const PASSWORD = "testpassword123";

function ipHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Forwarded-For": `10.7.${Date.now() % 255}.${Math.floor(Math.random() * 255)}`,
  };
}

async function register(username: string, password = PASSWORD): Promise<Response> {
  return fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: ipHeaders(),
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
  // Read and write via the same canonical-first path the server uses
  // (`auth:user:<username>:profile`, falling back to the legacy
  // `chat:users:<username>`) so the ban flag lands in the record that
  // login / register / token-refresh actually read.
  const existing =
    (await getStoredUserRecord(redis, username)) ?? {
      username: username.toLowerCase(),
    };
  await setStoredUserRecord(redis, username, { ...existing, banned });
}

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
    // After crossing the threshold, register returns 429 (locked), not 409.
    expect(last === 429 || last === 409).toBe(true);

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
