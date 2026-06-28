/**
 * POST /api/auth/email/set
 *
 * Set or change the recovery email for the authenticated user and send a
 * verification code to the new address. The email is stored unverified until
 * the user confirms it via /api/auth/email/verify.
 *
 * Requires a fresh (non-grace) token: changing recovery contacts is a
 * sensitive operation, mirroring /api/auth/password/set.
 */

import { apiHandler } from "../../_utils/api-handler.js";
import {
  getStoredUserRecord,
  patchStoredUserRecord,
  normalizeEmail,
  isValidEmail,
  getUsernameByEmail,
  deleteUserEmailIndex,
} from "../../_utils/auth/_user-record.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";
import { issueRecoveryCode } from "../../_utils/auth/_recovery.js";
import { isEmailConfigured, sendEmail } from "../../_utils/email.js";
import * as RateLimit from "../../_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface SetEmailRequest {
  email: string;
}

const SET_EMAIL_RL_LIMIT = 5;
const SET_EMAIL_RL_WINDOW_SECONDS = 10 * 60;

export default apiHandler<SetEmailRequest>(
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

    if (!isEmailConfigured()) {
      logger.response(503, Date.now() - startTime);
      res.status(503).json({
        error: "Email recovery is not available on this server.",
      });
      return;
    }

    const email = normalizeEmail(body?.email);
    if (!email || !isValidEmail(email)) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "A valid email address is required" });
      return;
    }

    // Per-user rate limit on email-set attempts (also throttles outbound mail).
    try {
      const rlKey = RateLimit.makeKey([
        "rl",
        "auth",
        "email",
        "set",
        "user",
        username,
      ]);
      const rl = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: SET_EMAIL_RL_WINDOW_SECONDS,
        limit: SET_EMAIL_RL_LIMIT,
      });
      if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.resetSeconds));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          error: "Too many email change attempts. Please try again later.",
        });
        return;
      }
    } catch (rateLimitError) {
      logger.warn("Email set rate limit check failed", rateLimitError);
    }

    // Prevent claiming an email already verified by a different account.
    const existingOwner = await getUsernameByEmail(redis, email);
    if (existingOwner && existingOwner !== username) {
      logger.response(409, Date.now() - startTime);
      res.status(409).json({ error: "That email is already in use." });
      return;
    }

    const record = await getStoredUserRecord(redis, username);
    if (!record) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Account not found" });
      return;
    }

    // If switching away from a previously verified email, drop its index so it
    // can no longer be used for recovery.
    if (record.email && record.email !== email && record.emailVerified) {
      await deleteUserEmailIndex(redis, record.email);
    }

    await patchStoredUserRecord(redis, username, {
      email,
      emailVerified: false,
      emailUpdatedAt: Date.now(),
    });

    const code = await issueRecoveryCode(
      redis,
      redisKeys.auth.emailVerify(username),
      username
    );

    const sendResult = await sendEmail({
      to: email,
      subject: "Verify your ryOS recovery email",
      text:
        `Your ryOS email verification code is ${code}.\n\n` +
        `Enter it in ryOS to confirm this address. It expires in 15 minutes.\n\n` +
        `If you didn't request this, you can ignore this email.`,
    });

    if (!sendResult.sent) {
      logger.warn("Failed to send verification email", {
        username,
        reason: sendResult.reason,
        error: sendResult.error,
      });
      logger.response(502, Date.now() - startTime);
      res.status(502).json({
        error: "Could not send the verification email. Please try again.",
      });
      return;
    }

    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true, email, emailVerified: false });
  }
);
