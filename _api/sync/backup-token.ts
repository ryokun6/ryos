/**
 * POST /api/sync/backup-token - Generate a client token for direct Vercel Blob upload
 *
 * Returns a short-lived client token that allows the browser to upload
 * directly to Vercel Blob, bypassing the server for the actual file transfer.
 *
 * Requires authentication (Bearer token + X-Username).
 */

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { apiHandler } from "../_utils/api-handler.js";

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

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
  },
  async ({ res, redis, user }): Promise<void> => {
    const username = user?.username || "";

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
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error generating client token:", message, error);
      res.status(500).json({ error: `Failed to generate upload token: ${message}` });
    }
  }
);
