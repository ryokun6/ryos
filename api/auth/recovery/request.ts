/**
 * POST /api/auth/recovery/request
 *
 * Start a password-reset by sending a single-use code to one of the account's
 * recovery channels (linked Telegram chat or verified recovery email).
 *
 * Anti-enumeration: this endpoint ALWAYS returns a generic success response
 * regardless of whether the identifier maps to a real account or whether the
 * requested channel is configured. It never reveals which channels exist.
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

type RecoveryChannel = "telegram" | "email";

interface RecoveryRequestBody {
  identifier: string;
  channel: RecoveryChannel;
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
    const channel: RecoveryChannel = body?.channel === "email" ? "email" : "telegram";

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
        if (channel === "telegram") {
          const code = await issueRecoveryCode(
            redis,
            redisKeys.auth.passwordReset(username),
            username
          );
          const delivered = await sendTelegramToUser(
            redis,
            username,
            `Your ryOS password reset code is ${code}.\n\n` +
              `It expires in 15 minutes. If you didn't request this, ignore this message.`
          );
          if (!delivered) {
            // No usable channel — drop the unusable code so it can't linger.
            await redis.del(redisKeys.auth.passwordReset(username));
          }
        } else {
          const record = await getStoredUserRecord(redis, username);
          if (record?.email && record.emailVerified) {
            const code = await issueRecoveryCode(
              redis,
              redisKeys.auth.passwordReset(username),
              username
            );
            const sendResult = await sendEmail({
              to: record.email,
              subject: "Your ryOS password reset code",
              text:
                `Your ryOS password reset code is ${code}.\n\n` +
                `It expires in 15 minutes. If you didn't request this, ignore this email.`,
            });
            if (!sendResult.sent) {
              await redis.del(redisKeys.auth.passwordReset(username));
              logger.warn("Failed to send recovery email", {
                reason: sendResult.reason,
              });
            }
          }
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
