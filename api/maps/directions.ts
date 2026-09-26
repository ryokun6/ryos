import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { getDirections } from "../_utils/_mapkit-server.js";
import {
  MAPS_DIRECTIONS_CACHE_TTL_SECONDS,
  mapsDirectionsCacheKey,
  parseAppleMapsServerDirections,
  parseDirectionsQuery,
  serverTransportForMode,
} from "../../src/apps/maps/directions/serverDirections";
import type { DirectionsRoutePlan } from "../../src/apps/maps/directions/types";

const RL_BURST_WINDOW = 60;
const RL_DAILY_WINDOW = 60 * 60 * 24;

type RedisLike = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, opts?: { ex?: number }) => Promise<unknown>;
};

export default apiHandler(
  { methods: ["GET"] },
  async ({ req, res, redis, logger, startTime }) => {
    try {
      const ip = getClientIp(req);
      const rl = await RateLimit.checkBurstAndDailyLimits({
        namespace: "maps-directions",
        identifierParts: ["ip", ip],
        burst: { windowSeconds: RL_BURST_WINDOW, limit: 20 },
        daily: { windowSeconds: RL_DAILY_WINDOW, limit: 400 },
      });
      if (!rl.ok) {
        const fallbackWindow =
          rl.scope === "burst" ? RL_BURST_WINDOW : RL_DAILY_WINDOW;
        logger.warn("Maps directions rate limit exceeded", {
          ip,
          scope: rl.scope,
        });
        logger.response(429, Date.now() - startTime);
        res.setHeader(
          "Retry-After",
          String(rl.result?.resetSeconds ?? fallbackWindow)
        );
        res.status(429).json({ error: "rate_limit_exceeded", scope: rl.scope });
        return;
      }
    } catch (error) {
      logger.error("Maps directions rate limit check failed", error);
    }

    const parsed = parseDirectionsQuery({
      fromLat: req.query.fromLat,
      fromLng: req.query.fromLng,
      toLat: req.query.toLat,
      toLng: req.query.toLng,
      mode: req.query.mode,
    });
    if ("error" in parsed) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: parsed.error });
      return;
    }

    const destinationLabel =
      typeof req.query.destinationLabel === "string"
        ? req.query.destinationLabel.slice(0, 120)
        : "Destination";
    const cacheKey = mapsDirectionsCacheKey(parsed.from, parsed.to, parsed.mode);
    const redisClient = redis as RedisLike;
    try {
      const cached = await redisClient.get<DirectionsRoutePlan>(cacheKey);
      if (cached?.path && cached.path.length >= 2) {
        logger.info("Maps directions cache hit", {
          mode: parsed.mode,
          points: cached.path.length,
        });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ ...cached, cacheHit: true });
        return;
      }
    } catch {
      // ignore cache read failures
    }

    let payload: unknown;
    try {
      payload = await getDirections({
        origin: parsed.from,
        destination: parsed.to,
        transportType: serverTransportForMode(parsed.mode),
      });
    } catch (error) {
      logger.error("Maps directions upstream failed", error);
      logger.response(502, Date.now() - startTime);
      res.status(502).json({
        error:
          parsed.mode === "transit" ? "transit_unavailable" : "route_unavailable",
      });
      return;
    }

    const plan = parseAppleMapsServerDirections(payload, {
      mode: parsed.mode,
      origin: parsed.from,
      destination: parsed.to,
      destinationLabel,
    });
    if (!plan) {
      logger.error("Maps directions payload empty");
      logger.response(502, Date.now() - startTime);
      res.status(502).json({
        error:
          parsed.mode === "transit" ? "transit_unavailable" : "route_unavailable",
      });
      return;
    }

    try {
      await redisClient.set(cacheKey, plan, {
        ex: MAPS_DIRECTIONS_CACHE_TTL_SECONDS,
      });
    } catch {
      // ignore cache write failures
    }

    logger.info("Maps directions", {
      mode: parsed.mode,
      points: plan.path.length,
      distanceMeters: Math.round(plan.distanceMeters),
      provider: plan.provider,
    });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ ...plan, cacheHit: false });
  }
);
