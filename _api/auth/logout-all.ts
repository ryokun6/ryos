/**
 * POST /api/auth/logout-all
 * Logout all sessions (invalidate all tokens for user)
 * Node.js runtime with terminal logging
 */

import { deleteAllUserTokens, validateAuth } from "../_utils/auth/index.js";
import { createApiHandler } from "../_utils/middleware.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default createApiHandler(
  {
    methods: ["POST"],
    action: "auth/logout-all",
    cors: { methods: ["POST", "OPTIONS"] },
  },
  async (ctx): Promise<void> => {
    const { username, token } = ctx.auth.extract();
    const authResult = await validateAuth(ctx.redis, username, token, {
      allowExpired: true,
    });

    if (!username || !token) {
      ctx.response.error("Unauthorized - missing credentials", 401);
      return;
    }

    if (!authResult.valid) {
      ctx.response.error("Unauthorized - invalid token", 401);
      return;
    }

    const deletedCount = await deleteAllUserTokens(
      ctx.redis,
      username.toLowerCase()
    );

    ctx.logger.info("Logged out from all devices", { username, deletedCount });
    ctx.response.ok({
      success: true,
      message: `Logged out from ${deletedCount} devices`,
      deletedCount,
    });
  }
);
