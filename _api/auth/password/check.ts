/**
 * GET /api/auth/password/check
 * 
 * Check if user has a password set
 */

import { userHasPassword } from "../../_utils/auth/index.js";
import { apiHandler } from "../../_utils/api-handler.js";

export const runtime = "nodejs";

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
    allowExpiredAuth: true,
  },
  async ({ res, redis, logger, startTime, user }) => {
    const username = user?.username || "";
    const hasPassword = await userHasPassword(redis, username);

    logger.info("Password check completed", { username, hasPassword });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      hasPassword,
      username,
    });
  }
);
