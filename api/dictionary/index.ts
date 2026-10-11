import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  DICTIONARY_ENRICHMENT_HEADER,
  DICTIONARY_LANGUAGES,
  DICTIONARY_QUERY_MAX_LENGTH,
  normalizeDictionaryQuery,
} from "../../src/shared/dictionary.js";
import { getDictionaryIndex, getKanjiInfoMap } from "./_helpers/_datasets.js";
import {
  beginDictionaryLookup,
  dictionaryLookupCacheId,
  dictionaryLookupTimingEnabled,
  publishDictionaryLookup,
  type DictionaryLookupDeps,
} from "./_helpers/_lookup.js";
import {
  dictionaryCacheKey,
  dictionaryHttpCacheControl,
  fetchDatamuseSynonyms,
  fetchFreeDictionary,
  fetchWiktionary,
  readLookupCache,
  writeLookupCache,
} from "./_helpers/_remote.js";

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(DICTIONARY_QUERY_MAX_LENGTH),
  lang: z.enum(["auto", ...DICTIONARY_LANGUAGES]).default("auto"),
  locale: z.string().trim().max(35).optional(),
});

function dictionaryDeps(
  redis: Parameters<typeof fetchWiktionary>[2],
  onRemoteError: DictionaryLookupDeps["onRemoteError"]
): DictionaryLookupDeps {
  return {
    getIndex: getDictionaryIndex,
    getKanjiInfo: getKanjiInfoMap,
    fetchFreeDictionary: (word) => fetchFreeDictionary(word, redis),
    fetchSynonyms: (word) => fetchDatamuseSynonyms(word, redis),
    fetchWiktionary: (headword, lang) => fetchWiktionary(headword, lang, redis),
    onRemoteError,
  };
}

export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
  },
  async ({ req, res, redis, logger, startTime }) => {
    const ip = getClientIp(req);
    const rl = await RateLimit.checkCounterLimit({
      key: RateLimit.makeKey(["rl", "dictionary", "lookup", "ip", ip]),
      windowSeconds: 60,
      limit: 90,
    });
    if (!rl.allowed) {
      logger.response(429, Date.now() - startTime);
      res.setHeader("Retry-After", String(rl.resetSeconds));
      res.status(429).json({ error: "rate_limit_exceeded", retryAfter: rl.resetSeconds });
      return;
    }

    const parsed = QuerySchema.safeParse({
      q: typeof req.query.q === "string" ? req.query.q : "",
      lang: typeof req.query.lang === "string" ? req.query.lang : undefined,
      locale: typeof req.query.locale === "string" ? req.query.locale : undefined,
    });
    if (!parsed.success) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const normalized = normalizeDictionaryQuery(parsed.data.q);
    const lookupKey = dictionaryCacheKey(
      "lookup",
      dictionaryLookupCacheId(parsed.data.lang, parsed.data.locale),
      normalized
    );
    const cached = await readLookupCache(redis, lookupKey);
    if (cached) {
      logger.info("dictionary lookup", {
        lang: cached.lang,
        entries: cached.entries.length,
        sources: cached.sources,
        cache: "hit",
      });
      res.setHeader("Cache-Control", dictionaryHttpCacheControl(cached.notFound));
      logger.response(200, Date.now() - startTime);
      res.status(200).json(cached);
      return;
    }

    try {
      const pending = await beginDictionaryLookup(parsed.data.q, parsed.data.lang, dictionaryDeps(redis, (source, error) =>
        logger.warn("dictionary remote source failed", {
          source,
          error: error instanceof Error ? error.message : String(error),
        })
      ), { locale: parsed.data.locale });
      const logTimings = (phase: string) => {
        if (!dictionaryLookupTimingEnabled()) return;
        logger.info("dictionary lookup timings", { phase, q: normalized, ...pending.timings });
      };
      if (!pending.enrichmentPending) {
        const result = await pending.final;
        await writeLookupCache(redis, lookupKey, result);
        logger.info("dictionary lookup", {
          lang: result.lang,
          entries: result.entries.length,
          sources: result.sources,
          cache: "miss",
        });
        logTimings("local");
        res.setHeader("Cache-Control", dictionaryHttpCacheControl(result.notFound));
        logger.response(200, Date.now() - startTime);
        res.status(200).json(result);
        return;
      }
      publishDictionaryLookup(lookupKey, pending.final, async (result) => {
        await writeLookupCache(redis, lookupKey, result);
        logTimings("enriched");
      });
      logger.info("dictionary lookup", {
        lang: pending.local.lang,
        entries: pending.local.entries.length,
        sources: pending.local.sources,
        cache: "miss",
        enrichment: "pending",
      });
      logTimings("local");
      res.setHeader(DICTIONARY_ENRICHMENT_HEADER, "pending");
      res.setHeader("Cache-Control", "private, no-store");
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ ...pending.local, enrichmentPending: true });
    } catch (error) {
      logger.error("dictionary lookup failed", error);
      logger.response(503, Date.now() - startTime);
      res.status(503).json({ error: "dictionary_unavailable" });
    }
  }
);
