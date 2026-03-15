/**
 * POST /api/sync/backup - Save backup metadata after client-side storage upload
 * GET  /api/sync/backup - Download backup from cloud
 * DELETE /api/sync/backup - Delete cloud backup
 *
 * The actual object upload is done client-side.
 * This endpoint stores metadata in Redis and handles download/delete.
 * Requires authentication (Bearer token + X-Username).
 */

import type { VercelResponse } from "@vercel/node";
import type { Redis } from "../_utils/redis.js";
import { USER_TTL_SECONDS } from "../_utils/auth/index.js";
import { apiHandler } from "../_utils/api-handler.js";
import {
  deleteStoredObject,
  downloadStoredObject,
  headStoredObject,
} from "../_utils/storage.js";
import { backupMetaKey } from "./_keys.js";
import { getStoredLocation } from "./_storage-location.js";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Backup metadata TTL: 90 days (same as user TTL) */
const META_TTL = USER_TTL_SECONDS;

interface BackupMeta {
  timestamp: string;
  version: number;
  totalSize: number;
  storageUrl?: string;
  blobUrl?: string;
  createdAt: string;
}

interface SaveBackupMetadataBody {
  storageUrl?: string;
  blobUrl?: string;
  timestamp: string;
  version: number;
  totalSize: number;
}

export default apiHandler<SaveBackupMetadataBody>(
  {
    methods: ["GET", "POST", "DELETE"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user, body }): Promise<void> => {
    const username = user?.username || "";
    const method = (req.method || "GET").toUpperCase();

    if (method === "POST") {
      await handleSaveMetadata(res, redis, username, body);
      return;
    }

    if (method === "GET") {
      await handleDownload(res, redis, username);
      return;
    }

    if (method === "DELETE") {
      await handleDelete(res, redis, username);
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  }
);

async function handleSaveMetadata(
  res: VercelResponse,
  redis: Redis,
  username: string,
  body: SaveBackupMetadataBody | null
): Promise<void> {
  const storageUrl = body ? getStoredLocation(body) : null;
  if (!storageUrl || !body?.timestamp) {
    res.status(400).json({ error: "Missing required fields: storageUrl, timestamp" });
    return;
  }

  const { timestamp, version, totalSize } = body;

  const objectInfo = await headStoredObject(storageUrl).catch(() => null);
  if (!objectInfo) {
    res.status(400).json({ error: "Invalid storage URL: object not found" });
    return;
  }

  try {
    // Delete old blob if it exists and differs from the new one
    const existingMeta = await redis.get<string | BackupMeta>(
      backupMetaKey(username)
    );
    if (existingMeta) {
      const parsed: BackupMeta =
        typeof existingMeta === "string"
          ? JSON.parse(existingMeta)
          : existingMeta;
      const previousStorageUrl = getStoredLocation(parsed);
      if (previousStorageUrl && previousStorageUrl !== storageUrl) {
        try {
          await deleteStoredObject(previousStorageUrl);
        } catch {
          // Ignore delete errors for old objects
        }
      }
    }

    // Store metadata in Redis
    const meta: BackupMeta = {
      timestamp,
      version: version || 3,
      totalSize: totalSize || objectInfo.size,
      storageUrl,
      blobUrl: storageUrl,
      createdAt: new Date().toISOString(),
    };

    await redis.set(backupMetaKey(username), JSON.stringify(meta), {
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
  redis: Redis,
  username: string
): Promise<void> {
  try {
    // Get metadata from Redis
    const rawMeta = await redis.get<string | BackupMeta>(backupMetaKey(username));
    if (!rawMeta) {
      res.status(404).json({ error: "No backup found" });
      return;
    }

    const meta: BackupMeta =
      typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;

    const storageUrl = getStoredLocation(meta);
    if (!storageUrl) {
      res.status(404).json({ error: "No backup found" });
      return;
    }

    const objectInfo = await headStoredObject(storageUrl).catch(() => null);
    if (!objectInfo) {
      await redis.del(backupMetaKey(username));
      res.status(404).json({ error: "Backup data not found. It may have expired." });
      return;
    }

    const objectBytes = await downloadStoredObject(storageUrl);
    const base64Data = Buffer.from(objectBytes).toString("base64");

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
  redis: Redis,
  username: string
): Promise<void> {
  try {
    const rawMeta = await redis.get<string | BackupMeta>(backupMetaKey(username));
    if (!rawMeta) {
      res.status(404).json({ error: "No backup found" });
      return;
    }

    const meta: BackupMeta =
      typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;

    const storageUrl = getStoredLocation(meta);
    if (storageUrl) {
      try {
        await deleteStoredObject(storageUrl);
      } catch {
        // Ignore delete errors
      }
    }

    // Delete metadata
    await redis.del(backupMetaKey(username));

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error deleting backup:", error);
    res.status(500).json({ error: "Failed to delete backup" });
  }
}
