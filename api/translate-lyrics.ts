import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "./utils/cors.js";

export const config = {
  runtime: "edge",
};

// Extend timeout for chunked AI processing
export const maxDuration = 120;

const LyricLineSchema = z.object({
  words: z.string(),
  startTimeMs: z.string(),
});

const TranslateLyricsRequestSchema = z.object({
  lines: z.array(LyricLineSchema),
  targetLanguage: z.string(),
});

// New simplified schema for the AI response object
const AiTranslatedTextsSchema = z.object({
  translatedTexts: z.array(z.string()),
});

type LyricLine = z.infer<typeof LyricLineSchema>;
type TranslateLyricsRequest = z.infer<typeof TranslateLyricsRequestSchema>;

// ------------------------------------------------------------------
// Chunking configuration
// ------------------------------------------------------------------
const CHUNK_SIZE = 30; // Number of lines per chunk - balance between speed and reliability

// ------------------------------------------------------------------
// Redis cache helpers
// ------------------------------------------------------------------
const LYRIC_TRANSLATION_CACHE_PREFIX = "lyrics:translations:";
const LYRIC_TRANSLATION_CHUNK_PREFIX = "lyrics:translations:chunk:";

// Simple djb2 string hash -> 32-bit unsigned then hex
const hashString = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const buildTranslationCacheKey = (
  linesStr: string,
  targetLang: string
): string => {
  const fingerprint = hashString(linesStr);
  return `${LYRIC_TRANSLATION_CACHE_PREFIX}${targetLang}:${fingerprint}`;
};

const buildChunkCacheKey = (
  chunkLinesStr: string,
  targetLang: string
): string => {
  const fingerprint = hashString(chunkLinesStr);
  return `${LYRIC_TRANSLATION_CHUNK_PREFIX}${targetLang}:${fingerprint}`;
};

function msToLrcTime(msStr: string): string {
  const ms = parseInt(msStr, 10);
  if (isNaN(ms)) return "[00:00.00]";

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);

  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}.${String(centiseconds).padStart(2, "0")}]`;
}

// ------------------------------------------------------------------
// Basic logging helpers (mirrors style from iframe-check)
// ------------------------------------------------------------------
const logRequest = (
  method: string,
  url: string,
  action: string | null,
  id: string
) => {
  console.log(`[${id}] ${method} ${url} - Action: ${action || "none"}`);
};

const logInfo = (id: string, message: string, data?: unknown) => {
  console.log(`[${id}] INFO: ${message}`, data ?? "");
};

const logError = (id: string, message: string, error: unknown) => {
  console.error(`[${id}] ERROR: ${message}`, error);
};

const generateRequestId = (): string =>
  Math.random().toString(36).substring(2, 10);

// ------------------------------------------------------------------
// Chunk processing helper
// ------------------------------------------------------------------
async function translateChunk(
  chunk: LyricLine[],
  targetLanguage: string,
  redis: Redis,
  requestId: string
): Promise<string[]> {
  // Check chunk cache first
  const chunkFingerprintSrc = JSON.stringify(
    chunk.map((l) => ({ w: l.words, t: l.startTimeMs }))
  );
  const chunkCacheKey = buildChunkCacheKey(chunkFingerprintSrc, targetLanguage);

  try {
    const cachedChunk = (await redis.get(chunkCacheKey)) as string[] | null;
    if (cachedChunk) {
      logInfo(requestId, "Chunk cache HIT", { chunkCacheKey });
      return cachedChunk;
    }
  } catch (e) {
    logError(requestId, "Chunk cache lookup failed", e);
  }

  // Simplified system prompt for the AI
  const systemPrompt = `You are an expert lyrics translator. You will be given a JSON array of lyric line objects, where each object has a "words" field (the text to translate) and a "startTimeMs" field (a timestamp).
Your task is to translate the "words" for each line into ${targetLanguage}.
Respond ONLY with a valid JSON object containing a single key "translatedTexts". The value of "translatedTexts" MUST be an array of strings.
This array should contain only the translated versions of the "words" from the input, in the exact same order as they appeared in the input array.
If a line is purely instrumental or cannot be translated (e.g., "---"), return its original "words" text.
Do not include timestamps or any other formatting in your output strings; just the raw translated text for each line. Do not use , . ! ? : ; punctuation at the end of lines. Preserve the artistic intent and natural rhythm of the lyrics.`;

  const { object: aiResponse } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: AiTranslatedTextsSchema,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify(chunk.map((line) => ({ words: line.words }))),
      },
    ],
    temperature: 0.3,
  });

  const translations = chunk.map(
    (line, index) => aiResponse.translatedTexts[index] || line.words
  );

  // Cache the chunk (TTL 30 days)
  try {
    await redis.set(chunkCacheKey, translations, { ex: 60 * 60 * 24 * 30 });
    logInfo(requestId, "Stored chunk in cache", { chunkCacheKey });
  } catch (e) {
    logError(requestId, "Chunk cache write failed", e);
  }

  return translations;
}

export default async function handler(req: Request) {
  const requestId = generateRequestId();
  logRequest(req.method, req.url, null, requestId);

  if (req.method === "OPTIONS") {
    const effectiveOrigin = getEffectiveOrigin(req);
    const resp = preflightIfNeeded(req, ["POST", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  if (req.method !== "POST") {
    logError(requestId, "Method not allowed", null);
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const effectiveOrigin = getEffectiveOrigin(req);
    if (!isAllowedOrigin(effectiveOrigin)) {
      return new Response("Unauthorized", { status: 403 });
    }

    const body = (await req.json()) as TranslateLyricsRequest;
    const validation = TranslateLyricsRequestSchema.safeParse(body);

    if (!validation.success) {
      logError(requestId, "Invalid request body", validation.error);
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: validation.error.format(),
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { lines, targetLanguage } = validation.data;

    if (!lines || lines.length === 0) {
      return new Response("", {
        headers: { "Content-Type": "text/plain" },
      });
    }

    logInfo(requestId, "Received translate-lyrics request", {
      linesCount: lines.length,
      targetLanguage,
    });

    const redis = new Redis({
      url: process.env.REDIS_KV_REST_API_URL as string,
      token: process.env.REDIS_KV_REST_API_TOKEN as string,
    });

    // Check full cache first
    const linesFingerprintSrc = JSON.stringify(
      lines.map((l) => ({ w: l.words, t: l.startTimeMs }))
    );
    const transCacheKey = buildTranslationCacheKey(
      linesFingerprintSrc,
      targetLanguage
    );

    try {
      const cached = (await redis.get(transCacheKey)) as string | null;
      if (cached) {
        logInfo(requestId, "Translation cache HIT", { transCacheKey });
        return new Response(cached, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Lyrics-Translation-Cache": "HIT",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        });
      }
      logInfo(requestId, "Translation cache MISS", { transCacheKey });
    } catch (e) {
      logError(requestId, "Redis cache lookup failed (lyrics translation)", e);
    }

    // For small requests (less than 2 chunks worth), process without streaming
    if (lines.length <= CHUNK_SIZE * 2) {
      logInfo(requestId, "Processing small request without streaming", {
        linesCount: lines.length,
      });

      const translations = await translateChunk(
        lines,
        targetLanguage,
        redis,
        requestId
      );

      const lrcOutputLines = lines.map((originalLine, index) => {
        const translatedText = translations[index] || originalLine.words;
        const lrcTimestamp = msToLrcTime(originalLine.startTimeMs);
        return `${lrcTimestamp}${translatedText}`;
      });

      const lrcResult = lrcOutputLines.join("\n");

      // Store full result in cache
      try {
        await redis.set(transCacheKey, lrcResult, { ex: 60 * 60 * 24 * 30 });
        logInfo(requestId, "Stored translation in cache", { transCacheKey });
      } catch (e) {
        logError(requestId, "Redis cache write failed", e);
      }

      return new Response(lrcResult, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": effectiveOrigin!,
        },
      });
    }

    // For larger requests, use streaming with chunked processing
    logInfo(requestId, "Processing large request with streaming", {
      linesCount: lines.length,
      estimatedChunks: Math.ceil(lines.length / CHUNK_SIZE),
    });

    // Create chunks
    const chunks: LyricLine[][] = [];
    for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
      chunks.push(lines.slice(i, i + CHUNK_SIZE));
    }

    // Stream response using Server-Sent Events format
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const allTranslations: string[] = [];
        let chunkStartIndex = 0;

        try {
          for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            
            logInfo(requestId, `Processing chunk ${chunkIndex + 1}/${chunks.length}`, {
              chunkSize: chunk.length,
              startIndex: chunkStartIndex,
            });

            const translations = await translateChunk(
              chunk,
              targetLanguage,
              redis,
              requestId
            );

            // Format this chunk as LRC lines
            const lrcLines = chunk.map((originalLine, index) => {
              const translatedText = translations[index] || originalLine.words;
              const lrcTimestamp = msToLrcTime(originalLine.startTimeMs);
              return `${lrcTimestamp}${translatedText}`;
            });

            allTranslations.push(...translations);

            // Send chunk data as SSE event
            const chunkData = {
              type: "chunk",
              chunkIndex,
              totalChunks: chunks.length,
              startIndex: chunkStartIndex,
              lines: lrcLines,
            };
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunkData)}\n\n`)
            );

            chunkStartIndex += chunk.length;
          }

          // Send completion event
          const completeData = {
            type: "complete",
            totalLines: lines.length,
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(completeData)}\n\n`)
          );

          // Store full result in cache after all chunks are done
          const fullLrcResult = lines
            .map((originalLine, index) => {
              const translatedText = allTranslations[index] || originalLine.words;
              const lrcTimestamp = msToLrcTime(originalLine.startTimeMs);
              return `${lrcTimestamp}${translatedText}`;
            })
            .join("\n");

          try {
            await redis.set(transCacheKey, fullLrcResult, { ex: 60 * 60 * 24 * 30 });
            logInfo(requestId, "Stored full translation in cache", { transCacheKey });
          } catch (e) {
            logError(requestId, "Redis cache write failed", e);
          }

          controller.close();
        } catch (error) {
          logError(requestId, "Error during chunk processing", error);
          const errorData = {
            type: "error",
            message: error instanceof Error ? error.message : "Unknown error",
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": effectiveOrigin!,
      },
    });
  } catch (error: unknown) {
    logError(requestId, "Error translating lyrics", error);
    let errorMessage = "Error translating lyrics";
    if (error instanceof Error) {
      errorMessage = error.message;
      if ("cause" in error && error.cause) {
        errorMessage += ` - Cause: ${JSON.stringify(error.cause)}`;
      }
    }
    return new Response(`Error: ${errorMessage}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
