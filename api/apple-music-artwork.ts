import { apiHandler } from "./_utils/api-handler.js";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Resolve Apple Music catalog artwork (and basic metadata) for an `am:`
 * catalog song id using Apple's public iTunes Lookup API (no auth required).
 *
 * Apple Music songs cached in Redis frequently have no `cover` because the
 * client MusicKit artwork is never written server-side. The admin UI calls
 * this endpoint to display real cover art for `am:` songs. Results are cached
 * in Redis (artwork rarely changes) to avoid hammering Apple's API.
 */

const CACHE_PREFIX = "apple:artwork:";
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days for resolved artwork
const NEGATIVE_TTL_SECONDS = 60 * 60 * 24; // 1 day for "not found"

interface ArtworkResult {
  /** Cover URL with `{w}`/`{h}` size placeholders, or null when unavailable. */
  cover: string | null;
  artist?: string;
  title?: string;
  album?: string;
  url?: string;
}

interface ITunesLookupResult {
  artworkUrl100?: string;
  artistName?: string;
  trackName?: string;
  collectionName?: string;
  trackViewUrl?: string;
  collectionViewUrl?: string;
}

// Only numeric catalog ids can be resolved via the iTunes Lookup API.
// Library ids (`i.<hash>`), stations (`station:…`) and playlists
// (`playlist:…`) are not catalog songs and are skipped.
export function parseCatalogId(id: string | undefined): string | null {
  if (!id || typeof id !== "string" || !id.startsWith("am:")) return null;
  const body = id.slice(3);
  return /^\d+$/.test(body) ? body : null;
}

/**
 * Convert an iTunes `artworkUrlNNN` (e.g. `.../100x100bb.jpg`) into a sizeable
 * template by replacing the trailing `WxH` segment with `{w}x{h}`.
 */
export function toArtworkTemplate(artworkUrl: string): string {
  return artworkUrl.replace(/\d+x\d+(?=[a-z]*\.[a-z]+$)/i, "{w}x{h}");
}

export default apiHandler(
  { methods: ["GET"], analytics: false },
  async ({ req, res, redis, logger, startTime }) => {
    const id = req.query.id as string | undefined;
    const catalogId = parseCatalogId(id);

    if (!catalogId) {
      logger.response(400, Date.now() - startTime);
      res
        .status(400)
        .json({ error: "Expected an Apple Music catalog id (am:<number>)" });
      return;
    }

    // Per-IP rate limit to protect Apple's upstream API.
    try {
      const ip = getClientIp(req);
      const limit = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey(["rl", "am-artwork", "ip", ip]),
        windowSeconds: 60,
        limit: 60,
      });
      if (!limit.allowed) {
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          error: "rate_limit_exceeded",
          retryAfter: limit.resetSeconds ?? 60,
        });
        return;
      }
    } catch (e) {
      logger.error("Rate limit check failed", e);
    }

    const cacheKey = `${CACHE_PREFIX}${catalogId}`;

    // Serve from cache when available.
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed: ArtworkResult =
          typeof cached === "string" ? JSON.parse(cached) : (cached as ArtworkResult);
        res.setHeader("Cache-Control", "public, max-age=86400");
        logger.response(200, Date.now() - startTime);
        res.status(200).json(parsed);
        return;
      }
    } catch (e) {
      logger.warn("Artwork cache read failed", e);
    }

    let result: ArtworkResult = { cover: null };
    try {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(
        catalogId
      )}&entity=song`;
      const response = await fetch(lookupUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          results?: ITunesLookupResult[];
        };
        const match = data.results?.find((r) => r.artworkUrl100) ??
          data.results?.[0];
        if (match?.artworkUrl100) {
          result = {
            cover: toArtworkTemplate(match.artworkUrl100),
            artist: match.artistName,
            title: match.trackName,
            album: match.collectionName,
            url: match.trackViewUrl || match.collectionViewUrl,
          };
        }
      } else {
        logger.warn("iTunes lookup non-OK", { status: response.status });
      }
    } catch (e) {
      logger.error("iTunes lookup failed", e);
    }

    // Cache the result (positive longer than negative).
    try {
      await redis.set(cacheKey, JSON.stringify(result), {
        ex: result.cover ? CACHE_TTL_SECONDS : NEGATIVE_TTL_SECONDS,
      });
    } catch (e) {
      logger.warn("Artwork cache write failed", e);
    }

    res.setHeader(
      "Cache-Control",
      result.cover ? "public, max-age=86400" : "public, max-age=3600"
    );
    logger.response(result.cover ? 200 : 404, Date.now() - startTime);
    res.status(result.cover ? 200 : 404).json(result);
  }
);
