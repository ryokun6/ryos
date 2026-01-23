/**
 * GET /api/auth/tokens
 * 
 * List all active tokens for the authenticated user
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getEffectiveOriginNode,
  isAllowedOrigin,
  setCorsHeadersNode,
  handlePreflightNode,
} from "../_utils/middleware.js";
import { getUserTokens, validateAuth } from "../_utils/auth/index.js";

export const runtime = "nodejs";
export const maxDuration = 15;

function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const origin = getEffectiveOriginNode(req);
  
  // Handle CORS preflight
  if (handlePreflightNode(req, res, ["GET", "OPTIONS"])) {
    return;
  }

  setCorsHeadersNode(res, origin, ["GET", "OPTIONS"]);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const redis = createRedis();

  // Extract and validate auth
  const authHeader = getHeader(req, "authorization");
  const currentToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = getHeader(req, "x-username");

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
