/**
 * POST /api/auth/login
 *
 * Authenticate user with password (Node.js runtime for bcrypt).
 *
 * Rate limiting:
 * - Per-IP: 10 attempts/minute (uses the trust-aware `getClientIp` so that
 *   self-hosted deployments without trusted proxies cannot bypass the
 *   bucket via X-Forwarded-For spoofing).
 * - Per-username: 20 failed attempts/hour, then 1-hour lockout. Resets on
 *   the next successful login. This protects accounts even when an
 *   attacker rotates IPs or uses a botnet.
 */

import {
  generateAuthToken,
  storeToken,
  deleteToken,
  storeLastValidToken,
  isUserBanned,
  isLoginLocked,
  recordLoginFailure,
  resetLoginFailures,
  TOKEN_GRACE_PERIOD,
} from "../_utils/auth/index.js";
import { verifyPassword, getUserPasswordHash } from "../_utils/auth/_password.js";
import { apiHandler } from "../_utils/api-handler.js";
import { buildSetAuthCookie } from "../_utils/_cookie.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { getHeader } from "../_utils/request-helpers.js";
import {
  getStoredUserRecord,
  updateStoredUserTimeZone,
} from "../_utils/auth/_user-record.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface LoginRequest {
  username: string;
  password: string;
  oldToken?: string;
}

const PER_IP_LIMIT = 10;
const PER_IP_WINDOW_SECONDS = 60;

export default apiHandler(
  { methods: ["POST"], auth: "none", parseJsonBody: true },
  async (ctx) => {
    const { req, res, redis } = ctx;
    const body = ctx.body as LoginRequest | null;
    const { username: rawUsername, password, oldToken } = body || {};

    // Per-IP rate limit (uses trust-aware getClientIp).
    const ip = getClientIp(req);
    const ipKey = `rl:auth:login:ip:${ip}`;
    const ipCurrent = await redis.incr(ipKey);
    if (ipCurrent === 1) {
      await redis.expire(ipKey, PER_IP_WINDOW_SECONDS);
    }
    if (ipCurrent > PER_IP_LIMIT) {
      res.status(429).json({
        error: "Too many login attempts. Please try again later.",
      });
      return;
    }

    if (!rawUsername || typeof rawUsername !== "string") {
      res.status(400).json({ error: "Username is required" });
      return;
    }

    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "Password is required" });
      return;
    }

    const username = rawUsername.toLowerCase();

    // Per-username lockout: if too many failures have accumulated, refuse
    // to even attempt verification until the lockout expires.
    if (await isLoginLocked(redis, username)) {
      res.status(429).json({
        error: "This account is temporarily locked. Please try again later.",
      });
      return;
    }

    // Check if user exists
    const userData = await getStoredUserRecord(redis, username);
    if (!userData) {
      // Same generic error as wrong-password to avoid username enumeration.
      // We DO NOT increment the per-user fail counter because this username
      // doesn't exist — there's no account to protect.
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Get and verify password
    const passwordHash = await getUserPasswordHash(redis, username);
    if (!passwordHash) {
      // Account has no password set yet (legacy). Treat as invalid creds.
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const passwordValid = await verifyPassword(password, passwordHash);
    if (!passwordValid) {
      await recordLoginFailure(redis, username);
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Banned accounts cannot obtain a session. Checked only after the password
    // is verified so we don't disclose ban status (or account existence) to
    // attackers probing with wrong credentials.
    if (isUserBanned(userData)) {
      res.status(403).json({ error: "This account has been banned." });
      return;
    }

    // Successful login — reset the per-username failure counter.
    await resetLoginFailures(redis, username);
    await updateStoredUserTimeZone(redis, username, getHeader(req, "x-user-timezone"));

    // Handle old token if provided (rotation)
    if (oldToken) {
      await storeLastValidToken(
        redis,
        username,
        oldToken,
        Date.now(),
        TOKEN_GRACE_PERIOD
      );
      await deleteToken(redis, oldToken);
    }

    // Generate new token
    const token = generateAuthToken();
    await storeToken(redis, username, token);

    res.setHeader("Set-Cookie", buildSetAuthCookie(username, token));
    res.status(200).json({ username });
  }
);
