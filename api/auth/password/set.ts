/**
 * POST /api/auth/password/set
 * 
 * Set or update user's password
 */

import { Redis } from "@upstash/redis";
import {
  hashPassword,
  setUserPasswordHash,
  validateAuth,
  extractAuth,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../../_utils/auth/index.js";
import { getEffectiveOrigin, isAllowedOrigin, preflightIfNeeded } from "../../_utils/_cors.js";

export const edge = true;
export const config = {
  runtime: "edge",
};

interface SetPasswordRequest {
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

  // Extract and validate auth
  const { username, token } = extractAuth(req);
  if (!username || !token) {
    return new Response(JSON.stringify({ error: "Unauthorized - missing credentials" }), { status: 401, headers });
  }

  const authResult = await validateAuth(redis, username, token, { allowExpired: true });
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: "Unauthorized - invalid token" }), { status: 401, headers });
  }

  // Parse body
  let body: SetPasswordRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const { password } = body;

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

  // Hash and store password
  const passwordHash = await hashPassword(password);
  await setUserPasswordHash(redis, username.toLowerCase(), passwordHash);

  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}
