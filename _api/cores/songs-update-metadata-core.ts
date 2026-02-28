import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import {
  getSong,
  saveSong,
  canModifySong,
  type LyricsSource,
} from "../_utils/_song-service.js";
import { UpdateSongSchema } from "../songs/_constants.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

interface SongsUpdateMetadataCoreInput {
  songId: string;
  body: unknown;
  username: string | null;
  authToken: string | null;
}

export async function executeSongsUpdateMetadataCore(
  input: SongsUpdateMetadataCoreInput
): Promise<CoreResponse> {
  const redis = createRedis();
  const authResult = await validateAuth(redis, input.username, input.authToken);
  if (!authResult.valid) {
    return { status: 401, body: { error: "Unauthorized - authentication required" } };
  }

  const parsed = UpdateSongSchema.safeParse(input.body);
  if (!parsed.success) {
    return { status: 400, body: { error: "Invalid request body" } };
  }

  const existingSong = await getSong(redis, input.songId, { includeMetadata: true });
  const permission = canModifySong(existingSong, input.username);
  if (!permission.canModify) {
    return { status: 403, body: { error: permission.reason || "Permission denied" } };
  }

  const isUpdate = !!existingSong;
  const {
    lyricsSource,
    clearTranslations,
    clearFurigana,
    clearSoramimi,
    clearLyrics,
    isShare,
    ...restData
  } = parsed.data;

  const preserveOptions = {
    preserveLyrics: !clearLyrics,
    preserveTranslations: !clearTranslations,
    preserveFurigana: !clearFurigana,
    preserveSoramimi: !clearSoramimi,
  };

  let createdBy = existingSong?.createdBy;
  if (isShare) {
    const canSetCreatedBy =
      input.username?.toLowerCase() === "ryo" || !existingSong?.createdBy;
    if (canSetCreatedBy) {
      createdBy = input.username || undefined;
    }
  }

  const updateData: Parameters<typeof saveSong>[1] = {
    id: input.songId,
    ...restData,
    lyricsSource: lyricsSource as LyricsSource | undefined,
    createdBy,
  };

  if (clearTranslations) {
    updateData.translations = undefined;
  }
  if (clearFurigana) {
    updateData.furigana = undefined;
  }
  if (clearSoramimi) {
    updateData.soramimi = undefined;
    updateData.soramimiByLang = undefined;
  }
  if (clearLyrics) {
    updateData.lyrics = undefined;
  }

  const updatedSong = await saveSong(redis, updateData, preserveOptions);
  return {
    status: 200,
    body: {
      success: true,
      id: updatedSong.id,
      isUpdate,
      createdBy: updatedSong.createdBy,
    },
  };
}
