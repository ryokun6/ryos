/**
 * POST /api/sync/backup - Save backup metadata after client-side Vercel Blob upload
 * GET  /api/sync/backup - Download backup from cloud
 * DELETE /api/sync/backup - Delete cloud backup
 *
 * The actual blob upload is done client-side using @vercel/blob/client.
 * This endpoint stores metadata in Redis and handles download/delete.
 * Requires authentication (Bearer token + X-Username).
 */

import { del, head } from "@vercel/blob";
import { USER_TTL_SECONDS } from "../_utils/auth/index.js";
import {
  createApiHandler,
  type ApiHandlerContext,
} from "../_utils/middleware.js";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Backup metadata TTL: 90 days (same as user TTL) */
const META_TTL = USER_TTL_SECONDS;

// Redis key for backup metadata
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
    methods: ["GET", "POST", "DELETE"],
    action: "sync/backup",
    cors: {
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
    },
  },
  async (ctx): Promise<void> => {
    const user = await ctx.auth.require({
      missingMessage: "Authentication required",
      invalidMessage: "Authentication required",
    });
    if (!user) return;

    if (ctx.method === "POST") {
      await handleSaveMetadata(ctx, user.username);
      return;
    }
    if (ctx.method === "GET") {
      await handleDownload(ctx, user.username);
      return;
    }
    if (ctx.method === "DELETE") {
      await handleDelete(ctx, user.username);
      return;
    }

    ctx.response.methodNotAllowed();
  }
);

async function handleSaveMetadata(
  ctx: ApiHandlerContext,
  username: string
): Promise<void> {
  // Parse body - expects metadata from client after direct blob upload
  const body = ctx.req.body as {
    blobUrl: string;
    timestamp: string;
    version: number;
    totalSize: number;
  } | null;

  if (!body?.blobUrl || !body?.timestamp) {
    ctx.response.badRequest("Missing required fields: blobUrl, timestamp");
    return;
  }

  const { blobUrl, timestamp, version, totalSize } = body;

  // Validate the blob URL points to a real blob
  const blobInfo = await head(blobUrl).catch(() => null);
  if (!blobInfo) {
    ctx.response.badRequest("Invalid blob URL: blob not found");
    return;
  }

  try {
    // Delete old blob if it exists and differs from the new one
    const existingMeta = await ctx.redis.get<string | BackupMeta>(metaKey(username));
    if (existingMeta) {
      const parsed: BackupMeta =
        typeof existingMeta === "string"
          ? JSON.parse(existingMeta)
          : existingMeta;
      if (parsed.blobUrl && parsed.blobUrl !== blobUrl) {
        try {
          await del(parsed.blobUrl);
        } catch {
          // Ignore delete errors for old blob
        }
      }
    }

    // Store metadata in Redis
    const meta: BackupMeta = {
      timestamp,
      version: version || 3,
      totalSize: totalSize || blobInfo.size,
      blobUrl,
      createdAt: new Date().toISOString(),
    };

    await ctx.redis.set(metaKey(username), JSON.stringify(meta), {
      ex: META_TTL,
    });

    ctx.response.ok({
      ok: true,
      metadata: {
        timestamp: meta.timestamp,
        version: meta.version,
        totalSize: meta.totalSize,
        createdAt: meta.createdAt,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    ctx.logger.error("Error saving backup metadata", { message, error });
    ctx.response.error(`Failed to save backup metadata: ${message}`, 500);
  }
}

async function handleDownload(
  ctx: ApiHandlerContext,
  username: string
): Promise<void> {
  try {
    // Get metadata from Redis
    const rawMeta = await ctx.redis.get<string | BackupMeta>(metaKey(username));
    if (!rawMeta) {
      ctx.response.json({ error: "No backup found" }, 404);
      return;
    }

    const meta: BackupMeta =
      typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;

    if (!meta.blobUrl) {
      ctx.response.json({ error: "No backup found" }, 404);
      return;
    }

    // Verify blob still exists
    const blobInfo = await head(meta.blobUrl).catch(() => null);
    if (!blobInfo) {
      // Blob was deleted, clean up metadata
      await ctx.redis.del(metaKey(username));
      ctx.response.json(
        { error: "Backup data not found. It may have expired." },
        404
      );
      return;
    }

    // Fetch the blob data
    const blobResponse = await fetch(meta.blobUrl);
    if (!blobResponse.ok) {
      ctx.response.error("Failed to retrieve backup data", 500);
      return;
    }

    const arrayBuffer = await blobResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    ctx.response.ok({
      ok: true,
      data: base64Data,
      metadata: {
        timestamp: meta.timestamp,
        version: meta.version,
        totalSize: meta.totalSize,
        createdAt: meta.createdAt,
      },
    });
  } catch (error) {
    ctx.logger.error("Error downloading backup", error);
    ctx.response.error("Failed to download backup", 500);
  }
}

async function handleDelete(
  ctx: ApiHandlerContext,
  username: string
): Promise<void> {
  try {
    const rawMeta = await ctx.redis.get<string | BackupMeta>(metaKey(username));
    if (!rawMeta) {
      ctx.response.json({ error: "No backup found" }, 404);
      return;
    }

    const meta: BackupMeta =
      typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;

    // Delete blob
    if (meta.blobUrl) {
      try {
        await del(meta.blobUrl);
      } catch {
        // Ignore delete errors
      }
    }

    // Delete metadata
    await ctx.redis.del(metaKey(username));

    ctx.response.ok({ ok: true });
  } catch (error) {
    ctx.logger.error("Error deleting backup", error);
    ctx.response.error("Failed to delete backup", 500);
  }
}
