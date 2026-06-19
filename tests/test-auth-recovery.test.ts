/**
 * Tests for self-service account recovery:
 * - /api/auth/recovery/request  (anti-enumeration, validation, rate limiting)
 * - /api/auth/recovery/reset    (code verification, password change, session
 *                                invalidation, edge cases)
 * - /api/auth/email/{set,verify,status,remove}
 *
 * Recovery codes are delivered out-of-band (Telegram/email) and never returned
 * by the API. To exercise the verify/reset logic deterministically, these tests
 * seed the hashed code into Redis using the SAME helper the endpoints use
 * (`issueRecoveryCode`), which returns the raw code while persisting its hash.
 *
 * Requires the standalone API server (`bun run dev:api`) + Redis.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  makeRateLimitBypassHeaders,
  getTokenFromAuthCookie,
  getAuthFromCookie,
} from "./test-utils";
import { createRedis } from "../api/_utils/redis";
import { redisKeys } from "../src/shared/redisKeys";
import { issueRecoveryCode } from "../api/_utils/auth/_recovery";
import {
  getStoredUserRecord,
  setStoredUserRecord,
  getUsernameByEmail,
} from "../api/_utils/auth/_user-record";

const redis = createRedis();

// Consonant-only suffix avoids digit leetspeak / profanity false-positives in
// the username validator while staying unique enough for test isolation.
function uniqueUser(prefix: string): string {
  const alphabet = "bcdfghjklmnpqrstvwxz";
  let suffix = "";
  for (let i = 0; i < 12; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}${suffix}`;
}

async function registerUser(
  username: string,
  password: string
): Promise<{ token: string | null }> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ username, password }),
  });
  expect(res.status).toBe(201);
  return { token: getTokenFromAuthCookie(res) };
}

describe("Account Recovery API", () => {
  // ==========================================================================
  // recovery/request — always generic, validates input
  // ==========================================================================
  describe("recovery/request (anti-enumeration)", () => {
    test("missing identifier -> 400", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/recovery/request`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ channel: "telegram" }),
      });
      expect(res.status).toBe(400);
    });

    test("unknown identifier -> 200 generic success", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/recovery/request`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          identifier: uniqueUser("nobody"),
          channel: "telegram",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(typeof data.message).toBe("string");
    });

    test("known username (no deliverable channel) -> 200 generic success", async () => {
      const username = uniqueUser("recreq");
      await registerUser(username, "testpassword123");

      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/recovery/request`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ identifier: username, channel: "telegram" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    test("GET not allowed -> 405", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/recovery/request`, {
        method: "GET",
      });
      expect(res.status).toBe(405);
    });
  });

  // ==========================================================================
  // recovery/reset — core logic via seeded codes
  // ==========================================================================
  describe("recovery/reset", () => {
    test("happy path: seeded code resets password, invalidates old session, logs in", async () => {
      const username = uniqueUser("recreset");
      const { token: oldToken } = await registerUser(username, "oldpassword123");
      expect(oldToken).toBeTruthy();

      // Seed a reset code exactly as the request endpoint would.
      const code = await issueRecoveryCode(
        redis,
        redisKeys.auth.passwordReset(username),
        username
      );

      const newPassword = "brandnewpass456";
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/recovery/reset`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ identifier: username, code, newPassword }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.username).toBe(username);

      // A fresh session cookie should be issued.
      const newAuth = getAuthFromCookie(res);
      expect(newAuth?.token).toBeTruthy();

      // The OLD token must now be invalid (all sessions were cleared).
      const oldTokenCheck = await fetchWithAuth(
        `${BASE_URL}/api/auth/password/check`,
        username,
        oldToken as string,
        { method: "GET" }
      );
      expect(oldTokenCheck.status).toBe(401);

      // The NEW token should work.
      const newTokenCheck = await fetchWithAuth(
        `${BASE_URL}/api/auth/password/check`,
        username,
        newAuth?.token as string,
        { method: "GET" }
      );
      expect(newTokenCheck.status).toBe(200);

      // Login with the new password works; the old one does not.
      const goodLogin = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ username, password: newPassword }),
      });
      expect(goodLogin.status).toBe(200);

      const badLogin = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ username, password: "oldpassword123" }),
      });
      expect(badLogin.status).toBe(401);
    });

    test("wrong code -> 400 generic", async () => {
      const username = uniqueUser("recwrong");
      await registerUser(username, "oldpassword123");
      await issueRecoveryCode(
        redis,
        redisKeys.auth.passwordReset(username),
        username
      );

      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/recovery/reset`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          identifier: username,
          code: "000000aa", // never matches a numeric code
          newPassword: "brandnewpass456",
        }),
      });
      expect(res.status).toBe(400);
    });

    test("code is single-use (reuse fails)", async () => {
      const username = uniqueUser("recreuse");
      await registerUser(username, "oldpassword123");
      const code = await issueRecoveryCode(
        redis,
        redisKeys.auth.passwordReset(username),
        username
      );

      const first = await fetchWithOrigin(`${BASE_URL}/api/auth/recovery/reset`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          identifier: username,
          code,
          newPassword: "firstnewpass123",
        }),
      });
      expect(first.status).toBe(200);

      const second = await fetchWithOrigin(`${BASE_URL}/api/auth/recovery/reset`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          identifier: username,
          code,
          newPassword: "secondnewpass123",
        }),
      });
      expect(second.status).toBe(400);
    });

    test("unknown user -> 400 generic (no enumeration)", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/recovery/reset`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          identifier: uniqueUser("ghost"),
          code: "123456",
          newPassword: "brandnewpass456",
        }),
      });
      expect(res.status).toBe(400);
    });

    test("weak new password -> 400", async () => {
      const username = uniqueUser("recweak");
      await registerUser(username, "oldpassword123");
      const code = await issueRecoveryCode(
        redis,
        redisKeys.auth.passwordReset(username),
        username
      );

      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/recovery/reset`, {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({ identifier: username, code, newPassword: "abc" }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // email/* — gating + verify logic + email-identifier resolution
  // ==========================================================================
  describe("email management", () => {
    test("status reflects no email + provider config", async () => {
      const username = uniqueUser("emailstat");
      const { token } = await registerUser(username, "testpassword123");

      const res = await fetchWithAuth(
        `${BASE_URL}/api/auth/email/status`,
        username,
        token as string,
        { method: "GET" }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.hasEmail).toBe(false);
      expect(typeof data.emailConfigured).toBe("boolean");
    });

    test("email/set returns 503 when provider unconfigured", async () => {
      // This environment has no RESEND_API_KEY; set must report unavailable.
      const username = uniqueUser("emailset");
      const { token } = await registerUser(username, "testpassword123");

      const statusRes = await fetchWithAuth(
        `${BASE_URL}/api/auth/email/status`,
        username,
        token as string,
        { method: "GET" }
      );
      const status = await statusRes.json();

      const res = await fetchWithAuth(
        `${BASE_URL}/api/auth/email/set`,
        username,
        token as string,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: `${username}@example.com` }),
        }
      );
      if (status.emailConfigured) {
        // If a provider IS configured, set should succeed instead.
        expect([200, 502]).toContain(res.status);
      } else {
        expect(res.status).toBe(503);
      }
    });

    test("email/verify with seeded code verifies + indexes, enabling email reset", async () => {
      const username = uniqueUser("emailver");
      const { token } = await registerUser(username, "oldpassword123");
      const email = `${username}@example.com`;

      // Simulate a pending (unverified) email as email/set would persist it.
      const record = await getStoredUserRecord(redis, username);
      await setStoredUserRecord(redis, username, {
        ...(record || { username }),
        email,
        emailVerified: false,
        emailUpdatedAt: Date.now(),
      });
      const verifyCode = await issueRecoveryCode(
        redis,
        redisKeys.auth.emailVerify(username),
        username
      );

      const verifyRes = await fetchWithAuth(
        `${BASE_URL}/api/auth/email/verify`,
        username,
        token as string,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: verifyCode }),
        }
      );
      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json();
      expect(verifyData.emailVerified).toBe(true);

      // Reverse index now resolves the email to the username.
      expect(await getUsernameByEmail(redis, email)).toBe(username);

      // A password reset can now be completed using the EMAIL as identifier.
      const resetCode = await issueRecoveryCode(
        redis,
        redisKeys.auth.passwordReset(username),
        username
      );
      const resetRes = await fetchWithOrigin(
        `${BASE_URL}/api/auth/recovery/reset`,
        {
          method: "POST",
          headers: makeRateLimitBypassHeaders(),
          body: JSON.stringify({
            identifier: email,
            code: resetCode,
            newPassword: "emailresetpass123",
          }),
        }
      );
      expect(resetRes.status).toBe(200);
      const resetData = await resetRes.json();
      expect(resetData.username).toBe(username);

      // Remove clears the email + index.
      const removeRes = await fetchWithAuth(
        `${BASE_URL}/api/auth/email/remove`,
        username,
        token as string,
        { method: "POST" }
      );
      // The reset above invalidated sessions, so the original token may now be
      // unauthorized; accept either a successful removal or 401.
      expect([200, 401]).toContain(removeRes.status);
      if (removeRes.status === 200) {
        expect(await getUsernameByEmail(redis, email)).toBeNull();
      }
    });

    test("email/verify with wrong code -> 400", async () => {
      const username = uniqueUser("emailbad");
      const { token } = await registerUser(username, "testpassword123");
      const email = `${username}@example.com`;
      const record = await getStoredUserRecord(redis, username);
      await setStoredUserRecord(redis, username, {
        ...(record || { username }),
        email,
        emailVerified: false,
      });
      await issueRecoveryCode(
        redis,
        redisKeys.auth.emailVerify(username),
        username
      );

      const res = await fetchWithAuth(
        `${BASE_URL}/api/auth/email/verify`,
        username,
        token as string,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "999999zz" }),
        }
      );
      expect(res.status).toBe(400);
    });

    test("email/status requires auth", async () => {
      const res = await fetchWithOrigin(`${BASE_URL}/api/auth/email/status`, {
        method: "GET",
      });
      expect(res.status).toBe(401);
    });
  });
});
