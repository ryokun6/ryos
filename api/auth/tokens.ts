/**
 * GET /api/auth/tokens
 * 
 * List all active tokens for the authenticated user
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getOriginFromVercel,
  isOriginAllowed,
  handlePreflight,
  setCorsHeaders,
} from "../_utils/middleware.js";
import { getUserTokens, validateAuth } from "../_utils/auth/index.js";


export const config = {
  runtime: "nodejs",
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = getOriginFromVercel(req);
  
  if (handlePreflight(req, res, ["GET", "OPTIONS"])) {
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isOriginAllowed(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  setCorsHeaders(res, origin, ["GET", "OPTIONS"]);

  const redis = createRedis();

  // Extract auth from headers
  const authHeader = req.headers.authorization as string | undefined;
  const currentToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = req.headers["x-username"] as string | undefined || null;

  if (!username || !currentToken) {
    res.status(401).json({ error: "Unauthorized - missing credentials" });
    return;
  }

  const authResult = await validateAuth(redis, username, currentToken, { allowExpired: true });
  if (!authResult.valid) {
    res.status(401).json({ error: "Unauthorized - invalid token" });
    return;
  }

  // Get all tokens for user
  const tokens = await getUserTokens(redis, username.toLowerCase());

  // Format token list (mask tokens except last 8 chars)
  const tokenList = tokens.map((t) => ({
    maskedToken: `...${t.token.slice(-8)}`,
    createdAt: t.createdAt,
    isCurrent: t.token === currentToken,
  }));

  res.status(200).json({ 
    tokens: tokenList,
    count: tokenList.length,
  });
}
