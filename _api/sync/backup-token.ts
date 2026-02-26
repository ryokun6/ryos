/**
 * POST /api/sync/backup-token - Generate a client token for direct Vercel Blob upload
 *
 * Returns a short-lived client token that allows the browser to upload
 * directly to Vercel Blob, bypassing the server for the actual file transfer.
 *
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
import { executeSyncBackupTokenCore } from "../cores/sync-backup-token-core.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (
    handlePreflight(req, res, {
      methods: ["POST", "OPTIONS"],
    })
  ) {
    return;
  }

  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, {
    methods: ["POST", "OPTIONS"],
  });

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const redis = createRedis();

  const { username, token } = extractAuthNormalized(req);
  const result = await executeSyncBackupTokenCore({
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
