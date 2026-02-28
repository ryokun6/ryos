import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import { getSong, canModifySong, saveTranslation } from "../_utils/_song-service.js";
import { parseLyricsContent, isChineseTraditional, buildChineseTranslationFromKrc, streamTranslation } from "../songs/_lyrics.js";
import { msToLrcTime } from "../songs/_utils.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

interface SongsTranslateCoreInput {
  songId: string;
  body: unknown;
  username: string | null;
  authToken: string | null;
  requestId: string;
}

export async function executeSongsTranslateCore(
  input: SongsTranslateCoreInput
): Promise<CoreResponse> {
  const bodyObj = (input.body || {}) as Record<string, unknown>;
  const language =
    typeof bodyObj?.language === "string" ? (bodyObj.language as string).trim() : "";
  const force = bodyObj?.force === true;

  if (!language) {
    return { status: 400, body: { error: "Invalid request body" } };
  }

  const redis = createRedis();
  const song = await getSong(redis, input.songId, {
    includeMetadata: true,
    includeLyrics: true,
    includeTranslations: [language],
  });

  if (!song) {
    return { status: 404, body: { error: "Song not found" } };
  }

  if (!song.lyrics?.lrc) {
    return { status: 404, body: { error: "Song has no lyrics" } };
  }

  if (force && song.translations?.[language]) {
    if (!input.username || !input.authToken) {
      return {
        status: 401,
        body: {
          error: "Unauthorized - authentication required to force refresh translation",
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
        body: { error: permission.reason || "Only the song owner can force refresh" },
      };
    }
  }

  const parsedLines = parseLyricsContent(
    { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
    song.lyricsSource?.title || song.title,
    song.lyricsSource?.artist || song.artist
  );

  if (parsedLines.length === 0) {
    return { status: 404, body: { error: "Song has no lyrics" } };
  }

  if (!force && song.translations?.[language]) {
    return {
      status: 200,
      body: {
        translation: song.translations[language],
        cached: true,
      },
    };
  }

  if (isChineseTraditional(language) && song.lyrics.krc) {
    const krcDerivedLrc = buildChineseTranslationFromKrc(
      song.lyrics,
      song.lyricsSource?.title || song.title,
      song.lyricsSource?.artist || song.artist
    );
    if (krcDerivedLrc) {
      await saveTranslation(redis, input.songId, language, krcDerivedLrc);
      return {
        status: 200,
        body: {
          translation: krcDerivedLrc,
          cached: false,
          _meta: { translationMode: "krc-derived" },
        },
      };
    }
  }

  const { translations, success } = await streamTranslation(
    parsedLines,
    language,
    input.requestId,
    () => {}
  );

  if (!success) {
    return { status: 404, body: { error: "Failed to translate lyrics" } };
  }

  const translatedLrc = parsedLines
    .map(
      (line, index) =>
        `${msToLrcTime(line.startTimeMs)}${translations[index] || line.words}`
    )
    .join("\n");

  await saveTranslation(redis, input.songId, language, translatedLrc);

  return {
    status: 200,
    body: {
      translation: translatedLrc,
      cached: false,
      _meta: { translationMode: "ai-streamed" },
    },
  };
}
