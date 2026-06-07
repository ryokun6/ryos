import * as RateLimit from "../../_utils/_rate-limit.js";
import { getClientIp } from "../../_utils/_rate-limit.js";
import {
  getSong,
  saveSong,
  deleteSong,
  saveTranslation,
  canModifySong,
  type LyricsSource,
  type LyricsContent,
} from "../../_utils/_song-service.js";
import {
  UpdateSongSchema,
  ClearCachedDataSchema,
  UnshareSongSchema,
} from "../_constants.js";
import { parseLyricsContent, buildChineseTranslationFromKrc, isChineseTraditional, streamTranslation } from "../_lyrics.js";
import { normalizeFuriganaSegments } from "../_furigana.js";
import { msToLrcTime } from "../_utils.js";
import { RATE_LIMITS, type SongHandlerContext } from "./_context.js";

export async function handleGetMetadata(ctx: SongHandlerContext): Promise<void> {
  const { req, redis, logger, startTime, songId, jsonResponse, errorResponse } = ctx;

  const ip = getClientIp(req);
  const rlKey = RateLimit.makeKey(["rl", "song", "get", "ip", ip]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: RATE_LIMITS.get.windowSeconds,
    limit: RATE_LIMITS.get.limit,
  });

  if (!rlResult.allowed) {
    logger.warn("Rate limit exceeded (get)", { ip });
    jsonResponse(
      {
        error: "rate_limit_exceeded",
        limit: rlResult.limit,
        retryAfter: rlResult.resetSeconds,
      },
      429,
      { "Retry-After": String(rlResult.resetSeconds) }
    );
    return;
  }

  const includeParam = (req.query.include as string) || "metadata";
  const includes = includeParam.split(",").map((s) => s.trim());
  const includeSet = new Set(includes);

  logger.info("GET song", { songId, includes });

  const song = await getSong(redis, songId, {
    includeMetadata: includeSet.has("metadata"),
    includeLyrics: includeSet.has("lyrics"),
    includeTranslations: includeSet.has("translations"),
    includeFurigana: includeSet.has("furigana"),
    includeSoramimi: includeSet.has("soramimi"),
  });

  if (!song) {
    logger.warn("Song not found", { songId });
    errorResponse("Song not found", 404);
    return;
  }

  if (song.lyrics) {
    (song.lyrics as LyricsContent & { parsedLines?: unknown }).parsedLines = parseLyricsContent(
      { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
      song.lyricsSource?.title || song.title,
      song.lyricsSource?.artist || song.artist
    );
  }

  if (song.furigana) {
    song.furigana = song.furigana.map((segments) => normalizeFuriganaSegments(segments));
  }

  logger.info(`Response: 200 OK`, {
    hasLyrics: !!song.lyrics,
    hasTranslations: !!song.translations,
    hasFurigana: !!song.furigana,
    hasSoramimi: !!song.soramimi || !!song.soramimiByLang,
    duration: `${Date.now() - startTime}ms`,
  });
  jsonResponse(song);
}

export async function handleTranslate(
  ctx: SongHandlerContext,
  bodyObj: Record<string, unknown>
): Promise<void> {
  const { redis, songId, requestId, user, jsonResponse, errorResponse, logger } = ctx;
  const username = user?.username || null;

  const language =
    typeof bodyObj?.language === "string" ? (bodyObj.language as string).trim() : "";
  const force = bodyObj?.force === true;

  if (!language) {
    errorResponse("Invalid request body", 400);
    return;
  }

  const song = await getSong(redis, songId, {
    includeMetadata: true,
    includeLyrics: true,
    includeTranslations: [language],
  });

  if (!song) {
    errorResponse("Song not found", 404);
    return;
  }

  if (!song.lyrics?.lrc) {
    errorResponse("Song has no lyrics", 404);
    return;
  }

  if (force && song.translations?.[language]) {
    if (!username) {
      errorResponse("Unauthorized - authentication required to force refresh translation", 401);
      return;
    }
    const permission = canModifySong(song, username);
    if (!permission.canModify) {
      errorResponse(permission.reason || "Only the song owner can force refresh", 403);
      return;
    }
  }

  const parsedLines = parseLyricsContent(
    { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
    song.lyricsSource?.title || song.title,
    song.lyricsSource?.artist || song.artist
  );

  if (parsedLines.length === 0) {
    errorResponse("Song has no lyrics", 404);
    return;
  }

  if (!force && song.translations?.[language]) {
    jsonResponse({
      translation: song.translations[language],
      cached: true,
    });
    return;
  }

  if (isChineseTraditional(language) && song.lyrics.krc) {
    const krcDerivedLrc = buildChineseTranslationFromKrc(
      song.lyrics,
      song.lyricsSource?.title || song.title,
      song.lyricsSource?.artist || song.artist
    );
    if (krcDerivedLrc) {
      await saveTranslation(redis, songId, language, krcDerivedLrc);
      logger.info("Using KRC-derived Traditional Chinese translation (non-stream)");
      jsonResponse({
        translation: krcDerivedLrc,
        cached: false,
      });
      return;
    }
  }

  const { translations, success } = await streamTranslation(
    parsedLines,
    language,
    requestId,
    () => {}
  );

  if (!success) {
    errorResponse("Failed to translate lyrics", 404);
    return;
  }

  const translatedLrc = parsedLines
    .map(
      (line, index) =>
        `${msToLrcTime(line.startTimeMs)}${translations[index] || line.words}`
    )
    .join("\n");

  await saveTranslation(redis, songId, language, translatedLrc);

  jsonResponse({
    translation: translatedLrc,
    cached: false,
  });
}

export async function handleClearCachedData(
  ctx: SongHandlerContext,
  bodyObj: Record<string, unknown>
): Promise<void> {
  const { redis, songId, jsonResponse, errorResponse, logger } = ctx;

  const parsed = ClearCachedDataSchema.safeParse(bodyObj);
  if (!parsed.success) {
    errorResponse("Invalid request body");
    return;
  }

  const {
    clearTranslations: shouldClearTranslations,
    clearFurigana: shouldClearFurigana,
    clearSoramimi: shouldClearSoramimi,
  } = parsed.data;

  const song = await getSong(redis, songId, {
    includeMetadata: true,
    includeLyrics: true,
    includeTranslations: true,
    includeFurigana: true,
    includeSoramimi: true,
  });

  if (!song) {
    errorResponse("Song not found", 404);
    return;
  }

  const cleared: string[] = [];

  if (shouldClearTranslations) {
    if (song.translations && Object.keys(song.translations).length > 0) {
      await saveSong(redis, { id: songId, translations: {} }, { preserveTranslations: false });
    }
    cleared.push("translations");
  }

  if (shouldClearFurigana) {
    if (song.furigana && song.furigana.length > 0) {
      await saveSong(redis, { id: songId, furigana: [] }, { preserveFurigana: false });
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
        { id: songId, soramimi: [], soramimiByLang: {} },
        { preserveSoramimi: false }
      );
    }
    cleared.push("soramimi");
  }

  logger.info(`Cleared cached data: ${cleared.length > 0 ? cleared.join(", ") : "nothing to clear"}`);
  jsonResponse({ success: true, cleared });
}

export async function handleUnshare(
  ctx: SongHandlerContext,
  bodyObj: Record<string, unknown>
): Promise<void> {
  const { redis, songId, user, startTime, jsonResponse, errorResponse, logger } = ctx;
  const username = user?.username || null;

  const parsed = UnshareSongSchema.safeParse(bodyObj);
  if (!parsed.success) {
    errorResponse("Invalid request body");
    return;
  }

  if (!username) {
    errorResponse("Unauthorized - authentication required", 401);
    return;
  }

  if (username?.toLowerCase() !== "ryo") {
    errorResponse("Forbidden - admin access required", 403);
    return;
  }

  const existingSong = await getSong(redis, songId, { includeMetadata: true });
  if (!existingSong) {
    errorResponse("Song not found", 404);
    return;
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

  logger.info("Song unshared (createdBy cleared)", { duration: `${Date.now() - startTime}ms` });
  jsonResponse({
    success: true,
    id: updatedSong.id,
    createdBy: updatedSong.createdBy,
  });
}

export async function handleUpdateMetadata(
  ctx: SongHandlerContext,
  bodyObj: Record<string, unknown>
): Promise<void> {
  const { redis, songId, user, startTime, jsonResponse, errorResponse, logger } = ctx;
  const username = user?.username || null;

  if (!username) {
    errorResponse("Unauthorized - authentication required", 401);
    return;
  }

  const parsed = UpdateSongSchema.safeParse(bodyObj);
  if (!parsed.success) {
    errorResponse("Invalid request body");
    return;
  }

  const existingSong = await getSong(redis, songId, { includeMetadata: true });
  const permission = canModifySong(existingSong, username);
  if (!permission.canModify) {
    errorResponse(permission.reason || "Permission denied", 403);
    return;
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
    const canSetCreatedBy = username?.toLowerCase() === "ryo" || !existingSong?.createdBy;
    if (canSetCreatedBy) {
      createdBy = username || undefined;
    }
  }

  const updateData: Parameters<typeof saveSong>[1] = {
    id: songId,
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

  logger.info(isUpdate ? "Song updated" : "Song created", {
    duration: `${Date.now() - startTime}ms`,
  });
  jsonResponse({
    success: true,
    id: updatedSong.id,
    isUpdate,
    createdBy: updatedSong.createdBy,
  });
}

export async function handleDeleteMetadata(ctx: SongHandlerContext): Promise<void> {
  const { redis, songId, user, startTime, jsonResponse, errorResponse, logger } = ctx;
  const username = user?.username || null;

  if (!username) {
    errorResponse("Unauthorized - authentication required", 401);
    return;
  }

  if (username?.toLowerCase() !== "ryo") {
    errorResponse("Forbidden - admin access required", 403);
    return;
  }

  const deleted = await deleteSong(redis, songId);
  if (!deleted) {
    errorResponse("Song not found", 404);
    return;
  }

  logger.info("Song deleted", { duration: `${Date.now() - startTime}ms` });
  jsonResponse({ success: true, deleted: true });
}
