/**
 * POST /api/auth/token/verify
 * 
 * Verify if a token is valid
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getOriginFromVercel,
  isOriginAllowed,
  handlePreflight,
  setCorsHeaders,
} from "../../_utils/middleware.js";
import { validateAuth } from "../../_utils/auth/index.js";
import { isProfaneUsername } from "../../_utils/_validation.js";

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

  if (!token) {
    res.status(401).json({ error: "Authorization token required" });
    return;
  }

  if (!username) {
    res.status(400).json({ error: "X-Username header required" });
    return;
  }

  // Check profanity
  if (isProfaneUsername(username)) {
    res.status(401).json({ error: "Invalid authentication token" });
    return;
  }

  // Validate token (allow expired for grace period info)
  const result = await validateAuth(redis, username, token, { allowExpired: true });

  if (!result.valid) {
    res.status(401).json({ error: "Invalid authentication token" });
    return;
  }

  if (result.expired) {
    res.status(200).json({ 
      valid: true,
      username: username.toLowerCase(),
      expired: true,
      message: "Token is within grace period",
    });
    return;
  }

  res.status(200).json({ 
    valid: true,
    username: username.toLowerCase(),
    message: "Token is valid",
  });
}
