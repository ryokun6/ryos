/**
 * POST /api/auth/password/set
 *
 * Set or change a user's password (Node.js runtime for bcrypt).
 *
 * Behaviour:
 * - If the user already has a password, the request MUST include
 *   `currentPassword` and it must verify against the stored bcrypt hash.
 * - If the user has no password yet (e.g. legacy account, first set-up),
 *   `currentPassword` is not required so accounts can be migrated.
 * - Only fully-valid (non-grace-period) tokens are accepted. Stale or
 *   recently-rotated tokens cannot be used to take over an account.
 */

import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../../_utils/auth/index.js";
import {
  hashPassword,
  setUserPasswordHash,
  verifyPassword,
  getUserPasswordHash,
} from "../../_utils/auth/_password.js";
import { apiHandler } from "../../_utils/api-handler.js";
import * as RateLimit from "../../_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface SetPasswordRequest {
  /** New password to store. Required. */
  password: string;
  /**
   * Existing password. Required if the user already has a password set.
   * If the user has no password yet (legacy account), this may be omitted.
   */
  currentPassword?: string;
}

// Per-user rate limit on password-change attempts. Limits brute-forcing of
// `currentPassword` from a hijacked session without being too aggressive
// for a legitimate user iterating in the UI. Bcrypt verification is the
// slow path here (~100ms) so 60 attempts/minute still leaves no
// meaningful guessing throughput for real attackers.
const PASSWORD_CHANGE_RL_LIMIT = 60;
const PASSWORD_CHANGE_RL_WINDOW_SECONDS = 60;

export default apiHandler<SetPasswordRequest>(
  {
    methods: ["POST"],
    auth: "required",
    // Sensitive operation: do NOT accept grace-period tokens. Only a fresh,
    // currently-valid session may change the password. This prevents stolen
    // or recently-rotated tokens from being used for account takeover.
    allowExpiredAuth: false,
    parseJsonBody: true,
  },
  async ({ res, redis, logger, startTime, user, body }): Promise<void> => {
    const username = user?.username || "";
    if (!username) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const password = body?.password;
    const currentPassword = body?.currentPassword;

    if (!password || typeof password !== "string") {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Password is required" });
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      logger.response(400, Date.now() - startTime);
      res
        .status(400)
        .json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });
      return;
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
      logger.response(400, Date.now() - startTime);
      res
        .status(400)
        .json({ error: `Password must be ${PASSWORD_MAX_LENGTH} characters or less` });
      return;
    }

    // Per-user rate limit on password-set attempts. Limits brute-force
    // guessing of `currentPassword` from a hijacked session.
    try {
      const rlKey = RateLimit.makeKey([
        "rl",
        "auth",
        "password",
        "set",
        "user",
        username,
      ]);
      const rl = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: PASSWORD_CHANGE_RL_WINDOW_SECONDS,
        limit: PASSWORD_CHANGE_RL_LIMIT,
      });
      if (!rl.allowed) {
        logger.warn("Password change rate limit exceeded", { username });
        res.setHeader("Retry-After", String(rl.resetSeconds));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          error: "Too many password change attempts. Please try again later.",
        });
        return;
      }
    } catch (rateLimitError) {
      logger.warn("Password change rate limit check failed", rateLimitError);
    }

    try {
      const existingHash = await getUserPasswordHash(redis, username);

      if (existingHash) {
        if (!currentPassword || typeof currentPassword !== "string") {
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: "Current password is required" });
          return;
        }

        const valid = await verifyPassword(currentPassword, existingHash);
        if (!valid) {
          logger.warn("Invalid current password during password change", {
            username,
          });
          logger.response(401, Date.now() - startTime);
          res.status(401).json({ error: "Current password is incorrect" });
          return;
        }

        if (currentPassword === password) {
          logger.response(400, Date.now() - startTime);
          res
            .status(400)
            .json({ error: "New password must be different from the current password" });
          return;
        }
      }

      const passwordHash = await hashPassword(password);
      await setUserPasswordHash(redis, username, passwordHash);

      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error setting password", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to set password" });
    }
  }
);
