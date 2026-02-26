import type { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import { getBackupStorageProvider } from "../_utils/_backup-storage.js";
import type { CoreResponse } from "../_runtime/core-types.js";

/** Maximum backup size: 50MB */
const MAX_BACKUP_SIZE = 50 * 1024 * 1024;
/** Rate limit: 10 backups per hour */
const RATE_LIMIT_WINDOW = 3600;
const RATE_LIMIT_MAX = 10;

function blobPath(username: string): string {
  return `backups/${username}/backup.gz`;
}

interface SyncBackupTokenCoreInput {
  originAllowed: boolean;
  redis: Redis;
  username: string | null;
  token: string | null;
}

export async function executeSyncBackupTokenCore(
  input: SyncBackupTokenCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  const authResult = await validateAuth(input.redis, input.username, input.token);
  if (!authResult.valid || !input.username) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  const rlKey = `rl:sync:backup:${input.username}`;
  const current = await input.redis.incr(rlKey);
  if (current === 1) {
    await input.redis.expire(rlKey, RATE_LIMIT_WINDOW);
  }
  if (current > RATE_LIMIT_MAX) {
    return {
      status: 429,
      body: { error: "Too many backup requests. Please try again later." },
    };
  }

  try {
    const storage = getBackupStorageProvider();
    const uploadToken = await storage.createUploadToken({
      pathname: blobPath(input.username),
      allowedContentTypes: ["application/gzip", "application/octet-stream"],
      maximumSizeInBytes: MAX_BACKUP_SIZE,
    });
    return { status: 200, body: uploadToken };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      status: 500,
      body: { error: `Failed to generate upload token: ${message}` },
    };
  }
}
