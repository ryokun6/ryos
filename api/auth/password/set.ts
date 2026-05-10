/**
 * POST /api/auth/password/set
 * 
 * Set or update user's password (Node.js runtime for bcrypt)
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

export const runtime = "nodejs";
export const maxDuration = 15;

interface SetPasswordRequest {
  password: string;
  oldPassword?: string;
}

export default apiHandler<SetPasswordRequest>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ res, redis, logger, startTime, user, body }): Promise<void> => {
    const password = body?.password;
    const oldPassword = body?.oldPassword;
    const username = user?.username || "";

    if (!username) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

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

    try {
      const existingHash = await getUserPasswordHash(redis, username);

      // If the account already has a password, require the old one to change it.
      // First-time set (no existing hash) is still allowed via session auth alone
      // so users with legacy session-only accounts can set a password once.
      if (existingHash) {
        if (!oldPassword || typeof oldPassword !== "string") {
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: "Current password is required" });
          return;
        }

        const oldValid = await verifyPassword(oldPassword, existingHash);
        if (!oldValid) {
          logger.warn("Password change rejected: bad current password", {
            username,
          });
          logger.response(401, Date.now() - startTime);
          res.status(401).json({ error: "Current password is incorrect" });
          return;
        }
      }

      const passwordHash = await hashPassword(password);
      await setUserPasswordHash(redis, username, passwordHash);

      logger.info("Password set", {
        username,
        wasChange: !!existingHash,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error setting password", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to set password" });
    }
  }
);
