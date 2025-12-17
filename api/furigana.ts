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

// Extend timeout for AI processing (default is 30s on Vercel)
export const maxDuration = 60;

const LyricLineSchema = z.object({
  words: z.string(),
  startTimeMs: z.string(),
});

const FuriganaRequestSchema = z.object({
  lines: z.array(LyricLineSchema),
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

type FuriganaRequest = z.infer<typeof FuriganaRequestSchema>;

// ------------------------------------------------------------------
// Redis cache helpers
// ------------------------------------------------------------------
const FURIGANA_CACHE_PREFIX = "lyrics:furigana:";

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

    const { lines } = validation.data;

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

    // Filter to only lines that contain kanji (which need furigana)
    const japaneseLines = lines.filter((line) => containsKanji(line.words));

    logInfo(requestId, "Received furigana request", {
      totalLines: lines.length,
      japaneseLines: japaneseLines.length,
    });

    // --------------------------
    // 1. Attempt cache lookup
    // --------------------------
    const redis = new Redis({
      url: process.env.REDIS_KV_REST_API_URL as string,
      token: process.env.REDIS_KV_REST_API_TOKEN as string,
    });

    const linesFingerprintSrc = JSON.stringify(
      lines.map((l) => ({ w: l.words, t: l.startTimeMs }))
    );
    const cacheKey = buildFuriganaCacheKey(linesFingerprintSrc);

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logInfo(requestId, "Furigana cache HIT", { cacheKey });
        // Upstash may return parsed JSON object or string
        const responseBody = typeof cached === "string" ? cached : JSON.stringify(cached);
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

    // System prompt for the AI
    const systemPrompt = `You are an expert in Japanese language. You will be given a JSON array of Japanese text strings (song lyrics).
Your task is to add furigana (reading annotations) to kanji characters in each line.

For each line, return an array of segments where:
- Each segment has a "text" field containing the original text portion
- Segments with kanji should have a "reading" field with the hiragana reading
- Segments without kanji (hiragana, katakana, punctuation, spaces) should NOT have a reading field

Example input: ["夜空の星", "私は走る"]
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
    ]
  ]
}

Important rules:
- Only add readings to kanji characters
- Keep the original text exactly as provided
- Break down compound kanji words appropriately for lyrics display
- Use standard hiragana readings (not katakana)
- For song lyrics, use common/natural readings that fit the context
- Preserve all non-Japanese characters (numbers, punctuation, English) as-is without readings`;

    // Only send lines with Japanese text to the AI
    const textsToProcess = japaneseLines.map((line) => line.words);

    const { object: aiResponse } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: AiFuriganaResponseSchema,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify(textsToProcess),
        },
      ],
      temperature: 0.1,
    });

    // Map AI results back to all lines
    let aiIndex = 0;
    const fullAnnotatedLines = lines.map((line) => {
      if (containsKanji(line.words)) {
        const annotated = aiResponse.annotatedLines[aiIndex] || [
          { text: line.words },
        ];
        aiIndex++;
        return annotated;
      }
      // Lines without kanji return as-is
      return [{ text: line.words }];
    });

    const result = JSON.stringify({
      annotatedLines: fullAnnotatedLines,
    });

    // Store in cache (TTL 30 days)
    try {
      await redis.set(cacheKey, result, { ex: 60 * 60 * 24 * 30 });
      logInfo(requestId, "Stored furigana in cache", { cacheKey });
    } catch (e) {
      logError(requestId, "Redis cache write failed (furigana)", e);
    }

    return new Response(result, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
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
