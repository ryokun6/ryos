import { Redis } from "@upstash/redis";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { validateAuth } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getSong, canModifySong, saveFurigana } from "../_utils/_song-service.js";
import { FuriganaStreamSchema } from "../songs/_constants.js";
import { parseLyricsContent } from "../songs/_lyrics.js";
import { containsKanji, parseRubyMarkup } from "../songs/_furigana.js";
import type { LyricLine } from "../songs/_utils.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

const FURIGANA_STREAM_RATE_LIMIT = { windowSeconds: 60, limit: 10 };

type FuriganaEmitFn = (eventType: string, data: Record<string, unknown>) => void;

export type SongsFuriganaStreamCoreResult =
  | { kind: "response"; response: CoreResponse }
  | {
      kind: "cached";
      payload: { type: "cached"; furigana: Array<Array<{ text: string; reading?: string }>> };
    }
  | { kind: "stream"; totalLines: number; run: (emit: FuriganaEmitFn) => Promise<void> };

interface SongsFuriganaStreamCoreInput {
  songId: string;
  body: unknown;
  username: string | null;
  authToken: string | null;
  rateLimitUser: string;
}

const furiganaSystemPrompt = `Add furigana to kanji using ruby markup format: <text:reading>

Format: <漢字:ふりがな> - text first, then reading after colon
- Plain text without reading stays as-is
- Separate okurigana: <走:はし>る (NOT <走る:はしる>)

Output format: Number each line like "1: annotated line", "2: annotated line", etc.

Example:
Input:
1: 夜空の星
2: 私は走る

Output:
1: <夜空:よぞら>の<星:ほし>
2: <私:わたし>は<走:はし>る`;

export async function executeSongsFuriganaStreamCore(
  input: SongsFuriganaStreamCoreInput
): Promise<SongsFuriganaStreamCoreResult> {
  const redis = createRedis();

  const rlKey = RateLimit.makeKey(["rl", "song", "furigana-stream", "user", input.rateLimitUser]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: FURIGANA_STREAM_RATE_LIMIT.windowSeconds,
    limit: FURIGANA_STREAM_RATE_LIMIT.limit,
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

  const parsed = FuriganaStreamSchema.safeParse(input.body);
  if (!parsed.success) {
    return {
      kind: "response",
      response: { status: 400, body: { error: "Invalid request body" } },
    };
  }

  const { force } = parsed.data;
  const song = await getSong(redis, input.songId, {
    includeMetadata: true,
    includeLyrics: true,
    includeFurigana: true,
  });

  if (!song?.lyrics?.lrc) {
    return {
      kind: "response",
      response: { status: 404, body: { error: "Song has no lyrics" } },
    };
  }

  if (force && song.furigana && song.furigana.length > 0) {
    if (!input.username || !input.authToken) {
      return {
        kind: "response",
        response: {
          status: 401,
          body: { error: "Unauthorized - authentication required to force refresh furigana" },
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

  const parsedLinesFurigana = parseLyricsContent(
    { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
    song.lyricsSource?.title || song.title,
    song.lyricsSource?.artist || song.artist
  );

  if (!force && song.furigana && song.furigana.length > 0) {
    return {
      kind: "cached",
      payload: {
        type: "cached",
        furigana: song.furigana,
      },
    };
  }

  const lines: LyricLine[] = parsedLinesFurigana.map((line) => ({
    words: line.words,
    startTimeMs: line.startTimeMs,
  }));
  const lineInfo = lines.map((line, originalIndex) => ({
    line,
    originalIndex,
    needsFurigana: containsKanji(line.words),
  }));
  const linesNeedingFurigana = lineInfo.filter((info) => info.needsFurigana);
  const textsToProcess = linesNeedingFurigana.map((info, i) => `${i + 1}: ${info.line.words}`).join("\n");
  const totalLines = parsedLinesFurigana.length;

  return {
    kind: "stream",
    totalLines,
    run: async (emit) => {
      const allFurigana: Array<Array<{ text: string; reading?: string }>> = new Array(totalLines)
        .fill(null)
        .map((_, i) => [{ text: lines[i].words }]);
      let completedLines = 0;
      let currentLineBuffer = "";

      emit("start", { totalLines, message: "Furigana generation started" });

      for (const info of lineInfo) {
        if (!info.needsFurigana) {
          completedLines++;
          emit("line", {
            lineIndex: info.originalIndex,
            furigana: [{ text: info.line.words }],
            progress: Math.round((completedLines / totalLines) * 100),
          });
        }
      }

      if (linesNeedingFurigana.length === 0) {
        emit("complete", {
          totalLines,
          successCount: completedLines,
          furigana: allFurigana,
          success: true,
        });
        return;
      }

      const processLine = (line: string) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;
        const match = trimmedLine.match(/^(\d+)[:.\s]\s*(.*)$/);
        if (match) {
          const kanjiLineIndex = parseInt(match[1], 10) - 1;
          const content = match[2].trim();
          if (kanjiLineIndex >= 0 && kanjiLineIndex < linesNeedingFurigana.length && content) {
            const originalIndex = linesNeedingFurigana[kanjiLineIndex].originalIndex;
            const segments = parseRubyMarkup(content);
            allFurigana[originalIndex] = segments;
            completedLines++;
            emit("line", {
              lineIndex: originalIndex,
              furigana: segments,
              progress: Math.round((completedLines / totalLines) * 100),
            });
          }
        }
      };

      try {
        const result = streamText({
          model: openai("gpt-5.2"),
          messages: [
            { role: "system", content: furiganaSystemPrompt },
            { role: "user", content: textsToProcess },
          ],
          temperature: 0.1,
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
          await saveFurigana(redis, input.songId, allFurigana);
        } catch {
          // keep stream success even if cache write fails
        }

        emit("complete", {
          totalLines,
          successCount: completedLines,
          furigana: allFurigana,
          success: true,
        });
      } catch (err) {
        emit("error", {
          error: err instanceof Error ? err.message : "Furigana generation failed",
        });
      }
    },
  };
}
