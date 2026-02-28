/**
 * POST /api/auth/token/verify
 *
 * Verify if a token is valid
 */

import { createApiHandler } from "../../_utils/handler.js";
import { isProfaneUsername } from "../../_utils/_validation.js";

export const runtime = "nodejs";

export default createApiHandler(
  {
    operation: "token-verify",
    methods: ["POST"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const { username, token } = ctx.auth;

    if (!token) {
      ctx.logger.warn("Missing authorization token");
      ctx.response.unauthorized("Authorization token required");
      return;
    }

    if (!username) {
      ctx.logger.warn("Missing X-Username header");
      ctx.response.badRequest("X-Username header required");
      return;
    }

    if (isProfaneUsername(username)) {
      ctx.logger.warn("Profane username detected", { username });
      ctx.response.unauthorized("Invalid authentication token");
      return;
    }

    const user = await ctx.authenticate({ allowExpired: true });
    if (!user) {
      ctx.logger.warn("Invalid authentication token", { username });
      ctx.response.unauthorized("Invalid authentication token");
      return;
    }

    if (user.expired) {
      ctx.logger.info("Token within grace period", { username: user.username });
      ctx.response.ok({
        valid: true,
        username: user.username,
        expired: true,
        message: "Token is within grace period",
      });
      return;
    }

    ctx.logger.info("Token verified successfully", { username: user.username });
    ctx.response.ok({
      valid: true,
      username: user.username,
      message: "Token is valid",
    });
  }
);
