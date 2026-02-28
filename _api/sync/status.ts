/**
 * GET /api/sync/status - Get cloud backup status/metadata
 *
 * Returns whether a backup exists and its metadata.
 * Requires authentication (Bearer token + X-Username).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createRedis } from "../_utils/redis.js";
import {
  extractAuthNormalized,
} from "../_utils/auth/index.js";
import {
  setCorsHeaders,
  handlePreflight,
  isAllowedOrigin,
  getEffectiveOrigin,
} from "../_utils/_cors.js";
import { executeSyncStatusCore } from "../cores/sync-status-core.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle CORS preflight
  if (handlePreflight(req, res, { methods: ["GET", "OPTIONS"] })) {
    return;
  }

  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"] });

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const redis = createRedis();

  const { username, token } = extractAuthNormalized(req);
  const result = await executeSyncStatusCore({
    originAllowed: isAllowedOrigin(origin),
    redis,
    username,
    token,
  });

  if (result.headers) {
    for (const [name, value] of Object.entries(result.headers)) {
      res.setHeader(name, value);
    }
  }
  res.status(result.status).json(result.body);
}
