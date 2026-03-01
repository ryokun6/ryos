/**
 * GET /api/auth/password/check
 *
 * Check if user has a password set
 */

import { userHasPassword } from "../../_utils/auth/index.js";
import { createApiHandler } from "../../_utils/handler.js";

export const runtime = "nodejs";

export default createApiHandler(
  {
    operation: "password-check",
    methods: ["GET"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const user = await ctx.requireAuth({ allowExpired: true });
    if (!user) {
      return;
    }

    const hasPassword = await userHasPassword(ctx.redis, user.username);
    ctx.logger.info("Password check completed", {
      username: user.username,
      hasPassword,
    });
    ctx.response.ok({
      hasPassword,
      username: user.username,
    });
  }
);
