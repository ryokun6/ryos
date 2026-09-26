/**
 * GET /api/geo
 *
 * Approximate city for the request IP. Reuses the same Redis-cached
 * `resolveIpGeolocation` path as chat / weather / analytics (ipwho.is by
 * default). Cloudflare / Vercel geo headers are honoured when present so
 * we skip the outbound lookup.
 */

import { apiHandler } from "./_utils/api-handler.js";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import {
  ipGeolocationFromRequestHeaders,
  resolveIpGeolocation,
} from "./_utils/_geolocation.js";
import { buildGeoLookupResponse } from "../src/shared/ipGeolocation.js";

const RL_BURST_WINDOW = 60;
const RL_DAILY_WINDOW = 60 * 60 * 24;

export default apiHandler(
  { methods: ["GET"], auth: "none" },
  async ({ req, res, redis, logger, startTime }) => {
    const ip = getClientIp(req);
    try {
      const rl = await RateLimit.checkBurstAndDailyLimits({
        namespace: "geo",
        identifierParts: ["ip", ip],
        burst: { windowSeconds: RL_BURST_WINDOW, limit: 30 },
        daily: { windowSeconds: RL_DAILY_WINDOW, limit: 2000 },
      });
      if (!rl.ok) {
        const fallbackWindow =
          rl.scope === "burst" ? RL_BURST_WINDOW : RL_DAILY_WINDOW;
        logger.warn("Geo lookup rate limit exceeded", { ip, scope: rl.scope });
        logger.response(429, Date.now() - startTime);
        res.setHeader(
          "Retry-After",
          String(rl.result?.resetSeconds ?? fallbackWindow)
        );
        res.status(429).json({ error: "rate_limit_exceeded", scope: rl.scope });
        return;
      }
    } catch (error) {
      logger.error("Geo lookup rate limit check failed", error);
    }

    const existing = ipGeolocationFromRequestHeaders(req.headers);
    const resolved = await resolveIpGeolocation({
      ip,
      redis,
      existing,
      log: (...args) => logger.info(args.map(String).join(" ")),
      logError: (...args) => logger.warn(args.map(String).join(" ")),
    });
    const payload = buildGeoLookupResponse(resolved);
    logger.info("Geo lookup", {
      ip,
      source: payload.source,
      city: payload.city ?? null,
    });
    logger.response(200, Date.now() - startTime);
    res.status(200).json(payload);
  }
);
