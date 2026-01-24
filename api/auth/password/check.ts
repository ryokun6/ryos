/**
 * GET /api/auth/password/check
 * 
 * Check if user has a password set
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { userHasPassword, validateAuth } from "../../_utils/auth/index.js";
import { initLogger } from "../../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../../_utils/_cors.js";

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
  const username = usernameHeader?.trim().toLowerCase() || null;
  return { username, token };
}

// ============================================================================
// Route Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"] });
  
  logger.request(req.method || "GET", req.url || "/api/auth/password/check");
  
  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    logger.warn("Method not allowed", { method: req.method });
    logger.response(405, Date.now() - startTime);
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAllowedOrigin(origin)) {
    logger.warn("Unauthorized origin", { origin });
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Unauthorized" });
  }

  const redis = createRedis();

  // Extract and validate auth
  const { username, token } = extractAuth(req);
  if (!username || !token) {
    logger.warn("Missing credentials");
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Unauthorized - missing credentials" });
  }

  const authResult = await validateAuth(redis, username, token, { allowExpired: true });
  if (!authResult.valid) {
    logger.warn("Invalid token", { username });
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Unauthorized - invalid token" });
  }

  // Check if password is set
  const hasPassword = await userHasPassword(redis, username.toLowerCase());

  logger.info("Password check completed", { username: username.toLowerCase(), hasPassword });
  logger.response(200, Date.now() - startTime);
  
  return res.status(200).json({ 
    hasPassword,
    username: username.toLowerCase(),
  });
}
