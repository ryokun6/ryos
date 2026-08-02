import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { resolveProductLookupWithImage } from "./_helpers/_productLookup.js";

const QuerySchema = z.object({
  q: z.string().min(1).max(256),
});

export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
  },
  async ({ req, res, logger, startTime }) => {
    const ip = getClientIp(req);
    const rl = await RateLimit.checkCounterLimit({
      key: RateLimit.makeKey(["rl", "stuff", "product", "ip", ip]),
      windowSeconds: 60,
      limit: 30,
    });
    if (!rl.allowed) {
      logger.response(429, Date.now() - startTime);
      res.setHeader("Retry-After", String(rl.resetSeconds));
      res.status(429).json({ error: "rate_limit_exceeded" });
      return;
    }

    const parsed = QuerySchema.safeParse({
      q: typeof req.query.q === "string" ? req.query.q : "",
    });
    if (!parsed.success) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const result = await resolveProductLookupWithImage(parsed.data.q);
    if (result.found) {
      logger.info("product lookup hit", {
        source: result.source,
        queryKind: result.queryKind,
        hasImage: Boolean(result.imageDataUrl),
        resultCount: result.results.length,
      });
    } else {
      logger.info("product lookup miss", { queryKind: result.queryKind });
    }

    logger.response(200, Date.now() - startTime);
    res.status(200).json(result);
  }
);
