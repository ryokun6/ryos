/**
 * GET /api/auth/password/check
 * 
 * Check if user has a password set
 */

import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  extractAuth,
  errorResponse,
  jsonResponse,
} from "../../_utils/middleware.js";
import { userHasPassword, validateAuth } from "../../_utils/auth/index.js";


export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "OPTIONS"], origin);
    if (preflight) return preflight;
    return new Response(null, { status: 204 });
  }

  if (req.method !== "GET") {
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

  // Extract and validate auth
  const { username, token } = extractAuth(req);
  if (!username || !token) {
    return new Response(JSON.stringify({ error: "Unauthorized - missing credentials" }), { status: 401, headers });
  }

  const authResult = await validateAuth(redis, username, token, { allowExpired: true });
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: "Unauthorized - invalid token" }), { status: 401, headers });
  }

  // Check if password is set
  const hasPassword = await userHasPassword(redis, username.toLowerCase());

  return new Response(JSON.stringify({ 
    hasPassword,
    username: username.toLowerCase(),
  }), { status: 200, headers });
}
