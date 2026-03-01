/**
 * GET /api/auth/tokens
 * List all active tokens for the authenticated user
 * Node.js runtime with terminal logging
 */

import { getUserTokens, validateAuth } from "../_utils/auth/index.js";
import { createApiHandler } from "../_utils/middleware.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default createApiHandler(
  {
    methods: ["GET"],
    action: "auth/tokens",
    cors: { methods: ["GET", "OPTIONS"] },
  },
  async (ctx): Promise<void> => {
    const { username, token: currentToken } = ctx.auth.extract();
    const authResult = await validateAuth(ctx.redis, username, currentToken, {
      allowExpired: true,
    });

    if (!username || !currentToken) {
      ctx.response.error("Unauthorized - missing credentials", 401);
      return;
    }

    if (!authResult.valid) {
      ctx.response.error("Unauthorized - invalid token", 401);
      return;
    }

    const tokens = await getUserTokens(ctx.redis, username.toLowerCase());
    const tokenList = tokens.map((tokenInfo) => ({
      maskedToken: `...${tokenInfo.token.slice(-8)}`,
      createdAt: tokenInfo.createdAt,
      isCurrent: tokenInfo.token === currentToken,
    }));

    ctx.logger.info("Listed tokens", { username, count: tokenList.length });
    ctx.response.ok({ tokens: tokenList, count: tokenList.length });
  }
);
