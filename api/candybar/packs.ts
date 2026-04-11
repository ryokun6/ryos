/**
 * GET /api/candybar/packs - List available icon packs from blob storage.
 *
 * Returns pack metadata stored in Redis. Pack icons are stored in blob storage.
 * If no packs exist yet, returns built-in sample packs using existing ryOS icons.
 */

import { apiHandler } from "../_utils/api-handler.js";
import {
  getBuiltInCandyBarPacks,
  type CandyBarIconPack as IconPack,
} from "./_builtInPacks";

export const runtime = "nodejs";
export const maxDuration = 10;

const PACKS_CACHE_KEY = "candybar:packs";
const CACHE_TTL = 300; // 5 minutes

export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
  },
  async ({ res, redis }): Promise<void> => {
    try {
      const cached = await redis.get(PACKS_CACHE_KEY);
      if (cached) {
        const packs: IconPack[] =
          typeof cached === "string" ? JSON.parse(cached) : (cached as IconPack[]);
        res.status(200).json({ packs });
        return;
      }
    } catch {
      // Cache miss or parse error, fall through
    }

    const packs = getBuiltInCandyBarPacks();

    try {
      await redis.set(PACKS_CACHE_KEY, JSON.stringify(packs), {
        ex: CACHE_TTL,
      });
    } catch {
      // Non-critical cache write failure
    }

    res.status(200).json({ packs });
  }
);
