import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  DICTIONARY_LANGUAGES,
  DICTIONARY_QUERY_MAX_LENGTH,
  normalizeDictionaryQuery,
} from "../../src/shared/dictionary.js";
import { getDictionaryIndex, getKanjiInfoMap } from "./_helpers/_datasets.js";
import {
  beginDictionaryLookup,
  dictionaryLookupCacheId,
  inflightDictionaryLookup,
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

/**
 * Wiktionary examples for a lookup that already returned its local entry.
 * Shares the in-flight fetch started by GET /api/dictionary and writes the
 * same Redis lookup cache once the merge finishes.
 */
export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
  },
  async ({ req, res, redis, logger, startTime }) => {
    const ip = getClientIp(req);
    const rl = await RateLimit.checkCounterLimit({
      key: RateLimit.makeKey(["rl", "dictionary", "enrich", "ip", ip]),
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
    try {
      const inflight = inflightDictionaryLookup(lookupKey);
      const result = inflight
        ? await inflight
        : ((await readLookupCache(redis, lookupKey)) ??
          (await (async () => {
            const pending = await beginDictionaryLookup(
              parsed.data.q,
              parsed.data.lang,
              {
                getIndex: getDictionaryIndex,
                getKanjiInfo: getKanjiInfoMap,
                fetchFreeDictionary: (word) => fetchFreeDictionary(word, redis),
                fetchSynonyms: (word) => fetchDatamuseSynonyms(word, redis),
                fetchWiktionary: (headword, lang) => fetchWiktionary(headword, lang, redis),
                onRemoteError: (source, error) =>
                  logger.warn("dictionary remote source failed", {
                    source,
                    error: error instanceof Error ? error.message : String(error),
                  }),
              },
              { locale: parsed.data.locale }
            );
            const final = await pending.final;
            await writeLookupCache(redis, lookupKey, final);
            return final;
          })()));
      logger.info("dictionary enrich", {
        lang: result.lang,
        entries: result.entries.length,
        sources: result.sources,
        cache: inflight ? "inflight" : "lookup",
      });
      res.setHeader("Cache-Control", dictionaryHttpCacheControl(result.notFound));
      logger.response(200, Date.now() - startTime);
      res.status(200).json(result);
    } catch (error) {
      logger.error("dictionary enrich failed", error);
      logger.response(503, Date.now() - startTime);
      res.status(503).json({ error: "dictionary_unavailable" });
    }
  }
);
