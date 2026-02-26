import { Redis } from "@upstash/redis";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { validateAuth } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getSong, canModifySong, saveSoramimi } from "../_utils/_song-service.js";
import { SoramimiStreamSchema } from "../songs/_constants.js";
import { parseLyricsContent } from "../songs/_lyrics.js";
import { lyricsAreMostlyChinese } from "../songs/_furigana.js";
import {
  SORAMIMI_SYSTEM_PROMPT,
  SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT,
  SORAMIMI_ENGLISH_SYSTEM_PROMPT,
  SORAMIMI_ENGLISH_WITH_FURIGANA_PROMPT,
  convertLinesToAnnotatedText,
  parseSoramimiRubyMarkup,
  fillMissingReadings,
  cleanSoramimiReading,
} from "../songs/_soramimi.js";
import type { LyricLine } from "../songs/_utils.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

const SORAMIMI_STREAM_RATE_LIMIT = { windowSeconds: 60, limit: 10 };

type SoramimiEmitFn = (eventType: string, data: Record<string, unknown>) => void;

export type SongsSoramimiStreamCoreResult =
  | { kind: "response"; response: CoreResponse }
  | {
      kind: "cached";
      payload: { type: "cached"; soramimi: Array<Array<{ text: string; reading?: string }>> };
    }
  | {
      kind: "stream";
      totalLines: number;
      targetLanguage: string;
      hasFuriganaData: boolean;
      run: (emit: SoramimiEmitFn) => Promise<void>;
    };

interface SongsSoramimiStreamCoreInput {
  songId: string;
  body: unknown;
  username: string | null;
  authToken: string | null;
  rateLimitUser: string;
}

const englishLinePattern = /^[a-zA-Z0-9\s.,!?'"()\-:;]+$/;
const containsKoreanOrJapanesePattern = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u309F\u30A0-\u30FF]/;

export async function executeSongsSoramimiStreamCore(
  input: SongsSoramimiStreamCoreInput
): Promise<SongsSoramimiStreamCoreResult> {
  const redis = createRedis();

  const rlKey = RateLimit.makeKey(["rl", "song", "soramimi-stream", "user", input.rateLimitUser]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: SORAMIMI_STREAM_RATE_LIMIT.windowSeconds,
    limit: SORAMIMI_STREAM_RATE_LIMIT.limit,
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

  const parsed = SoramimiStreamSchema.safeParse(input.body);
  if (!parsed.success) {
    return {
      kind: "response",
      response: { status: 400, body: { error: "Invalid request body" } },
    };
  }

  const { force, furigana: clientFurigana, targetLanguage = "zh-TW" } = parsed.data;
  const song = await getSong(redis, input.songId, {
    includeMetadata: true,
    includeLyrics: true,
    includeSoramimi: true,
  });

  if (!song?.lyrics?.lrc) {
    return {
      kind: "response",
      response: { status: 404, body: { error: "Song has no lyrics" } },
    };
  }

  const existingSoramimi =
    song.soramimiByLang?.[targetLanguage] ??
    (targetLanguage === "zh-TW" ? song.soramimi : undefined);
  if (force && existingSoramimi && existingSoramimi.length > 0) {
    if (!input.username || !input.authToken) {
      return {
        kind: "response",
        response: {
          status: 401,
          body: { error: "Unauthorized - authentication required to force refresh soramimi" },
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

  const parsedLinesSoramimi = parseLyricsContent(
    { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
    song.lyricsSource?.title || song.title,
    song.lyricsSource?.artist || song.artist
  );

  if (targetLanguage === "zh-TW" && lyricsAreMostlyChinese(parsedLinesSoramimi)) {
    return {
      kind: "response",
      response: {
        status: 200,
        body: {
          skipped: true,
          skipReason: "chinese_lyrics",
        },
      },
    };
  }

  const cachedSoramimi =
    song.soramimiByLang?.[targetLanguage] ??
    (targetLanguage === "zh-TW" ? song.soramimi : undefined);

  if (!force && cachedSoramimi && cachedSoramimi.length > 0) {
    const cleanedSoramimi = cachedSoramimi.map((lineSegments) =>
      lineSegments
        .map((seg) => {
          if (seg.reading && targetLanguage === "zh-TW") {
            const cleanedReading = cleanSoramimiReading(seg.reading);
            return cleanedReading ? { ...seg, reading: cleanedReading } : { text: seg.text };
          }
          return seg;
        })
        .filter((seg) => {
          if (seg.reading) return true;
          return !containsKoreanOrJapanesePattern.test(seg.text);
        })
    );
    return {
      kind: "cached",
      payload: {
        type: "cached",
        soramimi: cleanedSoramimi,
      },
    };
  }

  const lines: LyricLine[] = parsedLinesSoramimi.map((line) => ({
    words: line.words,
    startTimeMs: line.startTimeMs,
    wordTimings: line.wordTimings,
  }));
  const nonEnglishLines: { line: LyricLine; originalIndex: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.words.trim();
    if (!text) continue;
    if (!englishLinePattern.test(text)) {
      nonEnglishLines.push({ line, originalIndex: i });
    }
  }

  const hasFuriganaData =
    !!clientFurigana &&
    clientFurigana.length > 0 &&
    clientFurigana.some((line) => line.some((seg) => seg.reading));

  const isEnglishOutput = targetLanguage === "en";
  let textsToProcess: string;
  let systemPrompt: string;

  if (hasFuriganaData) {
    const annotatedLines = convertLinesToAnnotatedText(lines, clientFurigana);
    textsToProcess = nonEnglishLines
      .map((info, idx) => `${idx + 1}: ${annotatedLines[info.originalIndex]}`)
      .join("\n");
    systemPrompt = isEnglishOutput
      ? SORAMIMI_ENGLISH_WITH_FURIGANA_PROMPT
      : SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT;
  } else {
    textsToProcess = nonEnglishLines
      .map((info, idx) => {
        const wordTimings = info.line.wordTimings;
        if (wordTimings && wordTimings.length > 0) {
          const wordsMarked = wordTimings.map((w) => w.text).join("|");
          return `${idx + 1}: ${wordsMarked}`;
        }
        return `${idx + 1}: ${info.line.words}`;
      })
      .join("\n");
    systemPrompt = isEnglishOutput ? SORAMIMI_ENGLISH_SYSTEM_PROMPT : SORAMIMI_SYSTEM_PROMPT;
  }

  const totalLines = parsedLinesSoramimi.length;

  return {
    kind: "stream",
    totalLines,
    targetLanguage,
    hasFuriganaData,
    run: async (emit) => {
      const allSoramimi: Array<Array<{ text: string; reading?: string }>> = new Array(totalLines)
        .fill(null)
        .map(() => []);
      let completedLines = 0;
      let currentLineBuffer = "";

      emit("start", { totalLines, message: "AI processing started" });

      for (let i = 0; i < lines.length; i++) {
        const text = lines[i].words.trim();
        if (!text) {
          allSoramimi[i] = [{ text: "" }];
          continue;
        }
        if (englishLinePattern.test(text)) {
          allSoramimi[i] = [{ text }];
          completedLines++;
          emit("line", {
            lineIndex: i,
            soramimi: [{ text }],
            progress: Math.round((completedLines / totalLines) * 100),
          });
        }
      }

      const processLine = (line: string) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;
        const match = trimmedLine.match(/^(\d+)[:.\s]\s*(.*)$/);
        if (match) {
          const nonEnglishLineIndex = parseInt(match[1], 10) - 1;
          const content = match[2].trim();
          if (nonEnglishLineIndex >= 0 && nonEnglishLineIndex < nonEnglishLines.length && content) {
            const info = nonEnglishLines[nonEnglishLineIndex];
            const originalIndex = info.originalIndex;
            const rawSegments = parseSoramimiRubyMarkup(content);
            const segments = fillMissingReadings(rawSegments);
            if (segments.length > 0) {
              allSoramimi[originalIndex] = segments;
              completedLines++;
              emit("line", {
                lineIndex: originalIndex,
                soramimi: segments,
                progress: Math.round((completedLines / totalLines) * 100),
              });
            }
          }
        }
      };

      try {
        const result = streamText({
          model: openai("gpt-5.2"),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: textsToProcess },
          ],
          temperature: 0.7,
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

        try {
          await saveSoramimi(redis, input.songId, allSoramimi, targetLanguage);
        } catch {
          // keep stream success even if cache write fails
        }

        emit("complete", {
          totalLines,
          successCount: completedLines,
          soramimi: allSoramimi,
          success: true,
        });
      } catch (err) {
        emit("error", {
          error: err instanceof Error ? err.message : "Soramimi generation failed",
        });
      }
    },
  };
}
