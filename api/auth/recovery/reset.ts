/**
 * POST /api/auth/recovery/reset
 *
 * Complete a password reset using a code delivered by /api/auth/recovery/request.
 * On success the password is replaced, ALL existing sessions are invalidated,
 * and a fresh session cookie is issued so the user is immediately logged in.
 *
 * Node.js runtime (bcrypt).
 */

import {
  generateAuthToken,
  storeToken,
  deleteAllUserTokens,
  isUserBanned,
  resetLoginFailures,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../../_utils/auth/index.js";
import { hashPassword, setUserPasswordHash } from "../../_utils/auth/_password.js";
import { getStoredUserRecord } from "../../_utils/auth/_user-record.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";
import { consumeRecoveryCode } from "../../_utils/auth/_recovery.js";
import { resolveRecoveryUsername } from "../../_utils/auth/_recovery-channels.js";
import { apiHandler } from "../../_utils/api-handler.js";
import { buildSetAuthCookie } from "../../_utils/_cookie.js";
import { getClientIp, makeKey } from "../../_utils/_rate-limit.js";

interface ResetRequestBody {
  /** Username or verified recovery email. */
  identifier: string;
  code: string;
  newPassword: string;
}

const PER_IP_LIMIT = 15;
const PER_IP_WINDOW_SECONDS = 10 * 60;

export default apiHandler<ResetRequestBody>(
  { methods: ["POST"], auth: "none", parseJsonBody: true },
  async ({ req, res, redis, logger, startTime, body }) => {
    const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    // Per-IP rate limit on reset attempts (guards code brute force across users).
    const ip = getClientIp(req);
    const ipKey = makeKey(["rl", "auth:recovery:reset", "ip", ip]);
    const ipCurrent = await redis.incr(ipKey);
    if (ipCurrent === 1) await redis.expire(ipKey, PER_IP_WINDOW_SECONDS);
    if (ipCurrent > PER_IP_LIMIT) {
      res.setHeader("Retry-After", String(PER_IP_WINDOW_SECONDS));
      logger.response(429, Date.now() - startTime);
      res.status(429).json({
        error: "Too many reset attempts. Please try again later.",
      });
      return;
    }

    if (!identifier || !code) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Identifier and code are required" });
      return;
    }

    if (!newPassword || typeof newPassword !== "string") {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "A new password is required" });
      return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      logger.response(400, Date.now() - startTime);
      res
        .status(400)
        .json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });
      return;
    }
    if (newPassword.length > PASSWORD_MAX_LENGTH) {
      logger.response(400, Date.now() - startTime);
      res
        .status(400)
        .json({ error: `Password must be ${PASSWORD_MAX_LENGTH} characters or less` });
      return;
    }

    const username = await resolveRecoveryUsername(redis, identifier);
    // Generic error whether the account is unknown or the code is wrong, so this
    // cannot be used to enumerate accounts.
    const genericInvalid = () => {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid or expired reset code" });
    };

    if (!username) {
      genericInvalid();
      return;
    }

    const result = await consumeRecoveryCode(
      redis,
      redisKeys.auth.passwordReset(username),
      username,
      code
    );
    if (!result.ok) {
      genericInvalid();
      return;
    }

    // Code is valid. Banned accounts cannot be recovered into an active session.
    const record = await getStoredUserRecord(redis, username);
    if (record && isUserBanned(record)) {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "This account has been banned." });
      return;
    }

    try {
      const passwordHash = await hashPassword(newPassword);
      await setUserPasswordHash(redis, username, passwordHash);
      // Invalidate every existing session — a reset implies the old credentials
      // may be compromised.
      await deleteAllUserTokens(redis, username);
      await resetLoginFailures(redis, username);

      // Issue a fresh session so the user is logged in immediately.
      const token = generateAuthToken();
      await storeToken(redis, username, token);
      res.setHeader("Set-Cookie", buildSetAuthCookie(username, token));

      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true, username });
    } catch (error) {
      logger.error("Password reset failed", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to reset password" });
    }
  }
);
