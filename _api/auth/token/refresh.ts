/**
 * POST /api/auth/token/refresh
 *
 * Refresh an existing token
 */

import {
  CHAT_USERS_PREFIX,
  TOKEN_GRACE_PERIOD,
  deleteToken,
  generateAuthToken,
  storeLastValidToken,
  storeToken,
} from "../../_utils/auth/index.js";
import { createApiHandler } from "../../_utils/handler.js";
import { RATE_LIMITS } from "../../_utils/middleware.js";

export const runtime = "nodejs";

interface RefreshRequest {
  username: string;
  oldToken: string;
}

export default createApiHandler(
  {
    operation: "token-refresh",
    methods: ["POST"],
  },
  async (_req, _res, ctx): Promise<void> => {
    if (
      !(await ctx.applyRateLimit({
        ...RATE_LIMITS.burst("auth:refresh"),
        message: "Too many refresh attempts. Please try again later.",
      }))
    ) {
      return;
    }

    const { data: body, error } = ctx.parseJsonBody<RefreshRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const { username: rawUsername, oldToken } = body;
    if (!rawUsername || typeof rawUsername !== "string") {
      ctx.logger.warn("Missing username");
      ctx.response.badRequest("Username is required");
      return;
    }

    if (!oldToken || typeof oldToken !== "string") {
      ctx.logger.warn("Missing old token");
      ctx.response.badRequest("Old token is required");
      return;
    }

    const user = await ctx.validateCredentials(rawUsername, oldToken, {
      allowExpired: true,
    });
    const username = rawUsername.toLowerCase();

    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const userData = await ctx.redis.get(userKey);
    if (!userData) {
      ctx.logger.warn("User not found", { username });
      ctx.response.notFound("User not found");
      return;
    }

    if (!user) {
      ctx.logger.warn("Invalid authentication token", { username });
      ctx.response.unauthorized("Invalid authentication token");
      return;
    }

    await storeLastValidToken(
      ctx.redis,
      user.username,
      oldToken,
      Date.now(),
      TOKEN_GRACE_PERIOD
    );
    await deleteToken(ctx.redis, oldToken);

    const newToken = generateAuthToken();
    await storeToken(ctx.redis, user.username, newToken);

    ctx.logger.info("Token refreshed successfully", { username: user.username });
    ctx.response.created({ token: newToken });
  }
);
