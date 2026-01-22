/**
 * POST /api/auth/token/verify
 * 
 * Verify if a token is valid
 */

import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  extractAuth,
  jsonResponse,
  errorResponse,
} from "../../_utils/middleware.js";
import { validateAuth } from "../../_utils/auth/index.js";
import { isProfaneUsername } from "../../_utils/_validation.js";

export const config = {
  runtime: "bun",
};

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

  const redis = createRedis();

  // Extract auth from headers
  const { username, token } = extractAuth(req);

  if (!token) {
    return new Response(JSON.stringify({ error: "Authorization token required" }), { status: 401, headers });
  }

  if (!username) {
    return new Response(JSON.stringify({ error: "X-Username header required" }), { status: 400, headers });
  }

  // Check profanity
  if (isProfaneUsername(username)) {
    return new Response(JSON.stringify({ error: "Invalid authentication token" }), { status: 401, headers });
  }

  // Validate token (allow expired for grace period info)
  const result = await validateAuth(redis, username, token, { allowExpired: true });

  if (!result.valid) {
    return new Response(JSON.stringify({ error: "Invalid authentication token" }), { status: 401, headers });
  }

  if (result.expired) {
    return new Response(JSON.stringify({ 
      valid: true,
      username: username.toLowerCase(),
      expired: true,
      message: "Token is within grace period",
    }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ 
    valid: true,
    username: username.toLowerCase(),
    message: "Token is valid",
  }), { status: 200, headers });
}
