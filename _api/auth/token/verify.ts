/**
 * POST /api/auth/token/verify
 * 
 * Verify if a token is valid
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { validateAuth } from "../../_utils/auth/index.js";
import { isProfaneUsername } from "../../_utils/_validation.js";
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

  if (!isAllowedOrigin(origin)) {
    logger.warn("Unauthorized origin", { origin });
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Unauthorized" });
  }

  const redis = createRedis();

  // Extract auth from headers
  const { username, token } = extractAuth(req);

  if (!token) {
    logger.warn("Missing authorization token");
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Authorization token required" });
  }

  if (!username) {
    logger.warn("Missing X-Username header");
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "X-Username header required" });
  }

  // Check profanity
  if (isProfaneUsername(username)) {
    logger.warn("Profane username detected", { username });
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Invalid authentication token" });
  }

  // Validate token (allow expired for grace period info)
  const result = await validateAuth(redis, username, token, { allowExpired: true });

  if (!result.valid) {
    logger.warn("Invalid authentication token", { username });
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Invalid authentication token" });
  }

  if (result.expired) {
    logger.info("Token within grace period", { username: username.toLowerCase() });
    logger.response(200, Date.now() - startTime);
    return res.status(200).json({ 
      valid: true,
      username: username.toLowerCase(),
      expired: true,
      message: "Token is within grace period",
    });
  }

  logger.info("Token verified successfully", { username: username.toLowerCase() });
  logger.response(200, Date.now() - startTime);
  
  return res.status(200).json({ 
    valid: true,
    username: username.toLowerCase(),
    message: "Token is valid",
  });
}
