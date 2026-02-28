import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import {
  getSong,
  saveLyrics,
  saveTranslation,
  canModifySong,
  type LyricsSource,
  type LyricsContent,
} from "../_utils/_song-service.js";
import { FetchLyricsSchema } from "../songs/_constants.js";
import { parseYouTubeTitleWithAI, stripParentheses } from "../songs/_utils.js";
import { searchKugou, fetchLyricsFromKugou, fetchCoverUrl } from "../songs/_kugou.js";
import {
  parseLyricsContent,
  isChineseTraditional,
  buildChineseTranslationFromKrc,
} from "../songs/_lyrics.js";
import { lyricsAreMostlyChinese } from "../songs/_furigana.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

const FETCH_LYRICS_RATE_LIMIT = { windowSeconds: 60, limit: 30 };

interface SongsFetchLyricsCoreInput {
  songId: string;
  body: unknown;
  username: string | null;
  authToken: string | null;
  requestId: string;
  rateLimitUser: string;
}

export async function executeSongsFetchLyricsCore(
  input: SongsFetchLyricsCoreInput
): Promise<CoreResponse> {
  const redis = createRedis();

  const rlKey = RateLimit.makeKey(["rl", "song", "fetch-lyrics", "user", input.rateLimitUser]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: FETCH_LYRICS_RATE_LIMIT.windowSeconds,
    limit: FETCH_LYRICS_RATE_LIMIT.limit,
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

  const parsed = FetchLyricsSchema.safeParse(input.body);
  if (!parsed.success) {
    return { status: 400, body: { error: "Invalid request body" } };
  }

  const force = parsed.data.force || false;
  let lyricsSource: LyricsSource | undefined = parsed.data.lyricsSource as LyricsSource | undefined;

  const clientTitle = parsed.data.title;
  const clientArtist = parsed.data.artist;
  const returnMetadata = parsed.data.returnMetadata;
  const translateTo = parsed.data.translateTo;
  const includeFurigana = parsed.data.includeFurigana;
  const includeSoramimi = parsed.data.includeSoramimi;
  const soramimiTargetLanguage = parsed.data.soramimiTargetLanguage || "zh-TW";

  const song = await getSong(redis, input.songId, {
    includeMetadata: true,
    includeLyrics: true,
    includeTranslations: translateTo ? [translateTo] : undefined,
    includeFurigana: includeFurigana,
    includeSoramimi: includeSoramimi,
  });

  if (!lyricsSource && song?.lyricsSource) {
    lyricsSource = song.lyricsSource;
  }

  const lyricsSourceChanged =
    lyricsSource?.hash && song?.lyricsSource?.hash && lyricsSource.hash !== song.lyricsSource.hash;

  if ((force || lyricsSourceChanged) && song?.lyricsSource) {
    const isPublicSong = !song.createdBy;
    const allowAnonymousRefresh = isPublicSong && !input.username && !input.authToken;
    if (!allowAnonymousRefresh) {
      if (!input.username || !input.authToken) {
        return {
          status: 401,
          body: {
            error:
              "Unauthorized - authentication required to change lyrics source or force refresh",
          },
        };
      }
      const authResult = await validateAuth(redis, input.username, input.authToken);
      if (!authResult.valid) {
        return { status: 401, body: { error: "Unauthorized - invalid credentials" } };
      }
      const permission = canModifySong(song, input.username);
      if (!permission.canModify) {
        return {
          status: 403,
          body: {
            error: permission.reason || "Only the song owner can change lyrics source",
          },
        };
      }
    }
  }

  if (!force && !lyricsSourceChanged && song?.lyrics?.lrc) {
    const parsedLines = parseLyricsContent(
      { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
      song.lyricsSource?.title || song.title,
      song.lyricsSource?.artist || song.artist
    );

    if (!song.cover && song.lyricsSource?.hash && song.lyricsSource?.albumId) {
      const coverSource = song.lyricsSource;
      fetchCoverUrl(coverSource.hash, coverSource.albumId)
        .then(async (cover) => {
          if (cover) {
            await saveLyrics(redis, input.songId, song.lyrics!, song.lyricsSource, cover);
          }
        })
        .catch(() => {});
    }

    const response: Record<string, unknown> = {
      lyrics: {
        lrc: song.lyrics.lrc,
        krc: song.lyrics.krc,
        parsedLines,
      },
      cached: true,
    };

    if (translateTo && parsedLines.length > 0) {
      const totalLines = parsedLines.length;
      let hasTranslation = !!song.translations?.[translateTo];
      let translationLrc = hasTranslation ? song.translations![translateTo] : undefined;

      if (!hasTranslation && isChineseTraditional(translateTo) && song.lyrics.krc) {
        const krcDerivedLrc = buildChineseTranslationFromKrc(
          song.lyrics,
          song.lyricsSource?.title || song.title,
          song.lyricsSource?.artist || song.artist
        );
        if (krcDerivedLrc) {
          hasTranslation = true;
          translationLrc = krcDerivedLrc;
          await saveTranslation(redis, input.songId, translateTo, krcDerivedLrc);
        }
      }

      response.translation = {
        totalLines,
        cached: hasTranslation,
        ...(translationLrc ? { lrc: translationLrc } : {}),
      };
    }

    if (includeFurigana && parsedLines.length > 0) {
      const totalLines = parsedLines.length;
      const hasFurigana = !!(song.furigana && song.furigana.length > 0);
      response.furigana = {
        totalLines,
        cached: hasFurigana,
        ...(hasFurigana ? { data: song.furigana } : {}),
      };
    }

    if (includeSoramimi && parsedLines.length > 0) {
      const totalLines = parsedLines.length;
      const shouldSkipChineseSoramimi =
        soramimiTargetLanguage === "zh-TW" && lyricsAreMostlyChinese(parsedLines);

      if (shouldSkipChineseSoramimi) {
        response.soramimi = {
          totalLines,
          cached: false,
          targetLanguage: soramimiTargetLanguage,
          skipped: true,
          skipReason: "chinese_lyrics",
        };
      } else {
        const cachedSoramimiData =
          song.soramimiByLang?.[soramimiTargetLanguage] ??
          (soramimiTargetLanguage === "zh-TW" ? song.soramimi : undefined);
        const hasSoramimi = !!(cachedSoramimiData && cachedSoramimiData.length > 0);

        response.soramimi = {
          totalLines,
          cached: hasSoramimi,
          targetLanguage: soramimiTargetLanguage,
          ...(hasSoramimi ? { data: cachedSoramimiData } : {}),
        };
      }
    }

    if (returnMetadata) {
      response.metadata = {
        title: song.lyricsSource?.title || song.title,
        artist: song.lyricsSource?.artist || song.artist,
        album: song.lyricsSource?.album || song.album,
        cover: song.cover,
        lyricsSource: song.lyricsSource,
      };
    }

    return {
      status: 200,
      body: {
        ...response,
        _meta: {
          parsedLinesCount: parsedLines.length,
          cached: true,
          lyricsSourceChanged: !!lyricsSourceChanged,
        },
      },
    };
  }

  const rawTitle = song?.title || clientTitle || "";
  const rawArtist = song?.artist || clientArtist || "";

  if (!lyricsSource && rawTitle) {
    let searchTitle = rawTitle;
    let searchArtist = rawArtist;

    if (!rawArtist) {
      const aiParsed = await parseYouTubeTitleWithAI(rawTitle, rawArtist, input.requestId);
      searchTitle = aiParsed.title || rawTitle;
      searchArtist = aiParsed.artist || rawArtist;
    }

    const query = `${stripParentheses(searchTitle)} ${stripParentheses(searchArtist)}`.trim();
    const results = await searchKugou(query, searchTitle, searchArtist);
    if (results.length > 0) {
      lyricsSource = {
        hash: results[0].hash,
        albumId: results[0].albumId,
        title: results[0].title,
        artist: results[0].artist,
        album: results[0].album,
      };
    }
  }

  if (!lyricsSource) {
    return { status: 400, body: { error: "No lyrics source available" } };
  }

  const kugouResult = await fetchLyricsFromKugou(lyricsSource, input.requestId);
  if (!kugouResult) {
    return { status: 404, body: { error: "Failed to fetch lyrics" } };
  }

  const parsedLines = parseLyricsContent(
    { lrc: kugouResult.lyrics.lrc, krc: kugouResult.lyrics.krc },
    lyricsSource.title,
    lyricsSource.artist
  );

  const lyrics: LyricsContent = kugouResult.lyrics;
  const shouldClearAnnotations = force || lyricsSourceChanged;
  const savedSong = await saveLyrics(
    redis,
    input.songId,
    lyrics,
    lyricsSource,
    kugouResult.cover,
    shouldClearAnnotations
  );

  const response: Record<string, unknown> = {
    lyrics: {
      lrc: lyrics.lrc,
      krc: lyrics.krc,
      parsedLines,
    },
    cached: false,
  };

  if (translateTo) {
    const totalLines = parsedLines.length;
    let hasTranslation = false;
    let translationLrc: string | undefined;

    if (isChineseTraditional(translateTo) && lyrics.krc) {
      const krcDerivedLrc = buildChineseTranslationFromKrc(
        lyrics,
        lyricsSource.title,
        lyricsSource.artist
      );
      if (krcDerivedLrc) {
        hasTranslation = true;
        translationLrc = krcDerivedLrc;
        await saveTranslation(redis, input.songId, translateTo, krcDerivedLrc);
      }
    }

    response.translation = {
      totalLines,
      cached: hasTranslation,
      ...(translationLrc ? { lrc: translationLrc } : {}),
    };
  }

  if (includeFurigana) {
    response.furigana = {
      totalLines: parsedLines.length,
      cached: false,
    };
  }

  if (includeSoramimi) {
    const shouldSkipChineseSoramimi =
      soramimiTargetLanguage === "zh-TW" && lyricsAreMostlyChinese(parsedLines);
    response.soramimi = {
      totalLines: parsedLines.length,
      cached: false,
      targetLanguage: soramimiTargetLanguage,
      ...(shouldSkipChineseSoramimi ? { skipped: true, skipReason: "chinese_lyrics" } : {}),
    };
  }

  if (returnMetadata) {
    response.metadata = {
      title: savedSong.title,
      artist: savedSong.artist,
      album: savedSong.album,
      cover: savedSong.cover,
      lyricsSource: savedSong.lyricsSource,
    };
  }

  return {
    status: 200,
    body: {
      ...response,
      _meta: {
        parsedLinesCount: parsedLines.length,
        cached: false,
        lyricsSourceChanged: !!lyricsSourceChanged,
      },
    },
  };
}
