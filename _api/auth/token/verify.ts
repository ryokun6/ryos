/**
 * POST /api/auth/token/verify
 * 
 * Verify if a token is valid
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { initLogger } from "../../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../../_utils/_cors.js";
import { executeAuthTokenVerifyCore } from "../../cores/auth-token-verify-core.js";

export const runtime = "nodejs";

// ============================================================================
// Local Helper Functions
// ============================================================================

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

function extractAuth(req: VercelRequest): { username: string | null; token: string | null } {
  const authHeader = req.headers.authorization as string | undefined;
  const usernameHeader = req.headers["x-username"] as string | undefined;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = usernameHeader?.trim() || null;
  return { username, token };
}

// ============================================================================
// Route Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });
  
  logger.request(req.method || "POST", req.url || "/api/auth/token/verify");
  
  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    logger.warn("Method not allowed", { method: req.method });
    logger.response(405, Date.now() - startTime);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const redis = createRedis();

  // Extract auth from headers
  const { username, token } = extractAuth(req);

  const result = await executeAuthTokenVerifyCore({
    originAllowed: isAllowedOrigin(origin),
    username,
    token,
    redis,
  });

  if (result.status === 200) {
    logger.info("Token verification completed", { username: username?.toLowerCase() });
  } else {
    logger.warn("Token verification failed", { username, status: result.status });
  }
  logger.response(result.status, Date.now() - startTime);
  return res.status(result.status).json(result.body);
}
