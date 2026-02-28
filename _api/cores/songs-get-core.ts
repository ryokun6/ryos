import { Redis } from "@upstash/redis";
import * as RateLimit from "../_utils/_rate-limit.js";
import {
  getSong,
  type LyricsContent,
} from "../_utils/_song-service.js";
import { parseLyricsContent } from "../songs/_lyrics.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

const RATE_LIMIT_GET = { windowSeconds: 60, limit: 300 };

interface SongsGetCoreInput {
  songId: string;
  includeParam: string;
  clientIp: string;
}

export async function executeSongsGetCore(
  input: SongsGetCoreInput
): Promise<CoreResponse> {
  const redis = createRedis();

  const rlKey = RateLimit.makeKey(["rl", "song", "get", "ip", input.clientIp]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: RATE_LIMIT_GET.windowSeconds,
    limit: RATE_LIMIT_GET.limit,
  });

  if (!rlResult.allowed) {
    return {
      status: 429,
      headers: { "Retry-After": String(rlResult.resetSeconds) },
      body: {
        error: "rate_limit_exceeded",
        limit: rlResult.limit,
        retryAfter: rlResult.resetSeconds,
      },
    };
  }

  const includes = input.includeParam.split(",").map((s) => s.trim());

  const song = await getSong(redis, input.songId, {
    includeMetadata: includes.includes("metadata"),
    includeLyrics: includes.includes("lyrics"),
    includeTranslations: includes.includes("translations"),
    includeFurigana: includes.includes("furigana"),
    includeSoramimi: includes.includes("soramimi"),
  });

  if (!song) {
    return { status: 404, body: { error: "Song not found" } };
  }

  if (song.lyrics) {
    (song.lyrics as LyricsContent & { parsedLines?: unknown }).parsedLines = parseLyricsContent(
      { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
      song.lyricsSource?.title || song.title,
      song.lyricsSource?.artist || song.artist
    );
  }

  return { status: 200, body: song };
}
