import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  parseVideoId,
  resolveExtraction,
  ytDlpBinary,
  type ExtractedFormat,
  type ExtractResponse,
} from "./_extractor.js";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/youtube/extract?id=<videoId>|url=<youtubeUrl>
 *
 * Resolves the YouTube URL into direct media URLs via yt-dlp (cached in
 * Redis for ~5h). The response also includes `proxyUrl` /
 * `proxyAudioUrl` pointing at `/api/youtube/stream` so the player can
 * route bytes through this server — that's required in production
 * because googlevideo.com signed URLs are tied to the User-Agent /
 * Origin / Referer that yt-dlp used to extract them and would 403 when
 * fetched directly from a browser.
 */

interface ProxyAugmentedResponse extends ExtractResponse {
  /** Same-origin URL the player should set as `<video src>`. */
  proxyUrl: string | null;
  /** Same-origin URL for the audio-only stream (when only audio exists). */
  proxyAudioUrl: string | null;
}

function buildProxyUrl(
  videoId: string,
  best: ExtractedFormat | null,
  type: "video" | "audio"
): string | null {
  if (!best) return null;
  const params = new URLSearchParams({ id: videoId, type });
  if (best.formatId) params.set("fmt", best.formatId);
  return `/api/youtube/stream?${params.toString()}`;
}

export default apiHandler(
  { methods: ["GET"] },
  async ({ req, res, redis, logger, startTime }) => {
    const idParam = (req.query.id as string | undefined) || undefined;
    const urlParam = (req.query.url as string | undefined) || undefined;
    const noCache = req.query.refresh === "1" || req.query.nocache === "1";

    const videoId = parseVideoId(idParam || urlParam || "");
    if (!videoId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Missing or invalid YouTube id/url" });
      return;
    }

    try {
      const ip = getClientIp(req);
      const burst = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey(["rl", "yt-extract", "burst", "ip", ip]),
        windowSeconds: 60,
        limit: 30,
      });
      if (!burst.allowed) {
        res.setHeader("Retry-After", String(burst.resetSeconds ?? 60));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({ error: "rate_limit_exceeded", scope: "burst" });
        return;
      }
      const daily = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey(["rl", "yt-extract", "daily", "ip", ip]),
        windowSeconds: 60 * 60 * 24,
        limit: 500,
      });
      if (!daily.allowed) {
        res.setHeader("Retry-After", String(daily.resetSeconds ?? 60 * 60 * 24));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({ error: "rate_limit_exceeded", scope: "daily" });
        return;
      }
    } catch (err) {
      logger.error("Rate limit check failed (yt-extract)", err);
    }

    let payload: ExtractResponse;
    let cacheStatus: "HIT" | "MISS";
    try {
      const result = await resolveExtraction(
        videoId,
        { redis, logger },
        { refresh: noCache }
      );
      payload = result.payload;
      cacheStatus = result.cache;
    } catch (err) {
      const message = (err as Error).message || String(err);
      logger.error("yt-dlp failure", { videoId, message });
      const isMissingBin =
        /ENOENT|not found|spawn/i.test(message) &&
        /yt-dlp/i.test(message + " " + ytDlpBinary());
      const status = isMissingBin ? 503 : 502;
      logger.response(status, Date.now() - startTime);
      res.status(status).json({
        error: isMissingBin
          ? "yt-dlp binary not available on the server"
          : "Failed to extract YouTube video",
        detail: message.slice(0, 500),
      });
      return;
    }

    if (!payload.best && !payload.bestAudio) {
      logger.response(502, Date.now() - startTime);
      res.status(502).json({
        error: "No playable formats found",
        videoId,
      });
      return;
    }

    const augmented: ProxyAugmentedResponse = {
      ...payload,
      proxyUrl: buildProxyUrl(videoId, payload.best, "video"),
      proxyAudioUrl: buildProxyUrl(videoId, payload.bestAudio, "audio"),
    };

    res.setHeader("X-Yt-Extract-Cache", cacheStatus);
    logger.response(200, Date.now() - startTime);
    res.status(200).json(augmented);
  }
);
