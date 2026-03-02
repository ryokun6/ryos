/**
 * POST /api/auth/logout-all
 * Logout all sessions (invalidate all tokens for user)
 * Node.js runtime with terminal logging
 */

import { deleteAllUserTokens } from "../_utils/auth/index.js";
import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    allowExpiredAuth: true,
  },
  async ({ res, redis, logger, startTime, user }): Promise<void> => {
    const username = user?.username || "";
    const deletedCount = await deleteAllUserTokens(redis, username);

    logger.info("Logged out from all devices", { username, deletedCount });
    logger.response(200, Date.now() - startTime);
    res
      .status(200)
      .json({ success: true, message: `Logged out from ${deletedCount} devices`, deletedCount });
  }
);
