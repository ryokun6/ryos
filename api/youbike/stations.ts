import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  YOUBIKE_FEED_TIMEOUT_MS,
  feedCacheTtlSeconds,
  feedTimeoutMs,
  feedsIntersectingBBox,
  youbikeFeedCacheKey,
  type YouBikeOpenDataFeed,
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

interface CachedFeed {
  fetchedAt: number;
  stations: YouBikeStation[];
  status: YouBikeFeedStatus;
}

type RedisLike = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, opts?: { ex?: number }) => Promise<unknown>;
};

const memoryFeedCache = new Map<
  string,
  { payload: CachedFeed; expiresAt: number }
>();
const inflightFeeds = new Map<string, Promise<CachedFeed>>();

function readMemoryFeed(feedId: string): CachedFeed | null {
  const cached = memoryFeedCache.get(feedId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    memoryFeedCache.delete(feedId);
    return null;
  }
  return cached.payload;
}

function writeMemoryFeed(
  feed: YouBikeOpenDataFeed,
  payload: CachedFeed
): void {
  memoryFeedCache.set(feed.id, {
    payload,
    expiresAt: Date.now() + feedCacheTtlSeconds(feed) * 1000,
  });
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

async function fetchFeed(
  feed: YouBikeOpenDataFeed,
  timeoutMs: number
): Promise<CachedFeed> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = await fetchFeedJson(feed.url, controller.signal);
    const stations = parseYouBikeStations(payload, {
      source: feed.id,
      city: feed.city,
    });
    return {
      fetchedAt: Date.now(),
      stations,
      status: {
        id: feed.id,
        city: feed.city,
        ok: stations.length > 0,
        count: stations.length,
        error: stations.length === 0 ? "empty" : undefined,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch_failed";
    return {
      fetchedAt: Date.now(),
      stations: [],
      status: {
        id: feed.id,
        city: feed.city,
        ok: false,
        count: 0,
        error: message,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readCachedFeed(
  redis: RedisLike,
  feed: YouBikeOpenDataFeed
): Promise<CachedFeed | null> {
  const memoryHit = readMemoryFeed(feed.id);
  if (memoryHit) return memoryHit;
  try {
    const cached = await redis.get<CachedFeed>(youbikeFeedCacheKey(feed.id));
    if (cached?.stations && Array.isArray(cached.stations) && cached.status) {
      writeMemoryFeed(feed, cached);
      return cached;
    }
  } catch {
    // ignore cache read failures
  }
  return null;
}

async function writeCachedFeed(
  redis: RedisLike,
  feed: YouBikeOpenDataFeed,
  payload: CachedFeed
): Promise<void> {
  if (!payload.status.ok) return;
  writeMemoryFeed(feed, payload);
  try {
    await redis.set(youbikeFeedCacheKey(feed.id), payload, {
      ex: feedCacheTtlSeconds(feed),
    });
  } catch {
    // ignore cache write failures (national dump may exceed Redis value limits)
  }
}

async function loadFeed(
  redis: RedisLike,
  feed: YouBikeOpenDataFeed,
  timeoutMs: number
): Promise<{ payload: CachedFeed; cacheHit: boolean }> {
  const cached = await readCachedFeed(redis, feed);
  if (cached) return { payload: cached, cacheHit: true };
  let inflight = inflightFeeds.get(feed.id);
  if (!inflight) {
    inflight = fetchFeed(feed, timeoutMs).finally(() => {
      inflightFeeds.delete(feed.id);
    });
    inflightFeeds.set(feed.id, inflight);
  }
  const payload = await inflight;
  await writeCachedFeed(redis, feed, payload);
  return { payload, cacheHit: false };
}

async function loadStationsForBBox(
  redis: RedisLike,
  bbox: GeoBBox | null
): Promise<{
  fetchedAt: number;
  stations: YouBikeStation[];
  sources: YouBikeFeedStatus[];
  cacheHit: boolean;
}> {
  const relevant = feedsIntersectingBBox(bbox);
  if (relevant.length === 0) {
    return { fetchedAt: Date.now(), stations: [], sources: [], cacheHit: true };
  }

  const results = await Promise.all(
    relevant.map((feed) =>
      loadFeed(redis, feed, feedTimeoutMs(feed, YOUBIKE_FEED_TIMEOUT_MS))
    )
  );

  return {
    fetchedAt: Math.max(Date.now(), ...results.map((result) => result.payload.fetchedAt)),
    stations: mergeYouBikeStations(
      results.map((result) => result.payload.stations)
    ),
    sources: results.map((result) => result.payload.status),
    cacheHit: results.every((result) => result.cacheHit),
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

    const payload = await loadStationsForBBox(redis, bbox);
    const stations = bbox
      ? filterStationsInBBox(payload.stations, bbox)
      : payload.stations;

    if (
      stations.length === 0 &&
      payload.sources.length > 0 &&
      !payload.sources.some((source) => source.ok)
    ) {
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

    logger.info("YouBike stations", {
      count: stations.length,
      cacheHit: payload.cacheHit,
      sources: payload.sources.filter((source) => source.ok).map((s) => s.id),
    });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      stations,
      fetchedAt: payload.fetchedAt,
      cacheHit: payload.cacheHit,
      sources: payload.sources,
    });
  }
);
