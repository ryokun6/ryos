/**
 * GET /api/auth/tokens
 * 
 * List all active tokens for the authenticated user
 */

import { Redis } from "@upstash/redis";
import { getUserTokens, extractAuth } from "../_utils/auth/index.js";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  requireAuth,
} from "../_utils/middleware.js";

export const runtime = "edge";
export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  // Handle CORS
  const cors = handleCors(request, ["GET", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });

  // Require authentication
  const auth = await requireAuth(request, redis, cors.origin);
  if (auth.error) return auth.error;

  // Get all tokens for user
  const tokens = await getUserTokens(redis, auth.user!.username);
  const { token: currentToken } = extractAuth(request);

  // Format token list (mask tokens except last 8 chars)
  const tokenList = tokens.map((t) => ({
    maskedToken: `...${t.token.slice(-8)}`,
    createdAt: t.createdAt,
    isCurrent: t.token === currentToken,
  }));

  return jsonResponse(
    {
      tokens: tokenList,
      count: tokenList.length,
    },
    200,
    cors.origin
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
