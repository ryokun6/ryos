import { google } from "@ai-sdk/google";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  DICTIONARY_LANGUAGES,
  DICTIONARY_QUERY_MAX_LENGTH,
  normalizeDictionaryQuery,
  type DictionaryAiResponse,
} from "../../src/shared/dictionary.js";
import {
  AI_LANGUAGE_NAMES,
  buildDictionaryAiPrompt,
  DictionaryAiExtrasSchema,
  DictionaryAiFallbackSchema,
  extrasFromAi,
  entryFromAi,
} from "./_helpers/_ai.js";
import { dictionaryCacheKey } from "./_helpers/_remote.js";

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

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

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
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ ...value, cached: true });
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
      let response: DictionaryAiResponse;
      if (mode === "fallback") {
        const { output } = await generateText({
          model: google("gemini-3-flash-preview"),
          instructions: prompt.instructions,
          output: Output.object({ schema: DictionaryAiFallbackSchema, name: "dictionary_entry" }),
          messages: [{ role: "user", content: prompt.user }],
          temperature: 0.2,
        });
        if (!output) throw new Error("AI returned no entry");
        response = { word, lang, mode, entry: entryFromAi(output, word, lang) ?? undefined };
      } else {
        const { output } = await generateText({
          model: google("gemini-3-flash-preview"),
          instructions: prompt.instructions,
          output: Output.object({ schema: DictionaryAiExtrasSchema, name: "dictionary_extras" }),
          messages: [{ role: "user", content: prompt.user }],
          temperature: 0.4,
        });
        if (!output) throw new Error("AI returned no extras");
        response = { word, lang, mode, extras: extrasFromAi(output, lang) };
      }

      try {
        await redis.set(cacheKey, JSON.stringify(response), { ex: CACHE_TTL_SECONDS });
      } catch (error) {
        logger.warn("dictionary ai cache write failed", { error: String(error) });
      }
      logger.response(200, Date.now() - startTime);
      res.status(200).json(response);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        logger.warn("dictionary ai produced no object", { text: error.text });
      } else {
        logger.error("dictionary ai failed", error);
      }
      logger.response(502, Date.now() - startTime);
      res.status(502).json({
        error: "ai_unavailable",
        language: AI_LANGUAGE_NAMES[lang],
      });
    }
  }
);
