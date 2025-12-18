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

const FuriganaRequestSchema = z.object({
  lines: z.array(LyricLineSchema),
  /** If true, bypasses cache and forces fresh furigana generation */
  force: z.boolean().optional(),
});

// Schema for the AI response - array of lines with furigana annotations
// Each line is an array of segments: { text: string, reading?: string }
const FuriganaSegmentSchema = z.object({
  text: z.string(),
  reading: z.string().optional(),
});

const AiFuriganaResponseSchema = z.object({
  annotatedLines: z.array(z.array(FuriganaSegmentSchema)),
});

type LyricLine = z.infer<typeof LyricLineSchema>;
type FuriganaRequest = z.infer<typeof FuriganaRequestSchema>;
type FuriganaSegment = z.infer<typeof FuriganaSegmentSchema>;

// ------------------------------------------------------------------
// Chunking configuration
// ------------------------------------------------------------------
const CHUNK_SIZE = 15; // Number of lines per chunk - smaller chunks for faster progressive loading
const MAX_PARALLEL_CHUNKS = 3; // Limit parallel AI calls to avoid rate limits

// ------------------------------------------------------------------
// Redis cache helpers
// ------------------------------------------------------------------
const FURIGANA_CACHE_PREFIX = "lyrics:furigana:";
const FURIGANA_CHUNK_PREFIX = "lyrics:furigana:chunk:";

// Simple djb2 string hash -> 32-bit unsigned then hex
const hashString = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const buildFuriganaCacheKey = (linesStr: string): string => {
  const fingerprint = hashString(linesStr);
  return `${FURIGANA_CACHE_PREFIX}${fingerprint}`;
};

const buildChunkCacheKey = (chunkLinesStr: string): string => {
  const fingerprint = hashString(chunkLinesStr);
  return `${FURIGANA_CHUNK_PREFIX}${fingerprint}`;
};

// ------------------------------------------------------------------
// Basic logging helpers
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

// Check if text is Japanese (contains both kanji AND hiragana/katakana)
// This distinguishes Japanese from Chinese (which only has hanzi, no kana)
function isJapaneseText(text: string): boolean {
  const hasKanji = /[\u4E00-\u9FFF]/.test(text);
  const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(text); // Hiragana or Katakana
  return hasKanji && hasKana;
}

// Check if text contains kanji specifically (for lines that need furigana)
function containsKanji(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

// System prompt for the AI
const SYSTEM_PROMPT = `You are an expert in Japanese language. You will be given a JSON array of Japanese text strings (song lyrics).
Your task is to add furigana (reading annotations) to kanji characters in each line.

For each line, return an array of segments where:
- Each segment has a "text" field containing the original text portion
- Segments with kanji should have a "reading" field with the hiragana reading
- Segments without kanji (hiragana, katakana, punctuation, spaces) should NOT have a reading field

CRITICAL: Separate kanji from trailing hiragana (okurigana)
- The "text" field with a "reading" must contain ONLY kanji characters
- Trailing hiragana (okurigana) must be in a SEPARATE segment WITHOUT a reading
- The reading should cover ONLY the kanji, not include the okurigana

Example input: ["夜空の星", "私は走る", "思いを込めて"]
Example output:
{
  "annotatedLines": [
    [
      {"text": "夜空", "reading": "よぞら"},
      {"text": "の"},
      {"text": "星", "reading": "ほし"}
    ],
    [
      {"text": "私", "reading": "わたし"},
      {"text": "は"},
      {"text": "走", "reading": "はし"},
      {"text": "る"}
    ],
    [
      {"text": "思", "reading": "おも"},
      {"text": "いを"},
      {"text": "込", "reading": "こ"},
      {"text": "めて"}
    ]
  ]
}

Important rules:
- Only add readings to kanji characters - the "text" field must contain ONLY kanji when a "reading" is provided
- ALWAYS separate trailing hiragana (okurigana) into their own segments without readings
- Example: 思い should be split into {"text": "思", "reading": "おも"} and {"text": "い"} - NOT {"text": "思い", "reading": "おもい"}
- Example: 食べる should be split into {"text": "食", "reading": "た"} and {"text": "べる"}
- Keep the original text exactly as provided
- Break down compound kanji words appropriately for lyrics display
- Use standard hiragana readings (not katakana)
- For song lyrics, use common/natural readings that fit the context
- Preserve all non-Japanese characters (numbers, punctuation, English) as-is without readings`;

// ------------------------------------------------------------------
// Chunk processing helper
// ------------------------------------------------------------------
async function processChunk(
  chunk: LyricLine[],
  redis: Redis,
  requestId: string,
  force: boolean = false
): Promise<{ annotatedLines: FuriganaSegment[][]; originalIndices: number[] }> {
  // Separate lines that need furigana from those that don't
  const linesNeedingFurigana: { line: LyricLine; originalIndex: number }[] = [];
  const results: { segments: FuriganaSegment[]; originalIndex: number }[] = [];

  chunk.forEach((line, index) => {
    if (containsKanji(line.words)) {
      linesNeedingFurigana.push({ line, originalIndex: index });
    } else {
      results.push({ segments: [{ text: line.words }], originalIndex: index });
    }
  });

  if (linesNeedingFurigana.length === 0) {
    // No lines need furigana processing
    return {
      annotatedLines: chunk.map((line) => [{ text: line.words }]),
      originalIndices: chunk.map((_, i) => i),
    };
  }

  // Check chunk cache first (unless force is set)
  const chunkFingerprintSrc = JSON.stringify(
    linesNeedingFurigana.map((item) => ({
      w: item.line.words,
      t: item.line.startTimeMs,
    }))
  );
  const chunkCacheKey = buildChunkCacheKey(chunkFingerprintSrc);

  if (!force) {
    try {
      const cachedChunk = await redis.get(chunkCacheKey);
      if (cachedChunk) {
        logInfo(requestId, "Chunk cache HIT", { chunkCacheKey });
        const cachedAnnotations = (
          typeof cachedChunk === "string" ? JSON.parse(cachedChunk) : cachedChunk
        ) as FuriganaSegment[][];

        // Merge cached results with non-kanji lines
        linesNeedingFurigana.forEach((item, i) => {
          results.push({
            segments: cachedAnnotations[i] || [{ text: item.line.words }],
            originalIndex: item.originalIndex,
          });
        });

        // Sort by original index and return
        results.sort((a, b) => a.originalIndex - b.originalIndex);
        return {
          annotatedLines: results.map((r) => r.segments),
          originalIndices: results.map((r) => r.originalIndex),
        };
      }
    } catch (e) {
      logError(requestId, "Chunk cache lookup failed", e);
    }
  }

  // Process with AI
  const textsToProcess = linesNeedingFurigana.map((item) => item.line.words);

  const { object: aiResponse } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: AiFuriganaResponseSchema,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify(textsToProcess),
      },
    ],
    temperature: 0.1,
  });

  // Cache the AI results for this chunk
  try {
    await redis.set(chunkCacheKey, JSON.stringify(aiResponse.annotatedLines), {
      ex: 60 * 60 * 24 * 30,
    });
    logInfo(requestId, "Stored chunk in cache", { chunkCacheKey });
  } catch (e) {
    logError(requestId, "Chunk cache write failed", e);
  }

  // Merge AI results with non-kanji lines
  linesNeedingFurigana.forEach((item, i) => {
    results.push({
      segments: aiResponse.annotatedLines[i] || [{ text: item.line.words }],
      originalIndex: item.originalIndex,
    });
  });

  // Sort by original index and return
  results.sort((a, b) => a.originalIndex - b.originalIndex);
  return {
    annotatedLines: results.map((r) => r.segments),
    originalIndices: results.map((r) => r.originalIndex),
  };
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

    const body = (await req.json()) as FuriganaRequest;
    const validation = FuriganaRequestSchema.safeParse(body);

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

    const { lines, force } = validation.data;

    if (!lines || lines.length === 0) {
      return new Response(JSON.stringify({ annotatedLines: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // First check if any line is Japanese (has both kanji and kana)
    // This prevents Chinese text from being processed
    const hasAnyJapanese = lines.some((line) => isJapaneseText(line.words));

    if (!hasAnyJapanese) {
      // Return original lines without furigana if no Japanese text detected
      const result = lines.map((line) => [{ text: line.words }]);
      return new Response(JSON.stringify({ annotatedLines: result }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": effectiveOrigin!,
        },
      });
    }

    logInfo(requestId, "Received furigana request", {
      totalLines: lines.length,
      japaneseLines: lines.filter((line) => containsKanji(line.words)).length,
      force: !!force,
    });

    const redis = new Redis({
      url: process.env.REDIS_KV_REST_API_URL as string,
      token: process.env.REDIS_KV_REST_API_TOKEN as string,
    });

    // Check full cache first (unless force is set)
    const linesFingerprintSrc = JSON.stringify(
      lines.map((l) => ({ w: l.words, t: l.startTimeMs }))
    );
    const cacheKey = buildFuriganaCacheKey(linesFingerprintSrc);

    if (force) {
      logInfo(requestId, "Bypassing furigana cache due to force flag", {
        cacheKey,
      });
    } else {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          logInfo(requestId, "Furigana cache HIT", { cacheKey });
          const responseBody =
            typeof cached === "string" ? cached : JSON.stringify(cached);
          return new Response(responseBody, {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "X-Furigana-Cache": "HIT",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          });
        }
        logInfo(requestId, "Furigana cache MISS", { cacheKey });
      } catch (e) {
        logError(requestId, "Redis cache lookup failed (furigana)", e);
      }
    }

    // For small requests (less than 2 chunks worth), process without streaming
    if (lines.length <= CHUNK_SIZE * 2) {
      logInfo(requestId, "Processing small request without streaming", {
        linesCount: lines.length,
      });

      const { annotatedLines } = await processChunk(lines, redis, requestId, !!force);

      const result = JSON.stringify({ annotatedLines });

      // Store full result in cache
      try {
        await redis.set(cacheKey, result, { ex: 60 * 60 * 24 * 30 });
        logInfo(requestId, "Stored furigana in cache", { cacheKey });
      } catch (e) {
        logError(requestId, "Redis cache write failed", e);
      }

      return new Response(result, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": effectiveOrigin!,
        },
      });
    }

    // For larger requests, use streaming with parallel chunked processing
    logInfo(requestId, "Processing large request with parallel streaming", {
      linesCount: lines.length,
      estimatedChunks: Math.ceil(lines.length / CHUNK_SIZE),
    });

    // Create chunks with their metadata
    const chunks: { chunk: LyricLine[]; startIndex: number; chunkIndex: number }[] = [];
    for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
      chunks.push({
        chunk: lines.slice(i, i + CHUNK_SIZE),
        startIndex: i,
        chunkIndex: chunks.length,
      });
    }

    // Stream response using Server-Sent Events format
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const allAnnotatedLines: FuriganaSegment[][] = new Array(lines.length);
        const completedChunks = new Set<number>();

        try {
          // Process chunks with limited concurrency to avoid rate limits
          let activePromises: Promise<void>[] = [];
          let chunkQueueIndex = 0;

          const processChunkWithStreaming = async (
            chunkData: { chunk: LyricLine[]; startIndex: number; chunkIndex: number }
          ) => {
            const { chunk, startIndex, chunkIndex } = chunkData;

            logInfo(
              requestId,
              `Starting chunk ${chunkIndex + 1}/${chunks.length}`,
              {
                chunkSize: chunk.length,
                startIndex,
              }
            );

            const { annotatedLines } = await processChunk(
              chunk,
              redis,
              requestId,
              !!force
            );

            // Store annotated lines in the correct positions
            annotatedLines.forEach((segments, i) => {
              allAnnotatedLines[startIndex + i] = segments;
            });

            completedChunks.add(chunkIndex);

            // Send chunk data as SSE event
            const eventData = {
              type: "chunk",
              chunkIndex,
              totalChunks: chunks.length,
              startIndex,
              annotatedLines,
              completedCount: completedChunks.size,
            };

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`)
            );

            logInfo(requestId, `Completed chunk ${chunkIndex + 1}/${chunks.length}`, {
              completedCount: completedChunks.size,
            });
          };

          // Start initial batch of parallel chunks
          while (chunkQueueIndex < chunks.length) {
            // Start up to MAX_PARALLEL_CHUNKS at a time
            while (activePromises.length < MAX_PARALLEL_CHUNKS && chunkQueueIndex < chunks.length) {
              const chunkData = chunks[chunkQueueIndex];
              chunkQueueIndex++;
              const promise = processChunkWithStreaming(chunkData).then(() => {
                activePromises = activePromises.filter(p => p !== promise);
              });
              activePromises.push(promise);
            }
            // Wait for at least one to complete before starting more
            if (activePromises.length >= MAX_PARALLEL_CHUNKS) {
              await Promise.race(activePromises);
            }
          }

          // Wait for all remaining chunks to complete
          await Promise.all(activePromises);

          // Send completion event
          const completeData = {
            type: "complete",
            totalLines: lines.length,
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(completeData)}\n\n`)
          );

          // Store full result in cache after all chunks are done
          const fullResult = JSON.stringify({
            annotatedLines: allAnnotatedLines,
          });

          try {
            await redis.set(cacheKey, fullResult, { ex: 60 * 60 * 24 * 30 });
            logInfo(requestId, "Stored full furigana in cache", { cacheKey });
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
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": effectiveOrigin!,
      },
    });
  } catch (error: unknown) {
    logError(requestId, "Error generating furigana", error);
    let errorMessage = "Error generating furigana";
    if (error instanceof Error) {
      errorMessage = error.message;
      if ("cause" in error && error.cause) {
        errorMessage += ` - Cause: ${JSON.stringify(error.cause)}`;
      }
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
