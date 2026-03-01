/**
 * POST /api/auth/logout
 * 
 * Logout current session (invalidate current token)
 * Node.js runtime with terminal logging
 */

import { deleteToken } from "../_utils/auth/index.js";
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
    const token = user?.token || "";

    await deleteToken(redis, token);

    logger.info("User logged out", { username });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true, message: "Logged out successfully" });
  }
);
