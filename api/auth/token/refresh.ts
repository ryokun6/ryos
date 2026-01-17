/**
 * POST /api/auth/token/refresh
 * 
 * Refresh an existing token
 */

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
import { getEffectiveOrigin, isAllowedOrigin, preflightIfNeeded } from "../../_utils/_cors.js";
import * as RateLimit from "../../_utils/_rate-limit.js";

export const config = {
  runtime: "edge",
};

interface RefreshRequest {
  username: string;
  oldToken: string;
}

export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["POST", "OPTIONS"], origin);
    if (preflight) return preflight;
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
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

  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });

  // Rate limiting: 10/min per IP
  const ip = RateLimit.getClientIp(req);
  const rlKey = RateLimit.makeKey(["rl", "auth:refresh", "ip", ip]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: 60,
    limit: 10,
  });

  if (!rlResult.allowed) {
    return new Response(JSON.stringify({ 
      error: "Too many refresh attempts. Please try again later." 
    }), { status: 429, headers });
  }

  // Parse body
  let body: RefreshRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const { username: rawUsername, oldToken } = body;

  if (!rawUsername || typeof rawUsername !== "string") {
    return new Response(JSON.stringify({ error: "Username is required" }), { status: 400, headers });
  }

  if (!oldToken || typeof oldToken !== "string") {
    return new Response(JSON.stringify({ error: "Old token is required" }), { status: 400, headers });
  }

  const username = rawUsername.toLowerCase();

  // Check if user exists
  const userKey = `${CHAT_USERS_PREFIX}${username}`;
  const userData = await redis.get(userKey);
  if (!userData) {
    return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers });
  }

  // Validate old token (allow expired for grace period refresh)
  const validationResult = await validateAuth(redis, username, oldToken, { allowExpired: true });
  if (!validationResult.valid) {
    return new Response(JSON.stringify({ error: "Invalid authentication token" }), { status: 401, headers });
  }

  // Store old token for grace period
  await storeLastValidToken(redis, username, oldToken, Date.now(), TOKEN_GRACE_PERIOD);

  // Delete old token
  await deleteToken(redis, oldToken);

  // Generate new token
  const newToken = generateAuthToken();
  await storeToken(redis, username, newToken);

  return new Response(JSON.stringify({ token: newToken }), { status: 201, headers });
}
