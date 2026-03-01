/**
 * GET /api/auth/tokens
 * List all active tokens for the authenticated user
 * Node.js runtime with terminal logging
 */

import { getUserTokens } from "../_utils/auth/index.js";
import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
    allowExpiredAuth: true,
  },
  async ({ res, redis, logger, startTime, user }): Promise<void> => {
    const username = user?.username || "";
    const currentToken = user?.token || "";

    const tokens = await getUserTokens(redis, username);
    const tokenList = tokens.map((t) => ({
      maskedToken: `...${t.token.slice(-8)}`,
      createdAt: t.createdAt,
      isCurrent: t.token === currentToken,
    }));

    logger.info("Listed tokens", { username, count: tokenList.length });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ tokens: tokenList, count: tokenList.length });
  }
);
