import { Redis } from "@upstash/redis";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getSong } from "../_utils/_song-service.js";
import { SearchLyricsSchema } from "../songs/_constants.js";
import { stripParentheses, parseYouTubeTitleWithAI } from "../songs/_utils.js";
import { searchKugou } from "../songs/_kugou.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

const SEARCH_RATE_LIMIT = { windowSeconds: 60, limit: 60 };

interface SongsSearchLyricsCoreInput {
  songId: string;
  body: unknown;
  requestIp: string;
  requestId: string;
}

export async function executeSongsSearchLyricsCore(
  input: SongsSearchLyricsCoreInput
): Promise<CoreResponse> {
  const redis = createRedis();

  const rlKey = RateLimit.makeKey(["rl", "song", "search-lyrics", "ip", input.requestIp]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: SEARCH_RATE_LIMIT.windowSeconds,
    limit: SEARCH_RATE_LIMIT.limit,
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

  const parsed = SearchLyricsSchema.safeParse(input.body);
  if (!parsed.success) {
    return { status: 400, body: { error: "Invalid request body" } };
  }

  const song = await getSong(redis, input.songId, { includeMetadata: true });
  const rawTitle = song?.title || "";
  const rawArtist = song?.artist || "";

  let query = parsed.data.query;
  let searchTitle = rawTitle;
  let searchArtist = rawArtist;

  if (!query && rawTitle) {
    if (!rawArtist) {
      const aiParsed = await parseYouTubeTitleWithAI(rawTitle, rawArtist, input.requestId);
      searchTitle = aiParsed.title || rawTitle;
      searchArtist = aiParsed.artist || rawArtist;
    }
    query = `${stripParentheses(searchTitle)} ${stripParentheses(searchArtist)}`.trim();
  } else if (!query) {
    query = `${stripParentheses(rawTitle)} ${stripParentheses(rawArtist)}`.trim();
  }

  if (!query) {
    return { status: 400, body: { error: "Search query is required" } };
  }

  const results = await searchKugou(query, searchTitle, searchArtist);
  return {
    status: 200,
    body: {
      results,
      _meta: { query, count: results.length },
    },
  };
}
