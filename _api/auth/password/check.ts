/**
 * GET /api/auth/password/check
 * 
 * Check if user has a password set
 */

import { userHasPassword, validateAuth } from "../../_utils/auth/index.js";
import { createApiHandler } from "../../_utils/middleware.js";

export const runtime = "nodejs";

export default createApiHandler(
  {
    methods: ["GET"],
    action: "auth/password/check",
    cors: { methods: ["GET", "OPTIONS"] },
  },
  async (ctx): Promise<void> => {
    const { username, token } = ctx.auth.extract();
    const authResult = await validateAuth(ctx.redis, username, token, {
      allowExpired: true,
    });

    if (!username || !token) {
      ctx.logger.warn("Missing credentials");
      ctx.response.error("Unauthorized - missing credentials", 401);
      return;
    }

    if (!authResult.valid) {
      ctx.logger.warn("Invalid token", { username });
      ctx.response.error("Unauthorized - invalid token", 401);
      return;
    }

    const normalizedUsername = username.toLowerCase();
    const hasPassword = await userHasPassword(ctx.redis, normalizedUsername);

    ctx.logger.info("Password check completed", {
      username: normalizedUsername,
      hasPassword,
    });
    ctx.response.ok({
      hasPassword,
      username: normalizedUsername,
    });
  }
);
