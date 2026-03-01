/**
 * GET /api/sync/status - Get cloud backup status/metadata
 *
 * Returns whether a backup exists and its metadata.
 * Requires authentication (Bearer token + X-Username).
 */

import { apiHandler } from "../_utils/api-handler.js";

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
}

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
  },
  async ({ res, redis, user }): Promise<void> => {
    try {
      const username = user?.username || "";
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
        },
      });
    } catch (error) {
      console.error("Error checking backup status:", error);
      res.status(500).json({ error: "Failed to check backup status" });
    }
  }
);
