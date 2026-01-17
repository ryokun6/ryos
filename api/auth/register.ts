/**
 * POST /api/auth/register
 * 
 * Create a new user account with password
 */

import { Redis } from "@upstash/redis";
import {
  generateAuthToken,
  storeToken,
  hashPassword,
  setUserPasswordHash,
  CHAT_USERS_PREFIX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../_utils/auth/index.js";
import { getEffectiveOrigin, isAllowedOrigin, preflightIfNeeded } from "../_utils/_cors.js";
import { isProfaneUsername, assertValidUsername } from "../_utils/_validation.js";
import * as RateLimit from "../_utils/_rate-limit.js";

export const edge = true;
export const config = {
  runtime: "edge",
};

interface RegisterRequest {
  username: string;
  password: string;
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

  // Rate limiting: 5/min per IP
  const ip = RateLimit.getClientIp(req);
  const blockKey = `rl:block:createUser:ip:${ip}`;
  const blocked = await redis.get(blockKey);
  if (blocked) {
    return new Response(JSON.stringify({ 
      error: "Too many registration attempts. Please try again later." 
    }), { status: 429, headers });
  }

  const rlKey = RateLimit.makeKey(["rl", "auth:register", "ip", ip]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: 60,
    limit: 5,
  });

  if (!rlResult.allowed) {
    await redis.set(blockKey, "1", { ex: 86400 });
    return new Response(JSON.stringify({ 
      error: "Too many registration attempts. Please try again later." 
    }), { status: 429, headers });
  }

  // Parse body
  let body: RegisterRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const { username: rawUsername, password } = body;

  // Validate username
  if (!rawUsername || typeof rawUsername !== "string") {
    return new Response(JSON.stringify({ error: "Username is required" }), { status: 400, headers });
  }

  try {
    assertValidUsername(rawUsername, "register");
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid username" }), { status: 400, headers });
  }

  if (isProfaneUsername(rawUsername)) {
    return new Response(JSON.stringify({ error: "Username contains inappropriate language" }), { status: 400, headers });
  }

  // Validate password
  if (!password || typeof password !== "string") {
    return new Response(JSON.stringify({ error: "Password is required" }), { status: 400, headers });
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return new Response(JSON.stringify({ 
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` 
    }), { status: 400, headers });
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return new Response(JSON.stringify({ 
      error: `Password must be ${PASSWORD_MAX_LENGTH} characters or less` 
    }), { status: 400, headers });
  }

  const username = rawUsername.toLowerCase();
  const userKey = `${CHAT_USERS_PREFIX}${username}`;

  // Check if user already exists
  const existingUser = await redis.get(userKey);
  if (existingUser) {
    return new Response(JSON.stringify({ error: "Username already taken" }), { status: 409, headers });
  }

  try {
    // Create user
    const userData = {
      username,
      createdAt: Date.now(),
      lastActive: Date.now(),
    };
    await redis.set(userKey, JSON.stringify(userData));

    // Hash and store password
    const passwordHash = await hashPassword(password);
    await setUserPasswordHash(redis, username, passwordHash);

    // Generate and store token
    const token = generateAuthToken();
    await storeToken(redis, username, token);

    return new Response(JSON.stringify({ 
      token,
      user: { username },
    }), { status: 201, headers });
  } catch (error) {
    console.error("Error creating user:", error);
    return new Response(JSON.stringify({ error: "Failed to create user" }), { status: 500, headers });
  }
}
