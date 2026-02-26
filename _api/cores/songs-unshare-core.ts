import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import { getSong, saveSong } from "../_utils/_song-service.js";
import { UnshareSongSchema } from "../songs/_constants.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

interface SongsUnshareCoreInput {
  songId: string;
  body: unknown;
  username: string | null;
  authToken: string | null;
}

export async function executeSongsUnshareCore(
  input: SongsUnshareCoreInput
): Promise<CoreResponse> {
  const parsed = UnshareSongSchema.safeParse(input.body);
  if (!parsed.success) {
    return { status: 400, body: { error: "Invalid request body" } };
  }

  const redis = createRedis();
  const authResult = await validateAuth(redis, input.username, input.authToken);
  if (!authResult.valid) {
    return { status: 401, body: { error: "Unauthorized - authentication required" } };
  }

  if (input.username?.toLowerCase() !== "ryo") {
    return { status: 403, body: { error: "Forbidden - admin access required" } };
  }

  const existingSong = await getSong(redis, input.songId, { includeMetadata: true });
  if (!existingSong) {
    return { status: 404, body: { error: "Song not found" } };
  }

  const updatedSong = await saveSong(
    redis,
    {
      ...existingSong,
      createdBy: undefined,
    },
    { preserveLyrics: true, preserveTranslations: true, preserveFurigana: true },
    existingSong
  );

  return {
    status: 200,
    body: {
      success: true,
      id: updatedSong.id,
      createdBy: updatedSong.createdBy,
    },
  };
}
