/**
 * GET /api/auth/password/check
 * 
 * Check if user has a password set
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { userHasPassword, validateAuth } from "../../_utils/auth/index.js";
import { initLogger } from "../../_utils/_logging.js";

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

function getEffectiveOrigin(req: VercelRequest): string | null {
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  if (origin) return origin;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  const ALLOWED_ORIGINS = [
    "https://os.ryo.lu",
    "https://ryo.lu",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
  ];
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return true;
  return false;
}

function setCorsHeaders(res: VercelResponse, origin: string | null): void {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Username");
  res.setHeader("Access-Control-Max-Age", "86400");
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
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin);
  
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
