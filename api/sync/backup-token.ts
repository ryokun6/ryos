/**
 * POST /api/sync/backup-token - Generate direct-upload instructions for cloud
 * backup storage.
 *
 * Requires authentication (Bearer token + X-Username).
 */

import { apiHandler } from "../_utils/api-handler.js";
import {
  createStorageUploadDescriptor,
  getStorageUploadDebugInfo,
  logStorageDebug,
} from "../_utils/storage.js";

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
  async ({ req, res, redis, user }): Promise<void> => {
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
      const upload = await createStorageUploadDescriptor({
        pathname: blobPath(username),
        contentType: "application/gzip",
        allowedContentTypes: ["application/gzip", "application/octet-stream"],
        maximumSizeInBytes: MAX_BACKUP_SIZE,
        allowOverwrite: true,
      });

      logStorageDebug("Generated backup upload instructions", {
        route: "/api/sync/backup-token",
        username,
        origin: req.headers.origin,
        referer: req.headers.referer,
        host: req.headers.host,
        ...getStorageUploadDebugInfo(upload),
      });

      res.status(200).json(upload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error generating upload instructions:", message, error);
      res.status(500).json({ error: `Failed to generate upload token: ${message}` });
    }
  }
);
