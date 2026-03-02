/**
 * POST /api/auth/password/set
 * 
 * Set or update user's password (Node.js runtime for bcrypt)
 */

import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../../_utils/auth/index.js";
import { hashPassword, setUserPasswordHash } from "../../_utils/auth/_password.js";
import { apiHandler } from "../../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface SetPasswordRequest {
  password: string;
}

export default apiHandler<SetPasswordRequest>(
  {
    methods: ["POST"],
    auth: "required",
    allowExpiredAuth: true,
    parseJsonBody: true,
  },
  async ({ res, redis, logger, startTime, user, body }): Promise<void> => {
    const password = body?.password;

    // Validate password
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
      // Hash and store password
      const passwordHash = await hashPassword(password);
      await setUserPasswordHash(redis, user?.username || "", passwordHash);

      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error setting password", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to set password" });
    }
  }
);
