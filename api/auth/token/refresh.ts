/**
 * POST /api/auth/token/refresh
 * 
 * Refresh an existing token
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getEffectiveOriginNode,
  isAllowedOrigin,
  setCorsHeadersNode,
  handlePreflightNode,
  getClientIpNode,
} from "../../_utils/middleware.js";
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

export const runtime = "nodejs";
export const maxDuration = 15;

interface RefreshRequest {
  username: string;
  oldToken: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const origin = getEffectiveOriginNode(req);
  
  // Handle CORS preflight
  if (handlePreflightNode(req, res, ["POST", "OPTIONS"])) {
    return;
  }

  setCorsHeadersNode(res, origin, ["POST", "OPTIONS"]);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const redis = createRedis();

  // Rate limiting: 10/min per IP
  const ip = getClientIpNode(req);
  const rlKey = RateLimit.makeKey(["rl", "auth:refresh", "ip", ip]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: 60,
    limit: 10,
  });

  if (!rlResult.allowed) {
    res.status(429).json({ 
      error: "Too many refresh attempts. Please try again later." 
    });
    return;
  }

  // Parse body
  const body = req.body as RefreshRequest;
  const { username: rawUsername, oldToken } = body || {};

  if (!rawUsername || typeof rawUsername !== "string") {
    res.status(400).json({ error: "Username is required" });
    return;
  }

  if (!oldToken || typeof oldToken !== "string") {
    res.status(400).json({ error: "Old token is required" });
    return;
  }

  const username = rawUsername.toLowerCase();

  // Check if user exists
  const userKey = `${CHAT_USERS_PREFIX}${username}`;
  const userData = await redis.get(userKey);
  if (!userData) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Validate old token (allow expired for grace period refresh)
  const validationResult = await validateAuth(redis, username, oldToken, { allowExpired: true });
  if (!validationResult.valid) {
    res.status(401).json({ error: "Invalid authentication token" });
    return;
  }

  // Store old token for grace period
  await storeLastValidToken(redis, username, oldToken, Date.now(), TOKEN_GRACE_PERIOD);

  // Delete old token
  await deleteToken(redis, oldToken);

  // Generate new token
  const newToken = generateAuthToken();
  await storeToken(redis, username, newToken);

  res.status(201).json({ token: newToken });
}
