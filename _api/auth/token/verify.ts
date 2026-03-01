/**
 * POST /api/auth/token/verify
 * 
 * Verify if a token is valid
 */

import { validateAuth } from "../../_utils/auth/index.js";
import { isProfaneUsername } from "../../_utils/_validation.js";
import { createApiHandler } from "../../_utils/middleware.js";

export const runtime = "nodejs";

export default createApiHandler(
  {
    methods: ["POST"],
    action: "auth/token/verify",
    cors: { methods: ["POST", "OPTIONS"] },
  },
  async (ctx): Promise<void> => {
    const { username, token } = ctx.auth.extract();

    if (!token) {
      ctx.logger.warn("Missing authorization token");
      ctx.response.error("Authorization token required", 401);
      return;
    }

    if (!username) {
      ctx.logger.warn("Missing X-Username header");
      ctx.response.error("X-Username header required", 400);
      return;
    }

    if (isProfaneUsername(username)) {
      ctx.logger.warn("Profane username detected", { username });
      ctx.response.error("Invalid authentication token", 401);
      return;
    }

    const result = await validateAuth(ctx.redis, username, token, {
      allowExpired: true,
    });
    if (!result.valid) {
      ctx.logger.warn("Invalid authentication token", { username });
      ctx.response.error("Invalid authentication token", 401);
      return;
    }

    if (result.expired) {
      ctx.logger.info("Token within grace period", {
        username: username.toLowerCase(),
      });
      ctx.response.ok({
        valid: true,
        username: username.toLowerCase(),
        expired: true,
        message: "Token is within grace period",
      });
      return;
    }

    ctx.logger.info("Token verified successfully", {
      username: username.toLowerCase(),
    });
    ctx.response.ok({
      valid: true,
      username: username.toLowerCase(),
      message: "Token is valid",
    });
  }
);
