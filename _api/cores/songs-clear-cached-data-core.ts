import { Redis } from "@upstash/redis";
import { getSong, saveSong } from "../_utils/_song-service.js";
import { ClearCachedDataSchema } from "../songs/_constants.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

interface SongsClearCachedDataCoreInput {
  songId: string;
  body: unknown;
}

export async function executeSongsClearCachedDataCore(
  input: SongsClearCachedDataCoreInput
): Promise<CoreResponse> {
  const parsed = ClearCachedDataSchema.safeParse(input.body);
  if (!parsed.success) {
    return { status: 400, body: { error: "Invalid request body" } };
  }

  const {
    clearTranslations: shouldClearTranslations,
    clearFurigana: shouldClearFurigana,
    clearSoramimi: shouldClearSoramimi,
  } = parsed.data;

  const redis = createRedis();
  const song = await getSong(redis, input.songId, {
    includeMetadata: true,
    includeLyrics: true,
    includeTranslations: true,
    includeFurigana: true,
    includeSoramimi: true,
  });

  if (!song) {
    return { status: 404, body: { error: "Song not found" } };
  }

  const cleared: string[] = [];

  if (shouldClearTranslations) {
    if (song.translations && Object.keys(song.translations).length > 0) {
      await saveSong(
        redis,
        { id: input.songId, translations: {} },
        { preserveTranslations: false }
      );
    }
    cleared.push("translations");
  }

  if (shouldClearFurigana) {
    if (song.furigana && song.furigana.length > 0) {
      await saveSong(redis, { id: input.songId, furigana: [] }, { preserveFurigana: false });
    }
    cleared.push("furigana");
  }

  if (shouldClearSoramimi) {
    const hasSoramimi =
      (song.soramimi && song.soramimi.length > 0) ||
      (song.soramimiByLang && Object.keys(song.soramimiByLang).length > 0);
    if (hasSoramimi) {
      await saveSong(
        redis,
        { id: input.songId, soramimi: [], soramimiByLang: {} },
        { preserveSoramimi: false }
      );
    }
    cleared.push("soramimi");
  }

  return {
    status: 200,
    body: {
      success: true,
      cleared,
      _meta: { clearedCount: cleared.length },
    },
  };
}
