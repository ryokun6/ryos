/**
 * GET /api/auth/tokens
 *
 * List all active tokens for the authenticated user
 */

import { getUserTokens } from "../_utils/auth/index.js";
import { createApiHandler } from "../_utils/handler.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default createApiHandler(
  {
    operation: "auth-tokens",
    methods: ["GET"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const user = await ctx.requireAuth({ allowExpired: true });
    if (!user) {
      return;
    }

    const tokens = await getUserTokens(ctx.redis, user.username);
    const tokenList = tokens.map((tokenInfo) => ({
      maskedToken: `...${tokenInfo.token.slice(-8)}`,
      createdAt: tokenInfo.createdAt,
      isCurrent: tokenInfo.token === user.token,
    }));

    ctx.logger.info("Listed tokens", {
      username: user.username,
      count: tokenList.length,
    });
    ctx.response.ok({ tokens: tokenList, count: tokenList.length });
  }
);
