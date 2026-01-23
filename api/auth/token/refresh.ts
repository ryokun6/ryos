/**
 * POST /api/auth/token/refresh
 * 
 * Refresh an existing token
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import {
  generateAuthToken,
  storeToken,
  deleteToken,
  storeLastValidToken,
  validateAuth,
  CHAT_USERS_PREFIX,
  TOKEN_GRACE_PERIOD,
} from "../../_utils/auth/index.js";
import * as RateLimit from "../../_utils/_rate-limit.js";
import { initLogger } from "../../_utils/_logging.js";

export const runtime = "nodejs";

interface RefreshRequest {
  username: string;
  oldToken: string;
}

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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Username");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string") {
    return realIp;
  }
  return "unknown";
}

// ============================================================================
// Route Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin);
  
  logger.request(req.method || "POST", req.url || "/api/auth/token/refresh");
  
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

  // Rate limiting: 10/min per IP
  const ip = getClientIp(req);
  const rlKey = RateLimit.makeKey(["rl", "auth:refresh", "ip", ip]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: 60,
    limit: 10,
  });

  if (!rlResult.allowed) {
    logger.warn("Rate limit exceeded", { ip });
    logger.response(429, Date.now() - startTime);
    return res.status(429).json({ 
      error: "Too many refresh attempts. Please try again later." 
    });
  }

  // Parse body
  const body = req.body as RefreshRequest | undefined;

  const rawUsername = body?.username;
  const oldToken = body?.oldToken;

  if (!rawUsername || typeof rawUsername !== "string") {
    logger.warn("Missing username");
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Username is required" });
  }

  if (!oldToken || typeof oldToken !== "string") {
    logger.warn("Missing old token");
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Old token is required" });
  }

  const username = rawUsername.toLowerCase();

  // Check if user exists
  const userKey = `${CHAT_USERS_PREFIX}${username}`;
  const userData = await redis.get(userKey);
  if (!userData) {
    logger.warn("User not found", { username });
    logger.response(404, Date.now() - startTime);
    return res.status(404).json({ error: "User not found" });
  }

  // Validate old token (allow expired for grace period refresh)
  const validationResult = await validateAuth(redis, username, oldToken, { allowExpired: true });
  if (!validationResult.valid) {
    logger.warn("Invalid authentication token", { username });
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Invalid authentication token" });
  }

  // Store old token for grace period
  await storeLastValidToken(redis, username, oldToken, Date.now(), TOKEN_GRACE_PERIOD);

  // Delete old token
  await deleteToken(redis, oldToken);

  // Generate new token
  const newToken = generateAuthToken();
  await storeToken(redis, username, newToken);

  logger.info("Token refreshed successfully", { username });
  logger.response(201, Date.now() - startTime);
  
  return res.status(201).json({ token: newToken });
}
