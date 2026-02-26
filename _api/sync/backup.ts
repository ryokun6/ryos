/**
 * POST /api/sync/backup - Save backup metadata after client-side Vercel Blob upload
 * GET  /api/sync/backup - Download backup from cloud
 * DELETE /api/sync/backup - Delete cloud backup
 *
 * The actual blob upload is done client-side using @vercel/blob/client.
 * This endpoint stores metadata in Redis and handles download/delete.
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
import { executeSyncBackupCore } from "../cores/sync-backup-core.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle CORS preflight
  if (
    handlePreflight(req, res, {
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
    })
  ) {
    return;
  }

  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, {
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  });

  const redis = createRedis();
  const { username, token } = extractAuthNormalized(req);
  const result = await executeSyncBackupCore({
    originAllowed: isAllowedOrigin(origin),
    method: req.method,
    body: req.body,
    username,
    token,
    redis,
  });

  if (result.headers) {
    for (const [name, value] of Object.entries(result.headers)) {
      res.setHeader(name, value);
    }
  }
  res.status(result.status).json(result.body);
}
