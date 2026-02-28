/**
 * POST /api/auth/logout
 * 
 * Logout current session (invalidate current token)
 * Node.js runtime with terminal logging
 */

import { deleteToken, validateAuth } from "../_utils/auth/index.js";
import { createApiHandler } from "../_utils/middleware.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default createApiHandler(
  {
    methods: ["POST"],
    action: "auth/logout",
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

    await deleteToken(ctx.redis, token);

    ctx.logger.info("User logged out", { username });
    ctx.response.ok({ success: true, message: "Logged out successfully" });
  }
);
