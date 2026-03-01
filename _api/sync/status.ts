/**
 * GET /api/sync/status - Get cloud backup status/metadata
 *
 * Returns whether a backup exists and its metadata.
 * Requires authentication (Bearer token + X-Username).
 */

import { createApiHandler } from "../_utils/middleware.js";

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

export default createApiHandler(
  {
    methods: ["GET"],
    action: "sync/status",
    cors: { methods: ["GET", "OPTIONS"] },
  },
  async (ctx): Promise<void> => {
    const user = await ctx.auth.require({
      missingMessage: "Authentication required",
      invalidMessage: "Authentication required",
    });
    if (!user) return;

    try {
      const rawMeta = await ctx.redis.get<string | BackupMeta>(
        metaKey(user.username)
      );

      if (!rawMeta) {
        ctx.response.ok({
          hasBackup: false,
          metadata: null,
        });
        return;
      }

      const meta: BackupMeta =
        typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;

      ctx.response.ok({
        hasBackup: true,
        metadata: {
          timestamp: meta.timestamp,
          version: meta.version,
          totalSize: meta.totalSize,
          createdAt: meta.createdAt,
        },
      });
    } catch (error) {
      ctx.logger.error("Error checking backup status", error);
      ctx.response.error("Failed to check backup status", 500);
    }
  }
);
