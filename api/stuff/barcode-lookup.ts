import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { resolveProductLookupWithImage } from "./_helpers/_productLookup.js";

const QuerySchema = z.object({
  barcode: z.string().min(1).max(128),
});

export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
  },
  async ({ req, res, logger, startTime }) => {
    const ip = getClientIp(req);
    const rl = await RateLimit.checkCounterLimit({
      key: RateLimit.makeKey(["rl", "stuff", "barcode", "ip", ip]),
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
      barcode: typeof req.query.barcode === "string" ? req.query.barcode : "",
    });
    if (!parsed.success) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const result = await resolveProductLookupWithImage(parsed.data.barcode);
    if (result.found) {
      logger.info("barcode lookup hit", {
        source: result.source,
        queryKind: result.queryKind,
        hasImage: Boolean(result.imageDataUrl),
      });
    } else {
      logger.info("barcode lookup miss");
    }

    logger.response(200, Date.now() - startTime);
    res.status(200).json(result);
  }
);
