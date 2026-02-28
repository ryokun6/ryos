import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import { deleteSong } from "../_utils/_song-service.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

interface SongsDeleteCoreInput {
  songId: string;
  authHeader: string | undefined;
  usernameHeader: string | undefined;
}

export async function executeSongsDeleteCore(
  input: SongsDeleteCoreInput
): Promise<CoreResponse> {
  const redis = createRedis();
  const authToken =
    input.authHeader && input.authHeader.startsWith("Bearer ")
      ? input.authHeader.slice(7)
      : null;
  const username = input.usernameHeader || null;

  const authResult = await validateAuth(redis, username, authToken);
  if (!authResult.valid) {
    return { status: 401, body: { error: "Unauthorized - authentication required" } };
  }

  if (username?.toLowerCase() !== "ryo") {
    return { status: 403, body: { error: "Forbidden - admin access required" } };
  }

  const deleted = await deleteSong(redis, input.songId);
  if (!deleted) {
    return { status: 404, body: { error: "Song not found" } };
  }

  return { status: 200, body: { success: true, deleted: true } };
}
