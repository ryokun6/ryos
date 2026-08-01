import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";

const QuerySchema = z.object({
  barcode: z.string().min(1).max(128),
});

interface LookupResult {
  found: boolean;
  title?: string;
  brand?: string;
  imageUrl?: string;
  productUrl?: string;
  source?: string;
}

async function lookupOpenFoodFacts(barcode: string): Promise<LookupResult | null> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      {
        headers: { "User-Agent": "ryOS-Stuff/1.0 (https://os.ryo.lu)" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        product_name_en?: string;
        brands?: string;
        image_url?: string;
        image_front_url?: string;
        url?: string;
      };
    };
    if (data.status !== 1 || !data.product) return null;
    const title =
      data.product.product_name_en || data.product.product_name || undefined;
    if (!title) return null;
    return {
      found: true,
      title,
      brand: data.product.brands || undefined,
      imageUrl: data.product.image_front_url || data.product.image_url,
      productUrl: data.product.url,
      source: "openfoodfacts",
    };
  } catch {
    return null;
  }
}

async function lookupUpcItemDb(barcode: string): Promise<LookupResult | null> {
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      code?: string;
      items?: Array<{
        title?: string;
        brand?: string;
        images?: string[];
        offers?: Array<{ link?: string }>;
      }>;
    };
    const item = data.items?.[0];
    if (!item?.title) return null;
    return {
      found: true,
      title: item.title,
      brand: item.brand || undefined,
      imageUrl: item.images?.[0],
      productUrl: item.offers?.[0]?.link,
      source: "upcitemdb",
    };
  } catch {
    return null;
  }
}

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

    const barcode = parsed.data.barcode.replace(/\s+/g, "");
    const off = await lookupOpenFoodFacts(barcode);
    if (off) {
      logger.info("barcode lookup hit", { source: "openfoodfacts", barcode });
      logger.response(200, Date.now() - startTime);
      res.status(200).json(off);
      return;
    }

    const upc = await lookupUpcItemDb(barcode);
    if (upc) {
      logger.info("barcode lookup hit", { source: "upcitemdb", barcode });
      logger.response(200, Date.now() - startTime);
      res.status(200).json(upc);
      return;
    }

    logger.info("barcode lookup miss", { barcode });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ found: false });
  }
);
