import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  YOUBIKE_CACHE_TTL_SECONDS,
  YOUBIKE_FEED_TIMEOUT_MS,
  YOUBIKE_OPEN_DATA_FEEDS,
} from "../../src/apps/maps/youbike/feeds";
import {
  filterStationsInBBox,
  parseBBoxQuery,
} from "../../src/apps/maps/youbike/geo";
import {
  mergeYouBikeStations,
  parseYouBikeStations,
} from "../../src/apps/maps/youbike/parseStations";
import type {
  GeoBBox,
  YouBikeFeedStatus,
  YouBikeStation,
} from "../../src/apps/maps/youbike/types";

const RL_BURST_WINDOW = 60;
const RL_DAILY_WINDOW = 60 * 60 * 24;
const CACHE_KEY = "cache:youbike:stations:v1";

interface CachedPayload {
  fetchedAt: number;
  stations: YouBikeStation[];
  sources: YouBikeFeedStatus[];
}

async function fetchFeedJson(
  url: string,
  signal: AbortSignal
): Promise<unknown> {
  const response = await fetch(url, {
    redirect: "follow",
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "ryOS-maps-youbike/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (
    contentType.includes("text/html") ||
    text.trimStart().startsWith("<")
  ) {
    throw new Error("non_json_response");
  }
  return JSON.parse(text) as unknown;
}

async function loadStationsFromFeeds(): Promise<CachedPayload> {
  const results = await Promise.all(
    YOUBIKE_OPEN_DATA_FEEDS.map(async (feed) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), YOUBIKE_FEED_TIMEOUT_MS);
      try {
        const payload = await fetchFeedJson(feed.url, controller.signal);
        const stations = parseYouBikeStations(payload, {
          source: feed.id,
          city: feed.city,
        });
        const status: YouBikeFeedStatus = {
          id: feed.id,
          city: feed.city,
          ok: stations.length > 0,
          count: stations.length,
          error: stations.length === 0 ? "empty" : undefined,
        };
        return { stations, status };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "fetch_failed";
        return {
          stations: [] as YouBikeStation[],
          status: {
            id: feed.id,
            city: feed.city,
            ok: false,
            count: 0,
            error: message,
          } satisfies YouBikeFeedStatus,
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return {
    fetchedAt: Date.now(),
    stations: mergeYouBikeStations(results.map((result) => result.stations)),
    sources: results.map((result) => result.status),
  };
}

function applyBBox(payload: CachedPayload, bbox: GeoBBox | null): CachedPayload {
  if (!bbox) return payload;
  return {
    ...payload,
    stations: filterStationsInBBox(payload.stations, bbox),
  };
}

export default apiHandler(
  { methods: ["GET"] },
  async ({ req, res, redis, logger, startTime }) => {
    try {
      const ip = getClientIp(req);
      const rl = await RateLimit.checkBurstAndDailyLimits({
        namespace: "youbike",
        identifierParts: ["ip", ip],
        burst: { windowSeconds: RL_BURST_WINDOW, limit: 30 },
        daily: { windowSeconds: RL_DAILY_WINDOW, limit: 2000 },
      });
      if (!rl.ok) {
        const fallbackWindow =
          rl.scope === "burst" ? RL_BURST_WINDOW : RL_DAILY_WINDOW;
        logger.warn("YouBike rate limit exceeded", { ip, scope: rl.scope });
        logger.response(429, Date.now() - startTime);
        res.setHeader(
          "Retry-After",
          String(rl.result?.resetSeconds ?? fallbackWindow)
        );
        res.status(429).json({ error: "rate_limit_exceeded", scope: rl.scope });
        return;
      }
    } catch (error) {
      logger.error("YouBike rate limit check failed", error);
    }

    const bbox = parseBBoxQuery({
      south: req.query.south,
      west: req.query.west,
      north: req.query.north,
      east: req.query.east,
    });
    if (
      req.query.south ||
      req.query.west ||
      req.query.north ||
      req.query.east
    ) {
      if (!bbox) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "invalid_bbox" });
        return;
      }
    }

    let cacheHit = false;
    let payload: CachedPayload | null = null;
    try {
      const cached = await redis.get<CachedPayload>(CACHE_KEY);
      if (cached?.stations && Array.isArray(cached.stations)) {
        payload = cached;
        cacheHit = true;
      }
    } catch (error) {
      logger.warn("YouBike cache read failed", error);
    }

    if (!payload) {
      payload = await loadStationsFromFeeds();
      if (payload.stations.length === 0) {
        logger.error("YouBike feeds returned no stations", {
          sources: payload.sources,
        });
        logger.response(502, Date.now() - startTime);
        res.status(502).json({
          error: "youbike_feeds_unavailable",
          sources: payload.sources,
        });
        return;
      }
      try {
        await redis.set(CACHE_KEY, payload, { ex: YOUBIKE_CACHE_TTL_SECONDS });
      } catch (error) {
        logger.warn("YouBike cache write failed", error);
      }
    }

    const filtered = applyBBox(payload, bbox);
    logger.info("YouBike stations", {
      count: filtered.stations.length,
      cacheHit,
      sources: payload.sources.filter((source) => source.ok).map((s) => s.id),
    });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      stations: filtered.stations,
      fetchedAt: payload.fetchedAt,
      cacheHit,
      sources: payload.sources,
    });
  }
);
