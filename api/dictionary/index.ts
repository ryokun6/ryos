import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  DICTIONARY_LANGUAGES,
  DICTIONARY_QUERY_MAX_LENGTH,
} from "../../src/shared/dictionary.js";
import { getDictionaryIndex, getKanjiInfoMap } from "./_helpers/_datasets.js";
import { lookupDictionary } from "./_helpers/_lookup.js";
import {
  fetchDatamuseSynonyms,
  fetchFreeDictionary,
  fetchWiktionary,
} from "./_helpers/_remote.js";

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(DICTIONARY_QUERY_MAX_LENGTH),
  lang: z.enum(["auto", ...DICTIONARY_LANGUAGES]).default("auto"),
});

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
    });
    if (!parsed.success) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "validation_error" });
      return;
    }

    try {
      const result = await lookupDictionary(parsed.data.q, parsed.data.lang, {
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
      });
      logger.info("dictionary lookup", {
        lang: result.lang,
        entries: result.entries.length,
        sources: result.sources,
      });
      res.setHeader("Cache-Control", "public, max-age=300");
      logger.response(200, Date.now() - startTime);
      res.status(200).json(result);
    } catch (error) {
      logger.error("dictionary lookup failed", error);
      logger.response(503, Date.now() - startTime);
      res.status(503).json({ error: "dictionary_unavailable" });
    }
  }
);
