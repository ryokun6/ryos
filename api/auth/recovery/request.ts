/**
 * POST /api/auth/recovery/request
 *
 * Start a password-reset by sending a single-use code to EVERY recovery channel
 * the account has available (linked Telegram chat and/or verified recovery
 * email). The caller does not choose a channel — one code is issued and
 * delivered everywhere it can be.
 *
 * Anti-enumeration: this endpoint ALWAYS returns a generic success response
 * regardless of whether the identifier maps to a real account or whether any
 * channel is configured. It never reveals which channels exist.
 */

import { apiHandler } from "../../_utils/api-handler.js";
import { getStoredUserRecord } from "../../_utils/auth/_user-record.js";
import { redisKeys, sha256RedisIdentifier } from "../../../src/shared/redisKeys.js";
import { issueRecoveryCode } from "../../_utils/auth/_recovery.js";
import {
  resolveRecoveryUsername,
  sendTelegramToUser,
} from "../../_utils/auth/_recovery-channels.js";
import { sendEmail } from "../../_utils/email.js";
import { getClientIp, makeKey } from "../../_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface RecoveryRequestBody {
  identifier: string;
}

const PER_IP_LIMIT = 10;
const PER_IP_WINDOW_SECONDS = 10 * 60;
const PER_IDENTIFIER_LIMIT = 4;
const PER_IDENTIFIER_WINDOW_SECONDS = 10 * 60;

// Generic response used for every outcome so callers learn nothing about
// account existence or configured channels.
const GENERIC_OK = {
  success: true,
  message:
    "If an account with that information exists, a reset code has been sent.",
};

export default apiHandler<RecoveryRequestBody>(
  { methods: ["POST"], auth: "none", parseJsonBody: true },
  async ({ req, res, redis, logger, startTime, body }) => {
    const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";

    if (!identifier) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "An account identifier is required" });
      return;
    }

    // Per-IP rate limit (always enforced, before any account lookup).
    const ip = getClientIp(req);
    const ipKey = makeKey(["rl", "auth:recovery:request", "ip", ip]);
    const ipCurrent = await redis.incr(ipKey);
    if (ipCurrent === 1) await redis.expire(ipKey, PER_IP_WINDOW_SECONDS);
    if (ipCurrent > PER_IP_LIMIT) {
      res.setHeader("Retry-After", String(PER_IP_WINDOW_SECONDS));
      logger.response(429, Date.now() - startTime);
      res.status(429).json({
        error: "Too many recovery requests. Please try again later.",
      });
      return;
    }

    // Per-identifier rate limit (hashed) to avoid spamming a real user's
    // Telegram/email. Failing this still returns the generic OK so it cannot be
    // used to probe which identifiers are real.
    try {
      const idHash = await sha256RedisIdentifier(identifier.toLowerCase());
      const idKey = makeKey(["rl", "auth:recovery:request", "id", idHash]);
      const idCurrent = await redis.incr(idKey);
      if (idCurrent === 1) await redis.expire(idKey, PER_IDENTIFIER_WINDOW_SECONDS);
      if (idCurrent > PER_IDENTIFIER_LIMIT) {
        logger.response(200, Date.now() - startTime);
        res.status(200).json(GENERIC_OK);
        return;
      }
    } catch (rlError) {
      logger.warn("Recovery per-identifier rate limit failed", rlError);
    }

    try {
      const username = await resolveRecoveryUsername(redis, identifier);
      if (username) {
        // Issue a single code and fan it out to every available channel. The
        // same code works regardless of where the user reads it.
        const code = await issueRecoveryCode(
          redis,
          redisKeys.auth.passwordReset(username),
          username
        );
        let delivered = false;

        const telegramDelivered = await sendTelegramToUser(
          redis,
          username,
          `Your ryOS password reset code is ${code}.\n\n` +
            `It expires in 15 minutes. If you didn't request this, ignore this message.`
        );
        if (telegramDelivered) delivered = true;

        const record = await getStoredUserRecord(redis, username);
        if (record?.email && record.emailVerified) {
          const sendResult = await sendEmail({
            to: record.email,
            subject: "Your ryOS password reset code",
            text:
              `Your ryOS password reset code is ${code}.\n\n` +
              `It expires in 15 minutes. If you didn't request this, ignore this email.`,
          });
          if (sendResult.sent) {
            delivered = true;
          } else {
            logger.warn("Failed to send recovery email", {
              reason: sendResult.reason,
            });
          }
        }

        if (!delivered) {
          // No usable channel — drop the unusable code so it can't linger.
          await redis.del(redisKeys.auth.passwordReset(username));
        }
      }
    } catch (error) {
      // Never surface internal errors as a distinguishable response.
      logger.error("Recovery request error", error);
    }

    logger.response(200, Date.now() - startTime);
    res.status(200).json(GENERIC_OK);
  }
);
