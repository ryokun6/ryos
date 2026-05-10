/**
 * End-to-end checks for the S-01 / S-03 hardening.
 *
 * Requires the standalone Bun API server running at $BASE_URL (defaults
 * to http://localhost:3000). Run with:
 *
 *   REDIS_URL=redis://127.0.0.1:6379 bun run dev:api &
 *   bun test tests/test-security-fixes.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  makeRateLimitBypassHeaders,
  getTokenFromAuthCookie,
} from "./test-utils";

const RNG = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

describe("Security fixes: S-01 + S-03", () => {
  let username = "";
  let password = "";
  let token: string | null = null;

  beforeAll(async () => {
    username = `sec${RNG()}`.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18);
    if (username.length < 3) username = `sec${Date.now().toString(36)}`;
    password = `Init-${RNG()}-AAAA`;

    const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ username, password }),
    });
    expect([200, 201]).toContain(res.status);
    token = getTokenFromAuthCookie(res);
    expect(token).toBeTruthy();
  });

  // ------------------------------------------------------------------
  // S-01: Password change requires existing password
  // ------------------------------------------------------------------

  test("S-01: changing password without oldPassword is rejected", async () => {
    if (!token) throw new Error("No token from register");

    const res = await fetchWithAuth(
      `${BASE_URL}/api/auth/password/set`,
      username,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: `New-${RNG()}-XXXX` }),
      }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.toLowerCase()).toContain("current password");
  });

  test("S-01: changing password with wrong oldPassword is rejected", async () => {
    if (!token) throw new Error("No token");

    const res = await fetchWithAuth(
      `${BASE_URL}/api/auth/password/set`,
      username,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: `New-${RNG()}-XXXX`,
          oldPassword: "this-is-not-the-real-password-zzz",
        }),
      }
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.toLowerCase()).toContain("incorrect");
  });

  test("S-01: changing password with correct oldPassword succeeds", async () => {
    if (!token) throw new Error("No token");

    const newPassword = `Rotated-${RNG()}-XXXX`;
    const res = await fetchWithAuth(
      `${BASE_URL}/api/auth/password/set`,
      username,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: newPassword,
          oldPassword: password,
        }),
      }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Update the in-memory password so the rest of the suite uses it.
    password = newPassword;

    // The new password must work for /api/auth/login.
    const loginRes = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ username, password: newPassword }),
    });
    expect(loginRes.status).toBe(200);
  });

  // ------------------------------------------------------------------
  // S-03: Banned users cannot re-authenticate
  // ------------------------------------------------------------------

  test("S-03: banned user is rejected on /api/auth/login and /api/auth/register", async () => {
    // Ban requires admin access. The dev admin user is `ryo` /
    // `testtest` (see scripts/seed-dev-users.ts). If the admin login
    // fails (different deploy), skip the test rather than failing.
    const adminLogin = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ username: "ryo", password: "testtest" }),
    });
    if (adminLogin.status !== 200) {
      console.warn(
        "S-03 e2e skipped: admin login failed (status=" +
          adminLogin.status +
          ")"
      );
      return;
    }
    const adminToken = getTokenFromAuthCookie(adminLogin);
    if (!adminToken) throw new Error("No admin token");

    // Ban the test user via the admin API.
    const banRes = await fetchWithAuth(
      `${BASE_URL}/api/admin`,
      "ryo",
      adminToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "banUser",
          targetUsername: username,
          reason: "automated security-fix test",
        }),
      }
    );
    expect(banRes.status).toBe(200);

    // /api/auth/login must now refuse the banned user.
    const reLogin = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ username, password }),
    });
    expect(reLogin.status).toBe(403);
    const reLoginBody = await reLogin.json();
    expect(typeof reLoginBody.error).toBe("string");
    expect(reLoginBody.error.toLowerCase()).toContain("ban");

    // /api/auth/register must also refuse the banned user, even when
    // the supplied password matches (the "register doubles as login"
    // path was the previous bypass).
    const reRegister = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ username, password }),
    });
    expect(reRegister.status).toBe(403);
    const reRegisterBody = await reRegister.json();
    expect(typeof reRegisterBody.error).toBe("string");
    expect(reRegisterBody.error.toLowerCase()).toContain("ban");

    // Cleanup: unban so subsequent test runs don't blow up if the
    // username happens to recur.
    await fetchWithAuth(`${BASE_URL}/api/admin`, "ryo", adminToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unbanUser", targetUsername: username }),
    });
  });
});
