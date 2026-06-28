/**
 * POST /api/auth/email/verify
 *
 * Confirm the pending recovery email for the authenticated user by submitting
 * the code that was emailed to them. On success the email is marked verified
 * and the reverse index (email -> username) is written so the address can be
 * used to recover the account.
 */

import { apiHandler } from "../../_utils/api-handler.js";
import {
  getStoredUserRecord,
  patchStoredUserRecord,
  getUsernameByEmail,
  setUserEmailIndex,
} from "../../_utils/auth/_user-record.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";
import { consumeRecoveryCode } from "../../_utils/auth/_recovery.js";
import * as RateLimit from "../../_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface VerifyEmailRequest {
  code: string;
}

const VERIFY_EMAIL_RL_LIMIT = 20;
const VERIFY_EMAIL_RL_WINDOW_SECONDS = 10 * 60;

export default apiHandler<VerifyEmailRequest>(
  {
    methods: ["POST"],
    auth: "required",
    allowExpiredAuth: false,
    parseJsonBody: true,
  },
  async ({ res, redis, logger, startTime, user, body }) => {
    const username = user?.username || "";
    if (!username) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Verification code is required" });
      return;
    }

    try {
      const rlKey = RateLimit.makeKey([
        "rl",
        "auth",
        "email",
        "verify",
        "user",
        username,
      ]);
      const rl = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: VERIFY_EMAIL_RL_WINDOW_SECONDS,
        limit: VERIFY_EMAIL_RL_LIMIT,
      });
      if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.resetSeconds));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          error: "Too many verification attempts. Please try again later.",
        });
        return;
      }
    } catch (rateLimitError) {
      logger.warn("Email verify rate limit check failed", rateLimitError);
    }

    const record = await getStoredUserRecord(redis, username);
    if (!record?.email) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "No pending email to verify" });
      return;
    }

    const result = await consumeRecoveryCode(
      redis,
      redisKeys.auth.emailVerify(username),
      username,
      code
    );

    if (!result.ok) {
      const message =
        result.reason === "too_many_attempts"
          ? "Too many incorrect attempts. Request a new code."
          : "Invalid or expired verification code";
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: message });
      return;
    }

    // Guard against a race where another account verified the same email first.
    const existingOwner = await getUsernameByEmail(redis, record.email);
    if (existingOwner && existingOwner !== username) {
      logger.response(409, Date.now() - startTime);
      res.status(409).json({ error: "That email is already in use." });
      return;
    }

    await patchStoredUserRecord(redis, username, {
      emailVerified: true,
    });
    await setUserEmailIndex(redis, record.email, username);

    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true, email: record.email, emailVerified: true });
  }
);
