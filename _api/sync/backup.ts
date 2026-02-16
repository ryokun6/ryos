/**
 * POST /api/sync/backup - Save backup metadata after client-side Vercel Blob upload
 * GET  /api/sync/backup - Download backup from cloud
 * DELETE /api/sync/backup - Delete cloud backup
 *
 * The actual blob upload is done client-side using @vercel/blob/client.
 * This endpoint stores metadata in Redis and handles download/delete.
 * Requires authentication (Bearer token + X-Username).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { del, head } from "@vercel/blob";
import { createRedis } from "../_utils/redis.js";
import {
  extractAuthNormalized,
  validateAuth,
  USER_TTL_SECONDS,
} from "../_utils/auth/index.js";
import {
  setCorsHeaders,
  handlePreflight,
} from "../_utils/_cors.js";

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle CORS preflight
  if (
    handlePreflight(req, res, {
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
    })
  ) {
    return;
  }

  const origin = req.headers.origin as string | undefined;
  setCorsHeaders(res, origin, {
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  });

  const redis = createRedis();

  // Extract and validate auth
  const { username, token } = extractAuthNormalized(req);
  const authResult = await validateAuth(redis, username, token);

  if (!authResult.valid || !username) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (req.method === "POST") {
    await handleSaveMetadata(req, res, redis, username);
  } else if (req.method === "GET") {
    await handleDownload(res, redis, username);
  } else if (req.method === "DELETE") {
    await handleDelete(res, redis, username);
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}

async function handleSaveMetadata(
  req: VercelRequest,
  res: VercelResponse,
  redis: ReturnType<typeof createRedis>,
  username: string
): Promise<void> {
  // Parse body - expects metadata from client after direct blob upload
  const body = req.body as {
    blobUrl: string;
    timestamp: string;
    version: number;
    totalSize: number;
  } | null;

  if (!body?.blobUrl || !body?.timestamp) {
    res.status(400).json({ error: "Missing required fields: blobUrl, timestamp" });
    return;
  }

  const { blobUrl, timestamp, version, totalSize } = body;

  // Validate the blob URL points to a real blob
  const blobInfo = await head(blobUrl).catch(() => null);
  if (!blobInfo) {
    res.status(400).json({ error: "Invalid blob URL: blob not found" });
    return;
  }

  try {
    // Delete old blob if it exists and differs from the new one
    const existingMeta = await redis.get<string | BackupMeta>(metaKey(username));
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

    await redis.set(metaKey(username), JSON.stringify(meta), {
      ex: META_TTL,
    });

    res.status(200).json({
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
    console.error("Error saving backup metadata:", message, error);
    res.status(500).json({ error: `Failed to save backup metadata: ${message}` });
  }
}

async function handleDownload(
  res: VercelResponse,
  redis: ReturnType<typeof createRedis>,
  username: string
): Promise<void> {
  try {
    // Get metadata from Redis
    const rawMeta = await redis.get<string | BackupMeta>(metaKey(username));
    if (!rawMeta) {
      res.status(404).json({ error: "No backup found" });
      return;
    }

    const meta: BackupMeta =
      typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;

    if (!meta.blobUrl) {
      res.status(404).json({ error: "No backup found" });
      return;
    }

    // Verify blob still exists
    const blobInfo = await head(meta.blobUrl).catch(() => null);
    if (!blobInfo) {
      // Blob was deleted, clean up metadata
      await redis.del(metaKey(username));
      res.status(404).json({ error: "Backup data not found. It may have expired." });
      return;
    }

    // Fetch the blob data
    const blobResponse = await fetch(meta.blobUrl);
    if (!blobResponse.ok) {
      res.status(500).json({ error: "Failed to retrieve backup data" });
      return;
    }

    const arrayBuffer = await blobResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    res.status(200).json({
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
    console.error("Error downloading backup:", error);
    res.status(500).json({ error: "Failed to download backup" });
  }
}

async function handleDelete(
  res: VercelResponse,
  redis: ReturnType<typeof createRedis>,
  username: string
): Promise<void> {
  try {
    const rawMeta = await redis.get<string | BackupMeta>(metaKey(username));
    if (!rawMeta) {
      res.status(404).json({ error: "No backup found" });
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
    await redis.del(metaKey(username));

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error deleting backup:", error);
    res.status(500).json({ error: "Failed to delete backup" });
  }
}
