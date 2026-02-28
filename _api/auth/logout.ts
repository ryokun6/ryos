/**
 * POST /api/auth/logout
 *
 * Logout current session (invalidate current token)
 */

import { deleteToken } from "../_utils/auth/index.js";
import { createApiHandler } from "../_utils/handler.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default createApiHandler(
  {
    operation: "auth-logout",
    methods: ["POST"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const user = await ctx.requireAuth({ allowExpired: true });
    if (!user) {
      return;
    }

    await deleteToken(ctx.redis, user.token);
    ctx.logger.info("User logged out", { username: user.username });
    ctx.response.ok({ success: true, message: "Logged out successfully" });
  }
);
