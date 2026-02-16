/**
 * POST /api/sync/backup - Upload backup to cloud (Vercel Blob)
 * GET  /api/sync/backup - Download backup from cloud
 * DELETE /api/sync/backup - Delete cloud backup
 *
 * Stores compressed backup data in Vercel Blob with metadata in Redis.
 * Requires authentication (Bearer token + X-Username).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put, del, head } from "@vercel/blob";
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

// Increase body size limit for large backups (default is 4.5MB)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "55mb",
    },
  },
};

/** Maximum backup size: 50MB compressed */
const MAX_BACKUP_SIZE = 50 * 1024 * 1024;

/** Backup metadata TTL: 90 days (same as user TTL) */
const META_TTL = USER_TTL_SECONDS;

/** Rate limit: 10 backups per hour */
const RATE_LIMIT_WINDOW = 3600;
const RATE_LIMIT_MAX = 10;

// Redis key for backup metadata
function metaKey(username: string) {
  return `sync:meta:${username}`;
}

// Blob path for a user's backup
function blobPath(username: string) {
  return `backups/${username}/backup.gz`;
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
    await handleUpload(req, res, redis, username);
  } else if (req.method === "GET") {
    await handleDownload(res, redis, username);
  } else if (req.method === "DELETE") {
    await handleDelete(res, redis, username);
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}

async function handleUpload(
  req: VercelRequest,
  res: VercelResponse,
  redis: ReturnType<typeof createRedis>,
  username: string
): Promise<void> {
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

  // Parse body
  const body = req.body as {
    data: string; // base64-encoded gzip data
    timestamp: string;
    version: number;
  } | null;

  if (!body?.data || !body?.timestamp) {
    res.status(400).json({ error: "Missing required fields: data, timestamp" });
    return;
  }

  const { data, timestamp, version } = body;

  // Validate size (base64 string length)
  if (data.length > MAX_BACKUP_SIZE) {
    res.status(413).json({
      error: `Backup too large. Maximum size is ${MAX_BACKUP_SIZE / 1024 / 1024}MB compressed.`,
    });
    return;
  }

  try {
    // Delete old blob if it exists
    const existingMeta = await redis.get<string | BackupMeta>(metaKey(username));
    if (existingMeta) {
      const parsed: BackupMeta =
        typeof existingMeta === "string"
          ? JSON.parse(existingMeta)
          : existingMeta;
      if (parsed.blobUrl) {
        try {
          await del(parsed.blobUrl);
        } catch {
          // Ignore delete errors for old blob
        }
      }
    }

    // Decode base64 to binary buffer
    const binaryStr = Buffer.from(data, "base64");

    // Upload to Vercel Blob
    const blob = await put(blobPath(username), binaryStr, {
      access: "public",
      contentType: "application/gzip",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    // Store metadata in Redis
    const meta: BackupMeta = {
      timestamp,
      version: version || 3,
      totalSize: binaryStr.length,
      blobUrl: blob.url,
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
    console.error("Error uploading backup:", message, error);
    res.status(500).json({ error: `Failed to upload backup: ${message}` });
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
