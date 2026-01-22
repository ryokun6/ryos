/**
 * POST /api/auth/logout
 * 
 * Logout current session (invalidate current token)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getEffectiveOriginNode,
  isAllowedOrigin,
  setCorsHeadersNode,
  handlePreflightNode,
} from "../_utils/middleware.js";
import { deleteToken, validateAuth } from "../_utils/auth/index.js";

export const runtime = "nodejs";
export const maxDuration = 15;

function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
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

  // Extract and validate auth
  const authHeader = getHeader(req, "authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = getHeader(req, "x-username");

  if (!username || !token) {
    res.status(401).json({ error: "Unauthorized - missing credentials" });
    return;
  }

  const authResult = await validateAuth(redis, username, token, { allowExpired: true });
  if (!authResult.valid) {
    res.status(401).json({ error: "Unauthorized - invalid token" });
    return;
  }

  // Delete current token
  await deleteToken(redis, token);

  res.status(200).json({ 
    success: true,
    message: "Logged out successfully",
  });
}
