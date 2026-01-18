/**
 * GET /api/auth/tokens
 * 
 * List all active tokens for the authenticated user
 */

import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  extractAuth,
  errorResponse,
  jsonResponse,
} from "../_utils/middleware.js";
import { getUserTokens, validateAuth } from "../_utils/auth/index.js";


export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "OPTIONS"], origin);
    if (preflight) return preflight;
    return new Response(null, { status: 204 });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { 
      status: 405, 
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;

  const redis = createRedis();

  // Extract and validate auth
  const { username, token: currentToken } = extractAuth(req);
  if (!username || !currentToken) {
    return new Response(JSON.stringify({ error: "Unauthorized - missing credentials" }), { status: 401, headers });
  }

  const authResult = await validateAuth(redis, username, currentToken, { allowExpired: true });
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: "Unauthorized - invalid token" }), { status: 401, headers });
  }

  // Get all tokens for user
  const tokens = await getUserTokens(redis, username.toLowerCase());

  // Format token list (mask tokens except last 8 chars)
  const tokenList = tokens.map((t) => ({
    maskedToken: `...${t.token.slice(-8)}`,
    createdAt: t.createdAt,
    isCurrent: t.token === currentToken,
  }));

  return new Response(JSON.stringify({ 
    tokens: tokenList,
    count: tokenList.length,
  }), { status: 200, headers });
}
