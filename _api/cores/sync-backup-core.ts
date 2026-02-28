import type { Redis } from "@upstash/redis";
import { validateAuth, USER_TTL_SECONDS } from "../_utils/auth/index.js";
import {
  getBackupStorageProvider,
  type BackupStorageProviderName,
} from "../_utils/_backup-storage.js";
import type { CoreResponse } from "../_runtime/core-types.js";

/** Backup metadata TTL: 90 days (same as user TTL) */
const META_TTL = USER_TTL_SECONDS;

function metaKey(username: string): string {
  return `sync:meta:${username}`;
}

interface BackupMeta {
  timestamp: string;
  version: number;
  totalSize: number;
  blobUrl: string;
  createdAt: string;
  storageProvider?: BackupStorageProviderName;
}

interface SaveBackupMetadataRequest {
  blobUrl: string;
  timestamp: string;
  version: number;
  totalSize: number;
}

interface SyncBackupCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  body: unknown;
  username: string | null;
  token: string | null;
  redis: Redis;
}

async function handleSaveMetadata(
  body: unknown,
  redis: Redis,
  username: string
): Promise<CoreResponse> {
  const payload = body as SaveBackupMetadataRequest | null;
  if (!payload?.blobUrl || !payload?.timestamp) {
    return { status: 400, body: { error: "Missing required fields: blobUrl, timestamp" } };
  }

  const { blobUrl, timestamp, version, totalSize } = payload;
  const storage = getBackupStorageProvider();
  const blobInfo = await storage.headObject(blobUrl);
  if (!blobInfo) {
    return { status: 400, body: { error: "Invalid blob URL: blob not found" } };
  }

  try {
    const existingMeta = await redis.get<string | BackupMeta>(metaKey(username));
    if (existingMeta) {
      const parsed: BackupMeta =
        typeof existingMeta === "string"
          ? JSON.parse(existingMeta)
          : existingMeta;
      if (parsed.blobUrl && parsed.blobUrl !== blobUrl) {
        try {
          const oldStorage = getBackupStorageProvider(parsed.storageProvider);
          await oldStorage.deleteObject(parsed.blobUrl);
        } catch {
          // Ignore delete errors for old blob
        }
      }
    }

    const meta: BackupMeta = {
      timestamp,
      version: version || 3,
      totalSize: totalSize || blobInfo.size,
      blobUrl,
      createdAt: new Date().toISOString(),
      storageProvider: storage.name,
    };

    await redis.set(metaKey(username), JSON.stringify(meta), {
      ex: META_TTL,
    });

    return {
      status: 200,
      body: {
        ok: true,
        metadata: {
          timestamp: meta.timestamp,
          version: meta.version,
          totalSize: meta.totalSize,
          createdAt: meta.createdAt,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { status: 500, body: { error: `Failed to save backup metadata: ${message}` } };
  }
}

async function handleDownload(redis: Redis, username: string): Promise<CoreResponse> {
  try {
    const rawMeta = await redis.get<string | BackupMeta>(metaKey(username));
    if (!rawMeta) {
      return { status: 404, body: { error: "No backup found" } };
    }

    const meta: BackupMeta =
      typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;
    if (!meta.blobUrl) {
      return { status: 404, body: { error: "No backup found" } };
    }

    const storage = getBackupStorageProvider(meta.storageProvider);
    const blobInfo = await storage.headObject(meta.blobUrl);
    if (!blobInfo) {
      await redis.del(metaKey(username));
      return {
        status: 404,
        body: { error: "Backup data not found. It may have expired." },
      };
    }

    const blobResponse = await fetch(meta.blobUrl);
    if (!blobResponse.ok) {
      return { status: 500, body: { error: "Failed to retrieve backup data" } };
    }

    const arrayBuffer = await blobResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    return {
      status: 200,
      body: {
        ok: true,
        data: base64Data,
        metadata: {
          timestamp: meta.timestamp,
          version: meta.version,
          totalSize: meta.totalSize,
          createdAt: meta.createdAt,
        },
      },
    };
  } catch {
    return { status: 500, body: { error: "Failed to download backup" } };
  }
}

async function handleDelete(redis: Redis, username: string): Promise<CoreResponse> {
  try {
    const rawMeta = await redis.get<string | BackupMeta>(metaKey(username));
    if (!rawMeta) {
      return { status: 404, body: { error: "No backup found" } };
    }

    const meta: BackupMeta =
      typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;

    if (meta.blobUrl) {
      try {
        const storage = getBackupStorageProvider(meta.storageProvider);
        await storage.deleteObject(meta.blobUrl);
      } catch {
        // Ignore delete errors
      }
    }

    await redis.del(metaKey(username));
    return { status: 200, body: { ok: true } };
  } catch {
    return { status: 500, body: { error: "Failed to delete backup" } };
  }
}

export async function executeSyncBackupCore(
  input: SyncBackupCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  const authResult = await validateAuth(input.redis, input.username, input.token);
  if (!authResult.valid || !input.username) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  if (input.method === "POST") {
    return handleSaveMetadata(input.body, input.redis, input.username);
  }
  if (input.method === "GET") {
    return handleDownload(input.redis, input.username);
  }
  if (input.method === "DELETE") {
    return handleDelete(input.redis, input.username);
  }

  return { status: 405, body: { error: "Method not allowed" } };
}
