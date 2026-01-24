/**
 * POST /api/auth/password/set
 * 
 * Set or update user's password (Node.js runtime for bcrypt)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import {
  validateAuth,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../../_utils/auth/index.js";
import { hashPassword, setUserPasswordHash } from "../../_utils/auth/_password.js";
import { setCorsHeaders } from "../../_utils/_cors.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface SetPasswordRequest {
  password: string;
}

function extractAuth(req: VercelRequest): { username: string | null; token: string | null } {
  const authHeader = req.headers.authorization;
  const usernameHeader = req.headers["x-username"];
  
  let token: string | null = null;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }
  
  const username = typeof usernameHeader === "string" ? usernameHeader : null;
  
  return { username, token };
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

  // Extract and validate auth
  const { username, token } = extractAuth(req);
  if (!username || !token) {
    res.status(401).json({ error: "Unauthorized - missing credentials" });
    return;
  }

  const authResult = await validateAuth(redis, username, token, { allowExpired: true });
  if (!authResult.valid) {
    res.status(401).json({ error: "Unauthorized - invalid token" });
    return;
  }

  // Parse body
  const body = req.body as SetPasswordRequest;
  const { password } = body || {};

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

  try {
    // Hash and store password
    const passwordHash = await hashPassword(password);
    await setUserPasswordHash(redis, username.toLowerCase(), passwordHash);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error setting password:", error);
    res.status(500).json({ error: "Failed to set password" });
  }
}
