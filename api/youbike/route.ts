import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  DEFAULT_OSRM_BIKE_URL,
  YOUBIKE_BIKE_ROUTE_CACHE_TTL_SECONDS,
  YOUBIKE_BIKE_ROUTE_TIMEOUT_MS,
  buildOsrmBikeUrl,
  parseBikeRouteQuery,
  parseOsrmRoute,
  youbikeBikeRouteCacheKey,
  type BikeRouteResult,
} from "../../src/apps/maps/youbike/bikeRoute";

const RL_BURST_WINDOW = 60;
const RL_DAILY_WINDOW = 60 * 60 * 24;

type RedisLike = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, opts?: { ex?: number }) => Promise<unknown>;
};

function osrmTemplate(): string {
  const override = process.env.YOUBIKE_BIKE_ROUTE_URL_TEMPLATE?.trim();
  return override && override.length > 0 ? override : DEFAULT_OSRM_BIKE_URL;
}

async function fetchOsrmBike(
  url: string
): Promise<BikeRouteResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOUBIKE_BIKE_ROUTE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "ryOS-maps-youbike/1.0",
      },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    return parseOsrmRoute(payload, "osrm-bike");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default apiHandler(
  { methods: ["GET"] },
  async ({ req, res, redis, logger, startTime }) => {
    try {
      const ip = getClientIp(req);
      const rl = await RateLimit.checkBurstAndDailyLimits({
        namespace: "youbike-route",
        identifierParts: ["ip", ip],
        burst: { windowSeconds: RL_BURST_WINDOW, limit: 20 },
        daily: { windowSeconds: RL_DAILY_WINDOW, limit: 400 },
      });
      if (!rl.ok) {
        const fallbackWindow =
          rl.scope === "burst" ? RL_BURST_WINDOW : RL_DAILY_WINDOW;
        logger.warn("YouBike route rate limit exceeded", { ip, scope: rl.scope });
        logger.response(429, Date.now() - startTime);
        res.setHeader(
          "Retry-After",
          String(rl.result?.resetSeconds ?? fallbackWindow)
        );
        res.status(429).json({ error: "rate_limit_exceeded", scope: rl.scope });
        return;
      }
    } catch (error) {
      logger.error("YouBike route rate limit check failed", error);
    }

    const parsed = parseBikeRouteQuery({
      fromLat: req.query.fromLat,
      fromLng: req.query.fromLng,
      toLat: req.query.toLat,
      toLng: req.query.toLng,
    });
    if ("error" in parsed) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: parsed.error });
      return;
    }

    const cacheKey = youbikeBikeRouteCacheKey(parsed.from, parsed.to);
    const redisClient = redis as RedisLike;
    try {
      const cached = await redisClient.get<BikeRouteResult>(cacheKey);
      if (cached?.path && cached.path.length >= 8) {
        logger.info("YouBike bike route cache hit", {
          points: cached.path.length,
        });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ ...cached, cacheHit: true });
        return;
      }
    } catch {
      // ignore cache read failures
    }

    const url = buildOsrmBikeUrl(parsed.from, parsed.to, osrmTemplate());
    const routed = await fetchOsrmBike(url);
    if (!routed) {
      logger.error("YouBike bike route upstream failed");
      logger.response(502, Date.now() - startTime);
      res.status(502).json({ error: "bike_route_unavailable" });
      return;
    }

    try {
      await redisClient.set(cacheKey, routed, {
        ex: YOUBIKE_BIKE_ROUTE_CACHE_TTL_SECONDS,
      });
    } catch {
      // ignore cache write failures
    }

    logger.info("YouBike bike route", {
      points: routed.path.length,
      distanceMeters: Math.round(routed.distanceMeters),
      provider: routed.provider,
    });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ ...routed, cacheHit: false });
  }
);
