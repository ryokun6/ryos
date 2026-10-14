import { google } from "@ai-sdk/google";
import { smoothStream, streamText } from "ai";
import {
  ryoUiStreamTransforms,
  safeUiStreamErrorText,
} from "../_utils/ui-message-stream.js";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "node:http";
import { apiHandler } from "../_utils/api-handler.js";
import type { Redis } from "../_utils/redis.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  DICTIONARY_LANGUAGES,
  DICTIONARY_QUERY_MAX_LENGTH,
  normalizeDictionaryQuery,
  type DictionaryAiMode,
  type DictionaryAiResponse,
} from "../../src/shared/dictionary.js";
import { DICTIONARY_AI_STREAM_HEADERS, extrasToDictionaryNotes } from "../../src/shared/dictionaryAiNotes.js";
import { AI_LANGUAGE_NAMES, buildDictionaryAiPrompt } from "./_helpers/_ai.js";
import { DICTIONARY_AI_CACHE_TTL_SECONDS, dictionaryCacheKey } from "./_helpers/_remote.js";

const RequestSchema = z.object({
  word: z.string().trim().min(1).max(DICTIONARY_QUERY_MAX_LENGTH),
  lang: z.enum(DICTIONARY_LANGUAGES),
  mode: z.enum(["fallback", "extras"]),
  locale: z
    .string()
    .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/)
    .max(16)
    .optional(),
});

type RequestBody = z.infer<typeof RequestSchema>;

function notesFromResponseMessage(message: { parts?: Array<{ type?: string; text?: string }> }): string {
  return (message.parts ?? [])
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("")
    .trim();
}

function cachedNotes(value: DictionaryAiResponse): string {
  if (typeof value.notes === "string" && value.notes.trim()) return value.notes;
  if (value.extras) return extrasToDictionaryNotes(value.extras);
  return "";
}

async function streamDictionaryAiText({
  req,
  res,
  redis,
  logger,
  startTime,
  cacheKey,
  word,
  lang,
  mode,
  prompt,
  temperature,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  redis: Redis;
  logger: {
    warn: (message: string, extra?: object) => void;
    response: (status: number, durationMs: number) => void;
  };
  startTime: number;
  cacheKey: string;
  word: string;
  lang: RequestBody["lang"];
  mode: DictionaryAiMode;
  prompt: { instructions: string; user: string };
  temperature: number;
}): Promise<void> {
  const abort = new AbortController();
  const abortGeneration = () => {
    if (!abort.signal.aborted) abort.abort();
  };
  const responseEvents = res as ServerResponse & {
    once(event: "aborted" | "close", listener: () => void): void;
    off(event: "aborted" | "close", listener: () => void): void;
  };
  const handleResponseClose = () => {
    if (res.writableEnded) return;
    abortGeneration();
  };
  responseEvents.once("aborted", abortGeneration);
  responseEvents.once("close", handleResponseClose);
  req.once("aborted", abortGeneration);
  req.socket?.once("close", abortGeneration);
  const clearAbortListeners = () => {
    responseEvents.off("aborted", abortGeneration);
    responseEvents.off("close", handleResponseClose);
    req.off("aborted", abortGeneration);
    req.socket?.off("close", abortGeneration);
  };

  const result = streamText({
    model: google("gemini-3-flash-preview"),
    instructions: prompt.instructions,
    messages: [{ role: "user", content: prompt.user }],
    temperature,
    abortSignal: abort.signal,
    // Same word-sized chunks Chats uses, so CJK and Latin both paint smoothly.
    experimental_transform: ryoUiStreamTransforms(
      smoothStream({
        chunking: /[\u4E00-\u9FFF]|\S+\s+/,
      })
    ),
    providerOptions: {
      google: {
        thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false },
      },
    },
  });

  try {
    await result.pipeUIMessageStreamToResponse(res, {
      status: 200,
      headers: DICTIONARY_AI_STREAM_HEADERS,
      onError: (error) => {
        const errorText = safeUiStreamErrorText(error);
        logger.warn("dictionary ai stream error", { errorText });
        return errorText;
      },
      onEnd: async ({ isAborted, isCancelled, responseMessage, finishReason }) => {
        if (isAborted || isCancelled || abort.signal.aborted || finishReason === "error") return;
        const notes = notesFromResponseMessage(responseMessage);
        if (!notes) return;
        // Finished text only. Aborted, cancelled, and errored generations return above.
        const response: DictionaryAiResponse = { word, lang, mode, notes };
        try {
          await redis.set(cacheKey, JSON.stringify(response), { ex: DICTIONARY_AI_CACHE_TTL_SECONDS });
        } catch (error) {
          logger.warn("dictionary ai cache write failed", { error: String(error) });
        }
      },
    });
    if (!abort.signal.aborted) logger.response(200, Date.now() - startTime);
  } catch (error) {
    if (abort.signal.aborted) return;
    if (res.headersSent) {
      logger.warn("dictionary ai stream failed", { error: String(error) });
      if (!res.writableEnded) res.end();
      logger.response(502, Date.now() - startTime);
      return;
    }
    throw error;
  } finally {
    clearAbortListeners();
  }
}

export default apiHandler<RequestBody>(
  {
    methods: ["POST"],
    auth: "optional",
    bodySchema: RequestSchema,
  },
  async ({ req, res, redis, logger, startTime, user, body }) => {
    const { lang, mode } = body!;
    const word = normalizeDictionaryQuery(body!.word);
    const locale = body!.locale ?? "en";
    const cacheKey = dictionaryCacheKey(`ai-${mode}`, `${lang}-${locale}`, word);

    try {
      const hit = await redis.get<DictionaryAiResponse | string>(cacheKey);
      if (hit) {
        const value = typeof hit === "string" ? (JSON.parse(hit) as DictionaryAiResponse) : hit;
        const notes = value.mode === "extras" ? cachedNotes(value) : "";
        logger.response(200, Date.now() - startTime);
        res.status(200).json(notes ? { ...value, notes, cached: true } : { ...value, cached: true });
        return;
      }
    } catch (error) {
      logger.warn("dictionary ai cache read failed", { error: String(error) });
    }

    const identifier = user?.username ?? getClientIp(req);
    const scope = user ? "user" : "ip";
    const burst = await RateLimit.checkCounterLimit({
      key: RateLimit.makeKey(["rl", "dictionary-ai", "burst", scope, identifier]),
      windowSeconds: 60,
      limit: user ? 10 : 4,
    });
    const daily = burst.allowed
      ? await RateLimit.checkCounterLimit({
          key: RateLimit.makeKey(["rl", "dictionary-ai", "daily", scope, identifier]),
          windowSeconds: 60 * 60 * 24,
          limit: user ? 150 : 20,
        })
      : burst;
    if (!burst.allowed || !daily.allowed) {
      const limit = !burst.allowed ? burst : daily;
      res.setHeader("Retry-After", String(limit.resetSeconds));
      logger.response(429, Date.now() - startTime);
      res.status(429).json({
        error: "rate_limit_exceeded",
        scope: !burst.allowed ? "burst" : "daily",
        retryAfter: limit.resetSeconds,
      });
      return;
    }

    logger.info("dictionary ai request", { lang, mode, locale, authed: !!user });
    try {
      const prompt = buildDictionaryAiPrompt({ word, lang, mode, locale });
      await streamDictionaryAiText({
        req,
        res,
        redis,
        logger,
        startTime,
        cacheKey,
        word,
        lang,
        mode,
        prompt,
        temperature: mode === "fallback" ? 0.2 : 0.4,
      });
    } catch (error) {
      logger.error("dictionary ai failed", error);
      logger.response(502, Date.now() - startTime);
      if (res.headersSent) return;
      res.status(502).json({
        error: "ai_unavailable",
        language: AI_LANGUAGE_NAMES[lang],
      });
    }
  }
);
