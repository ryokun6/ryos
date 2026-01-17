/**
 * POST /api/auth/login
 * 
 * Authenticate user with password
 */

import { Redis } from "@upstash/redis";
import {
  generateAuthToken,
  storeToken,
  deleteToken,
  verifyPassword,
  getUserPasswordHash,
  storeLastValidToken,
  CHAT_USERS_PREFIX,
  TOKEN_GRACE_PERIOD,
} from "../_utils/auth/index.js";
import { getEffectiveOrigin, isAllowedOrigin, preflightIfNeeded } from "../_utils/_cors.js";
import * as RateLimit from "../_utils/_rate-limit.js";

export const edge = true;
export const config = {
  runtime: "edge",
};

interface LoginRequest {
  username: string;
  password: string;
  oldToken?: string;
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
  const rlKey = RateLimit.makeKey(["rl", "auth:login", "ip", ip]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: 60,
    limit: 10,
  });

  if (!rlResult.allowed) {
    return new Response(JSON.stringify({ 
      error: "Too many login attempts. Please try again later." 
    }), { status: 429, headers });
  }

  // Parse body
  let body: LoginRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const { username: rawUsername, password, oldToken } = body;

  if (!rawUsername || typeof rawUsername !== "string") {
    return new Response(JSON.stringify({ error: "Username is required" }), { status: 400, headers });
  }

  if (!password || typeof password !== "string") {
    return new Response(JSON.stringify({ error: "Password is required" }), { status: 400, headers });
  }

  const username = rawUsername.toLowerCase();
  const userKey = `${CHAT_USERS_PREFIX}${username}`;

  // Check if user exists
  const userData = await redis.get(userKey);
  if (!userData) {
    return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401, headers });
  }

  // Get and verify password
  const passwordHash = await getUserPasswordHash(redis, username);
  if (!passwordHash) {
    return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401, headers });
  }

  const passwordValid = await verifyPassword(password, passwordHash);
  if (!passwordValid) {
    return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401, headers });
  }

  try {
    // Handle old token if provided (rotation)
    if (oldToken) {
      await storeLastValidToken(redis, username, oldToken, Date.now(), TOKEN_GRACE_PERIOD);
      await deleteToken(redis, oldToken);
    }

    // Generate new token
    const token = generateAuthToken();
    await storeToken(redis, username, token);

    return new Response(JSON.stringify({ 
      token,
      username,
    }), { status: 200, headers });
  } catch (error) {
    console.error("Error during login:", error);
    return new Response(JSON.stringify({ error: "Login failed" }), { status: 500, headers });
  }
}
