/**
 * POST /api/auth/logout-all
 *
 * Logout all sessions (invalidate all tokens for user)
 */

import { deleteAllUserTokens } from "../_utils/auth/index.js";
import { createApiHandler } from "../_utils/handler.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default createApiHandler(
  {
    operation: "auth-logout-all",
    methods: ["POST"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const user = await ctx.requireAuth({ allowExpired: true });
    if (!user) {
      return;
    }

    const deletedCount = await deleteAllUserTokens(ctx.redis, user.username);
    ctx.logger.info("Logged out from all devices", {
      username: user.username,
      deletedCount,
    });
    ctx.response.ok({
      success: true,
      message: `Logged out from ${deletedCount} devices`,
      deletedCount,
    });
  }
);
