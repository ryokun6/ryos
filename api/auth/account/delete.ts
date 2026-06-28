/**
 * POST /api/auth/account/delete
 *
 * Permanently delete the authenticated user's own account and all associated
 * data (sessions, password, recovery email, Telegram link, and Sync v2 data).
 *
 * Safety:
 * - Requires a fresh (non-grace) token.
 * - Requires `confirm: true` plus the literal `confirmUsername` matching the
 *   account, so a misfired request can't wipe an account.
 * - Requires `currentPassword` when the account has a password set.
 * - The admin account (`ryo`) cannot self-delete.
 *
 * Node.js runtime (bcrypt for password verification).
 */

import { apiHandler } from "../../_utils/api-handler.js";
import { purgeUserAccount } from "../../_utils/auth/index.js";
import { verifyPassword, getUserPasswordHash } from "../../_utils/auth/_password.js";
import { buildClearAuthCookie } from "../../_utils/_cookie.js";
import * as RateLimit from "../../_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 20;

interface DeleteAccountRequest {
  confirm: boolean;
  confirmUsername: string;
  currentPassword?: string;
}

const DELETE_RL_LIMIT = 5;
const DELETE_RL_WINDOW_SECONDS = 10 * 60;

export default apiHandler<DeleteAccountRequest>(
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

    if (username.toLowerCase() === "ryo") {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "The admin account cannot be deleted." });
      return;
    }

    if (body?.confirm !== true) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Deletion must be explicitly confirmed" });
      return;
    }

    const confirmUsername =
      typeof body?.confirmUsername === "string" ? body.confirmUsername.trim().toLowerCase() : "";
    if (confirmUsername !== username.toLowerCase()) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Confirmation username does not match" });
      return;
    }

    // Per-user rate limit (limits brute forcing currentPassword via this route).
    try {
      const rlKey = RateLimit.makeKey([
        "rl",
        "auth",
        "account",
        "delete",
        "user",
        username,
      ]);
      const rl = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: DELETE_RL_WINDOW_SECONDS,
        limit: DELETE_RL_LIMIT,
      });
      if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.resetSeconds));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          error: "Too many deletion attempts. Please try again later.",
        });
        return;
      }
    } catch (rateLimitError) {
      logger.warn("Account delete rate limit check failed", rateLimitError);
    }

    // Verify password when one is set.
    const existingHash = await getUserPasswordHash(redis, username);
    if (existingHash) {
      const currentPassword =
        typeof body?.currentPassword === "string" ? body.currentPassword : "";
      if (!currentPassword) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Current password is required" });
        return;
      }
      const valid = await verifyPassword(currentPassword, existingHash);
      if (!valid) {
        logger.warn("Invalid password during account deletion", { username });
        logger.response(401, Date.now() - startTime);
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
    }

    try {
      const purgeResult = await purgeUserAccount(redis, username);
      if (purgeResult.objectStorageFailures > 0) {
        logger.warn("Account deleted with object-storage cleanup failures", {
          username,
          objectStorageFailures: purgeResult.objectStorageFailures,
        });
      } else {
        logger.info("Account data purged", {
          username,
          deletedCount: purgeResult.deletedCount,
        });
      }
      res.setHeader("Set-Cookie", buildClearAuthCookie());
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Account deletion failed", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to delete account" });
    }
  }
);
