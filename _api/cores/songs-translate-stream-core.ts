import { Redis } from "@upstash/redis";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { validateAuth } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getSong, canModifySong, saveTranslation } from "../_utils/_song-service.js";
import { TranslateStreamSchema } from "../songs/_constants.js";
import {
  parseLyricsContent,
  isChineseTraditional,
  buildChineseTranslationFromKrc,
  getTranslationSystemPrompt,
} from "../songs/_lyrics.js";
import { msToLrcTime, type LyricLine } from "../songs/_utils.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

const TRANSLATE_STREAM_RATE_LIMIT = { windowSeconds: 60, limit: 10 };

type TranslateStreamEmitFn = (eventType: string, data: Record<string, unknown>) => void;

export type SongsTranslateStreamCoreResult =
  | { kind: "response"; response: CoreResponse }
  | { kind: "cached"; payload: { type: "cached"; translation: string } }
  | { kind: "stream"; totalLines: number; run: (emit: TranslateStreamEmitFn) => Promise<void> };

interface SongsTranslateStreamCoreInput {
  songId: string;
  body: unknown;
  username: string | null;
  authToken: string | null;
  rateLimitUser: string;
}

export async function executeSongsTranslateStreamCore(
  input: SongsTranslateStreamCoreInput
): Promise<SongsTranslateStreamCoreResult> {
  const redis = createRedis();

  const rlKey = RateLimit.makeKey([
    "rl",
    "song",
    "translate-stream",
    "user",
    input.rateLimitUser,
  ]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: TRANSLATE_STREAM_RATE_LIMIT.windowSeconds,
    limit: TRANSLATE_STREAM_RATE_LIMIT.limit,
  });

  if (!rlResult.allowed) {
    return {
      kind: "response",
      response: {
        status: 429,
        headers: { "Retry-After": String(rlResult.resetSeconds) },
        body: {
          error: "rate_limit_exceeded",
          limit: rlResult.limit,
          retryAfter: rlResult.resetSeconds,
        },
      },
    };
  }

  const parsed = TranslateStreamSchema.safeParse(input.body);
  if (!parsed.success) {
    return {
      kind: "response",
      response: { status: 400, body: { error: "Invalid request body" } },
    };
  }

  const { language, force } = parsed.data;

  const song = await getSong(redis, input.songId, {
    includeMetadata: true,
    includeLyrics: true,
    includeTranslations: [language],
  });

  if (!song?.lyrics?.lrc) {
    return {
      kind: "response",
      response: { status: 404, body: { error: "Song has no lyrics" } },
    };
  }

  if (force && song.translations?.[language]) {
    if (!input.username || !input.authToken) {
      return {
        kind: "response",
        response: {
          status: 401,
          body: {
            error: "Unauthorized - authentication required to force refresh translation",
          },
        },
      };
    }
    const authResult = await validateAuth(redis, input.username, input.authToken);
    if (!authResult.valid) {
      return {
        kind: "response",
        response: { status: 401, body: { error: "Unauthorized - invalid credentials" } },
      };
    }
    const permission = canModifySong(song, input.username);
    if (!permission.canModify) {
      return {
        kind: "response",
        response: {
          status: 403,
          body: { error: permission.reason || "Only the song owner can force refresh" },
        },
      };
    }
  }

  const parsedLines = parseLyricsContent(
    { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
    song.lyricsSource?.title || song.title,
    song.lyricsSource?.artist || song.artist
  );

  if (!force && song.translations?.[language]) {
    return {
      kind: "cached",
      payload: {
        type: "cached",
        translation: song.translations[language],
      },
    };
  }

  if (isChineseTraditional(language) && song.lyrics?.krc) {
    const krcDerivedLrc = buildChineseTranslationFromKrc(
      song.lyrics,
      song.lyricsSource?.title || song.title,
      song.lyricsSource?.artist || song.artist
    );
    if (krcDerivedLrc) {
      await saveTranslation(redis, input.songId, language, krcDerivedLrc);
      return {
        kind: "cached",
        payload: {
          type: "cached",
          translation: krcDerivedLrc,
        },
      };
    }
  }

  const lines: LyricLine[] = parsedLines.map((line) => ({
    words: line.words,
    startTimeMs: line.startTimeMs,
  }));
  const textsToProcess = lines.map((line, i) => `${i + 1}: ${line.words}`).join("\n");
  const totalLines = parsedLines.length;

  return {
    kind: "stream",
    totalLines,
    run: async (emit) => {
      const allTranslations: string[] = new Array(totalLines).fill("");
      let completedLines = 0;
      let currentLineBuffer = "";

      emit("start", { totalLines, message: "Translation started" });

      const processLine = (line: string) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;
        const match = trimmedLine.match(/^(\d+)[:.\s]\s*(.*)$/);
        if (match) {
          const lineIndex = parseInt(match[1], 10) - 1;
          const translation = match[2].trim();
          if (lineIndex >= 0 && lineIndex < totalLines && translation) {
            allTranslations[lineIndex] = translation;
            completedLines++;
            emit("line", {
              lineIndex,
              translation,
              progress: Math.round((completedLines / totalLines) * 100),
            });
          }
        }
      };

      try {
        const result = streamText({
          model: openai("gpt-5.2"),
          messages: [
            { role: "system", content: getTranslationSystemPrompt(language) },
            { role: "user", content: textsToProcess },
          ],
          temperature: 0.3,
        });

        for await (const textChunk of result.textStream) {
          currentLineBuffer += textChunk;
          let newlineIdx;
          while ((newlineIdx = currentLineBuffer.indexOf("\n")) !== -1) {
            const completeLine = currentLineBuffer.slice(0, newlineIdx);
            currentLineBuffer = currentLineBuffer.slice(newlineIdx + 1);
            processLine(completeLine);
          }
        }

        if (currentLineBuffer.trim()) {
          processLine(currentLineBuffer);
        }

        for (let i = 0; i < totalLines; i++) {
          if (!allTranslations[i]) {
            allTranslations[i] = lines[i].words;
          }
        }

        try {
          const translatedLrc = parsedLines
            .map(
              (line, index) =>
                `${msToLrcTime(line.startTimeMs)}${allTranslations[index] || line.words}`
            )
            .join("\n");
          await saveTranslation(redis, input.songId, language, translatedLrc);
        } catch {
          // keep stream success even if cache write fails
        }

        emit("complete", {
          totalLines,
          successCount: completedLines,
          translations: allTranslations,
          success: true,
        });
      } catch (err) {
        emit("error", {
          error: err instanceof Error ? err.message : "Translation failed",
        });
      }
    },
  };
}
