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
  validateAuth,
} from "../_utils/auth/index.js";
import {
  setCorsHeaders,
  handlePreflight,
} from "../_utils/_cors.js";

export const runtime = "nodejs";
export const maxDuration = 10;

function metaKey(username: string) {
  return `sync:meta:${username}`;
}

interface BackupMeta {
  timestamp: string;
  version: number;
  totalSize: number;
  blobUrl: string;
  createdAt: string;
  storageProvider?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle CORS preflight
  if (handlePreflight(req, res, { methods: ["GET", "OPTIONS"] })) {
    return;
  }

  const origin = req.headers.origin as string | undefined;
  setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"] });

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const redis = createRedis();

  // Extract and validate auth
  const { username, token } = extractAuthNormalized(req);
  const authResult = await validateAuth(redis, username, token);

  if (!authResult.valid || !username) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const rawMeta = await redis.get<string | BackupMeta>(metaKey(username));

    if (!rawMeta) {
      res.status(200).json({
        hasBackup: false,
        metadata: null,
      });
      return;
    }

    const meta: BackupMeta =
      typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;

    res.status(200).json({
      hasBackup: true,
      metadata: {
        timestamp: meta.timestamp,
        version: meta.version,
        totalSize: meta.totalSize,
        createdAt: meta.createdAt,
        storageProvider: meta.storageProvider || "vercel_blob",
      },
    });
  } catch (error) {
    console.error("Error checking backup status:", error);
    res.status(500).json({ error: "Failed to check backup status" });
  }
}
