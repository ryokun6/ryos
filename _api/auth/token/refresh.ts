/**
 * POST /api/auth/token/refresh
 * 
 * Refresh an existing token
 */

import {
  generateAuthToken,
  storeToken,
  deleteToken,
  storeLastValidToken,
  validateAuth,
  CHAT_USERS_PREFIX,
  TOKEN_GRACE_PERIOD,
} from "../../_utils/auth/index.js";
import { createApiHandler } from "../../_utils/middleware.js";

export const runtime = "nodejs";

interface RefreshRequest {
  username: string;
  oldToken: string;
}

export default createApiHandler(
  {
    methods: ["POST"],
    action: "auth/token/refresh",
    cors: { methods: ["POST", "OPTIONS"] },
  },
  async (ctx): Promise<void> => {
    // Rate limiting: 10/min per IP
    const rlResult = await ctx.rateLimit.check({
      keyParts: ["rl", "auth:refresh", "ip", ctx.ip],
      windowSeconds: 60,
      limit: 10,
    });
    if (!rlResult.allowed) {
      ctx.response.json(
        { error: "Too many refresh attempts. Please try again later." },
        429
      );
      return;
    }

    const body = ctx.req.body as RefreshRequest | undefined;
    const rawUsername = body?.username;
    const oldToken = body?.oldToken;

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

    const username = rawUsername.toLowerCase();
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const userData = await ctx.redis.get(userKey);
    if (!userData) {
      ctx.logger.warn("User not found", { username });
      ctx.response.json({ error: "User not found" }, 404);
      return;
    }

    const validationResult = await validateAuth(ctx.redis, username, oldToken, {
      allowExpired: true,
    });
    if (!validationResult.valid) {
      ctx.logger.warn("Invalid authentication token", { username });
      ctx.response.error("Invalid authentication token", 401);
      return;
    }

    await storeLastValidToken(
      ctx.redis,
      username,
      oldToken,
      Date.now(),
      TOKEN_GRACE_PERIOD
    );
    await deleteToken(ctx.redis, oldToken);

    const newToken = generateAuthToken();
    await storeToken(ctx.redis, username, newToken);

    ctx.logger.info("Token refreshed successfully", { username });
    ctx.response.json({ token: newToken }, 201);
  }
);
