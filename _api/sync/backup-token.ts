/**
 * POST /api/sync/backup-token - Generate a client token for direct Vercel Blob upload
 *
 * Returns a short-lived client token that allows the browser to upload
 * directly to Vercel Blob, bypassing the server for the actual file transfer.
 *
 * Requires authentication (Bearer token + X-Username).
 */

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { createApiHandler } from "../_utils/middleware.js";

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

export default createApiHandler(
  {
    methods: ["POST"],
    action: "sync/backup-token",
    cors: { methods: ["POST", "OPTIONS"] },
  },
  async (ctx): Promise<void> => {
    const user = await ctx.auth.require({
      missingMessage: "Authentication required",
      invalidMessage: "Authentication required",
    });
    if (!user) return;

    const rlResult = await ctx.rateLimit.check({
      key: `rl:sync:backup:${user.username}`,
      windowSeconds: RATE_LIMIT_WINDOW,
      limit: RATE_LIMIT_MAX,
    });
    if (!rlResult.allowed) {
      ctx.response.json(
        { error: "Too many backup requests. Please try again later." },
        429
      );
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      ctx.logger.error("Error generating client token", { message, error });
      ctx.response.error(`Failed to generate upload token: ${message}`, 500);
    }
  }
);
