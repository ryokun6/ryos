import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { getEffectiveOrigin, isAllowedOrigin, preflightIfNeeded } from "./utils/cors.js";

export const config = {
  runtime: "edge",
};

const LyricLineSchema = z.object({
  words: z.string(),
  startTimeMs: z.string(),
});

const TranslateLyricsRequestSchema = z.object({
  lines: z.array(LyricLineSchema),
  targetLanguage: z.string(),
  bypassCache: z.boolean().optional(),
});

// New simplified schema for the AI response object
const AiTranslatedTextsSchema = z.object({
  translatedTexts: z.array(z.string()),
});

type TranslateLyricsRequest = z.infer<typeof TranslateLyricsRequestSchema>;

// ------------------------------------------------------------------
// Redis cache helpers
// ------------------------------------------------------------------
const LYRIC_TRANSLATION_CACHE_PREFIX = "lyrics:translations:";

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

    // Rate limiting removed - no longer limiting lyrics translation requests

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

    const { lines, targetLanguage, bypassCache } = validation.data;

    if (!lines || lines.length === 0) {
      return new Response("", {
        // Return empty string for empty LRC
        headers: { "Content-Type": "text/plain" },
      });
    }

    logInfo(requestId, "Received translate-lyrics request", {
      linesCount: lines.length,
      targetLanguage,
    });

    // --------------------------
    // 1. Generate cache key (always needed for storage)
    // --------------------------
    const linesFingerprintSrc = JSON.stringify(
      lines.map((l) => ({ w: l.words, t: l.startTimeMs }))
    );
    const transCacheKey = buildTranslationCacheKey(
      linesFingerprintSrc,
      targetLanguage
    );

    // --------------------------
    // 2. Attempt cache lookup (skip if bypassCache is true)
    // --------------------------
    if (!bypassCache) {
      const redis = new Redis({
        url: process.env.REDIS_KV_REST_API_URL as string,
        token: process.env.REDIS_KV_REST_API_TOKEN as string,
      });

      try {
        const cached = (await redis.get(transCacheKey)) as string | null;
        if (cached) {
          logInfo(requestId, "Translation cache HIT", { transCacheKey });
          return new Response(cached, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "X-Lyrics-Translation-Cache": "HIT",
            },
          });
        }
        logInfo(requestId, "Translation cache MISS", { transCacheKey });
      } catch (e) {
        logError(requestId, "Redis cache lookup failed (lyrics translation)", e);
      }
    } else {
      logInfo(requestId, "Translation cache BYPASSED", { bypassCache });
    }

    // Simplified system prompt for the AI
    const systemPrompt = `You are an expert lyrics translator. You will be given a JSON array of lyric line objects, where each object has a "words" field (the text to translate) and a "startTimeMs" field (a timestamp).
Your task is to translate the "words" for each line into ${targetLanguage}.
Respond ONLY with a valid JSON object containing a single key "translatedTexts". The value of "translatedTexts" MUST be an array of strings.
This array should contain only the translated versions of the "words" from the input, in the exact same order as they appeared in the input array.
If a line is purely instrumental or cannot be translated (e.g., "---"), return its original "words" text.
Do not include timestamps or any other formatting in your output strings; just the raw translated text for each line. Do not use , . ! ? : ; `;

    const { object: aiResponse } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: AiTranslatedTextsSchema, // Use the new simplified schema for AI output
      prompt: JSON.stringify(lines.map((line) => ({ words: line.words }))), // Send only words to AI for translation context
      system: systemPrompt,
      temperature: 0.3,
    });

    // Combine AI translations with original timestamps and format as LRC
    const lrcOutputLines = lines.map((originalLine, index) => {
      const translatedText =
        aiResponse.translatedTexts[index] || originalLine.words; // Fallback to original if AI misses one
      const lrcTimestamp = msToLrcTime(originalLine.startTimeMs);
      return `${lrcTimestamp}${translatedText}`;
    });

    const lrcResult = lrcOutputLines.join("\n");

    // Store in cache (TTL 30 days) - always store the result
    try {
      const redis = new Redis({
        url: process.env.REDIS_KV_REST_API_URL as string,
        token: process.env.REDIS_KV_REST_API_TOKEN as string,
      });
      await redis.set(transCacheKey, lrcResult);
      if (bypassCache) {
        logInfo(requestId, "Stored refreshed translation in cache", { transCacheKey, bypassCache });
      } else {
        logInfo(requestId, "Stored translation in cache", { transCacheKey });
      }
    } catch (e) {
      logError(requestId, "Redis cache write failed (lyrics translation)", e);
    }

    return new Response(lrcResult, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": effectiveOrigin! },
    });
  } catch (error: unknown) {
    logError(requestId, "Error translating lyrics", error);
    let errorMessage = "Error translating lyrics";
    if (error instanceof Error) {
      errorMessage = error.message;
      // Add more details if it's an AI SDK error
      if ("cause" in error && error.cause) {
        errorMessage += ` - Cause: ${JSON.stringify(error.cause)}`;
      }
    }
    // Return error as plain text if API is expected to be text/plain
    return new Response(`Error: ${errorMessage}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" },
    });
  }
}
