/**
 * POST /api/auth/register
 * 
 * Create a new user account with password (Node.js runtime for bcrypt)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import {
  generateAuthToken,
  storeToken,
  CHAT_USERS_PREFIX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../_utils/auth/index.js";
import { hashPassword, setUserPasswordHash, verifyPassword, getUserPasswordHash } from "../_utils/auth/_password.js";
import { isProfaneUsername, assertValidUsername } from "../_utils/_validation.js";
import { setCorsHeaders } from "../_utils/_cors.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface RegisterRequest {
  username: string;
  password: string;
}

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return req.headers["x-real-ip"] as string || "unknown";
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const origin = req.headers.origin as string | undefined;
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });

  // Rate limiting: 5/min per IP with 24h block on exceed
  const ip = getClientIp(req);
  const blockKey = `rl:block:register:ip:${ip}`;
  const blocked = await redis.get(blockKey);
  if (blocked) {
    res.status(429).json({ error: "Too many registration attempts. Please try again later." });
    return;
  }

  const rlKey = `rl:auth:register:ip:${ip}`;
  const current = await redis.incr(rlKey);
  if (current === 1) {
    await redis.expire(rlKey, 60);
  }
  if (current > 5) {
    await redis.set(blockKey, "1", { ex: 86400 });
    res.status(429).json({ error: "Too many registration attempts. Please try again later." });
    return;
  }

  // Parse body
  const body = req.body as RegisterRequest;
  const { username: rawUsername, password } = body || {};

  // Validate username
  if (!rawUsername || typeof rawUsername !== "string") {
    res.status(400).json({ error: "Username is required" });
    return;
  }

  try {
    assertValidUsername(rawUsername, "register");
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid username" });
    return;
  }

  if (isProfaneUsername(rawUsername)) {
    res.status(400).json({ error: "Username contains inappropriate language" });
    return;
  }

  // Validate password
  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "Password is required" });
    return;
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });
    return;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    res.status(400).json({ error: `Password must be ${PASSWORD_MAX_LENGTH} characters or less` });
    return;
  }

  const username = rawUsername.toLowerCase();
  const userKey = `${CHAT_USERS_PREFIX}${username}`;

  // Check if user already exists
  const existingUser = await redis.get(userKey);
  if (existingUser) {
    // User exists - try to log them in with provided password
    try {
      const storedHash = await getUserPasswordHash(redis, username);
      if (storedHash) {
        const passwordValid = await verifyPassword(password, storedHash);
        if (passwordValid) {
          // Password matches - log them in
          const token = generateAuthToken();
          await storeToken(redis, username, token);
          res.status(200).json({ token, user: { username } });
          return;
        }
      }
    } catch (loginError) {
      console.error("Error attempting login for existing user:", loginError);
    }
    // Password doesn't match or no password set
    res.status(409).json({ error: "Username already taken" });
    return;
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

    res.status(201).json({ token, user: { username } });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
}
