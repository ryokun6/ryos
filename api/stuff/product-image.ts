import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { fetchProductImageAsDataUrl } from "./_helpers/_productImage.js";

const QuerySchema = z.object({
  url: z.string().url().max(2048),
});

/**
 * Server-side product cover fetch for the Stuff client.
 * Avoids browser CORS when applying a multi-result picker candidate
 * that only has `imageUrl` (primary hit may already include `imageDataUrl`).
 */
export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
  },
  async ({ req, res, logger, startTime }) => {
    const ip = getClientIp(req);
    const rl = await RateLimit.checkCounterLimit({
      key: RateLimit.makeKey(["rl", "stuff", "product-image", "ip", ip]),
      windowSeconds: 60,
      limit: 60,
    });
    if (!rl.allowed) {
      logger.response(429, Date.now() - startTime);
      res.setHeader("Retry-After", String(rl.resetSeconds));
      res.status(429).json({ error: "rate_limit_exceeded" });
      return;
    }

    const parsed = QuerySchema.safeParse({
      url: typeof req.query.url === "string" ? req.query.url : "",
    });
    if (!parsed.success) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const imageDataUrl = await fetchProductImageAsDataUrl(parsed.data.url);
    if (!imageDataUrl) {
      logger.info("product image fetch failed");
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "image_fetch_failed" });
      return;
    }

    logger.info("product image fetch ok", {
      bytes: imageDataUrl.length,
    });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ imageDataUrl });
  }
);
