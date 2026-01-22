/**
 * POST /api/auth/logout-all
 * 
 * Logout all sessions (invalidate all tokens for user)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getOriginFromVercel,
  isOriginAllowed,
  handlePreflight,
  setCorsHeaders,
} from "../_utils/middleware.js";
import { deleteAllUserTokens, validateAuth } from "../_utils/auth/index.js";


export const config = {
  runtime: "nodejs",
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = getOriginFromVercel(req);
  
  if (handlePreflight(req, res, ["POST", "OPTIONS"])) {
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isOriginAllowed(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  setCorsHeaders(res, origin, ["POST", "OPTIONS"]);

  const redis = createRedis();

  // Extract auth from headers
  const authHeader = req.headers.authorization as string | undefined;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = req.headers["x-username"] as string | undefined || null;

  if (!username || !token) {
    res.status(401).json({ error: "Unauthorized - missing credentials" });
    return;
  }

  const authResult = await validateAuth(redis, username, token, { allowExpired: true });
  if (!authResult.valid) {
    res.status(401).json({ error: "Unauthorized - invalid token" });
    return;
  }

  // Delete all tokens for user
  const deletedCount = await deleteAllUserTokens(redis, username.toLowerCase());

  res.status(200).json({ 
    success: true,
    message: `Logged out from ${deletedCount} devices`,
    deletedCount,
  });
}
