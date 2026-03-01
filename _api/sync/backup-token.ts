/**
 * POST /api/sync/backup-token - Generate a client token for direct Vercel Blob upload
 *
 * Returns a short-lived client token that allows the browser to upload
 * directly to Vercel Blob, bypassing the server for the actual file transfer.
 *
 * Requires authentication (Bearer token + X-Username).
 */

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { createApiHandler } from "../_utils/handler.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const MAX_BACKUP_SIZE = 50 * 1024 * 1024;
const RATE_LIMIT_WINDOW = 3600;
const RATE_LIMIT_MAX = 10;

function blobPath(username: string) {
  return `backups/${username}/backup.gz`;
}

export default createApiHandler(
  {
    operation: "sync-backup-token",
    methods: ["POST"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const user = await ctx.requireAuth({
      missingMessage: "Authentication required",
      invalidMessage: "Authentication required",
    });
    if (!user) {
      return;
    }

    if (
      !(await ctx.applyRateLimit({
        key: `rl:sync:backup:${user.username}`,
        prefix: "sync:backup",
        windowSeconds: RATE_LIMIT_WINDOW,
        limit: RATE_LIMIT_MAX,
        by: "custom",
        message: "Too many backup requests. Please try again later.",
      }))
    ) {
      return;
    }

    try {
      const clientToken = await generateClientTokenFromReadWriteToken({
        pathname: blobPath(user.username),
        allowedContentTypes: ["application/gzip", "application/octet-stream"],
        maximumSizeInBytes: MAX_BACKUP_SIZE,
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      ctx.response.ok({ clientToken });
    } catch (routeError) {
      const message =
        routeError instanceof Error ? routeError.message : "Unknown error";
      ctx.logger.error("Error generating client token", routeError);
      ctx.response.serverError(`Failed to generate upload token: ${message}`);
    }
  }
);
