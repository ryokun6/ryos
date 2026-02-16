/**
 * POST /api/sync/backup-token - Generate a client token for direct Vercel Blob upload
 *
 * Returns a short-lived client token that allows the browser to upload
 * directly to Vercel Blob, bypassing the server for the actual file transfer.
 *
 * Requires authentication (Bearer token + X-Username).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { createRedis } from "../_utils/redis.js";
import {
  extractAuthNormalized,
  validateAuth,
} from "../_utils/auth/index.js";
import {
  setCorsHeaders,
  handlePreflight,
} from "../_utils/_cors.js";

export const runtime = "nodejs";
export const maxDuration = 10;

/** Maximum backup size: 50MB */
const MAX_BACKUP_SIZE = 50 * 1024 * 1024;

/** Rate limit: 10 backups per hour */
const RATE_LIMIT_WINDOW = 3600;
const RATE_LIMIT_MAX = 10;

function blobPath(username: string) {
  return `backups/${username}/backup.gz`;
}

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

  const origin = req.headers.origin as string | undefined;
  setCorsHeaders(res, origin, {
    methods: ["POST", "OPTIONS"],
  });

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const redis = createRedis();

  const { username, token } = extractAuthNormalized(req);
  const authResult = await validateAuth(redis, username, token);

  if (!authResult.valid || !username) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Rate limiting
  const rlKey = `rl:sync:backup:${username}`;
  const current = await redis.incr(rlKey);
  if (current === 1) {
    await redis.expire(rlKey, RATE_LIMIT_WINDOW);
  }
  if (current > RATE_LIMIT_MAX) {
    res.status(429).json({
      error: "Too many backup requests. Please try again later.",
    });
    return;
  }

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      pathname: blobPath(username),
      allowedContentTypes: ["application/gzip", "application/octet-stream"],
      maximumSizeInBytes: MAX_BACKUP_SIZE,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    res.status(200).json({ clientToken });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error generating client token:", message, error);
    res.status(500).json({ error: `Failed to generate upload token: ${message}` });
  }
}
