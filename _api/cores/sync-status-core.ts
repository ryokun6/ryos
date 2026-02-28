import type { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface BackupMeta {
  timestamp: string;
  version: number;
  totalSize: number;
  blobUrl: string;
  createdAt: string;
  storageProvider?: string;
}

function metaKey(username: string): string {
  return `sync:meta:${username}`;
}

interface SyncStatusCoreInput {
  originAllowed: boolean;
  redis: Redis;
  username: string | null;
  token: string | null;
}

export async function executeSyncStatusCore(
  input: SyncStatusCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (!input.username || !input.token) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const authResult = await validateAuth(input.redis, input.username, input.token);
  if (!authResult.valid) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  try {
    const rawMeta = await input.redis.get<string | BackupMeta>(metaKey(input.username));
    if (!rawMeta) {
      return { status: 200, body: { hasBackup: false, metadata: null } };
    }

    const meta: BackupMeta =
      typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;

    return {
      status: 200,
      body: {
        hasBackup: true,
        metadata: {
          timestamp: meta.timestamp,
          version: meta.version,
          totalSize: meta.totalSize,
          createdAt: meta.createdAt,
          storageProvider: meta.storageProvider || "vercel_blob",
        },
      },
    };
  } catch {
    return { status: 500, body: { error: "Failed to check backup status" } };
  }
}
