import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  defaultProxyHeaders,
  parseVideoId,
  pickBestAudio,
  pickBestProgressive,
  resolveExtraction,
  ytDlpBinary,
  type ExtractedFormat,
} from "./_extractor.js";

export const runtime = "nodejs";
// Long-running streaming endpoint: cap is per-request, not per-user.
export const maxDuration = 300;

/**
 * GET /api/youtube/stream?id=<videoId>&type=video|audio&fmt=<format_id?>
 *
 * Server-side byte proxy for the resolved yt-dlp media URL. Required
 * because googlevideo.com signed URLs are tied to the User-Agent,
 * `Origin`, and `Referer` that yt-dlp's `web` client used to extract
 * them — fetching them directly from a browser typically returns 403
 * even when the URL itself hasn't expired (see the yt-dlp FAQ on
 * "HTTP Error 403: Forbidden"). Routing the bytes through this endpoint
 * lets us replay the correct headers and refresh the URL when it
 * really has expired.
 *
 * Forwards `Range` requests in both directions so the client retains
 * native HTML5 `<video>` seeking. Forwards `Content-Length`,
 * `Content-Range`, `Accept-Ranges`, and `Last-Modified` from upstream.
 *
 * Refetches yt-dlp once if upstream returns 403 / 410 (the URL signature
 * went stale before our cache TTL did).
 */

/** Headers we forward from the upstream googlevideo response to the client. */
const FORWARD_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
  "cache-control",
  "expires",
]);

/** Minimal subset of headers we forward from the client to googlevideo. */
const FORWARD_REQUEST_HEADERS = ["range", "if-range", "if-modified-since"] as const;

function pickFormat(
  payload: Awaited<ReturnType<typeof resolveExtraction>>["payload"],
  type: "video" | "audio",
  preferredFormatId: string | null
): ExtractedFormat | null {
  if (preferredFormatId) {
    const exact = payload.formats.find((f) => f.formatId === preferredFormatId);
    if (exact) return exact;
  }
  if (type === "audio") return pickBestAudio(payload.formats) ?? payload.bestAudio ?? null;
  return pickBestProgressive(payload.formats) ?? payload.best ?? null;
}

function getRequestHeader(
  req: { headers: Record<string, string | string[] | undefined> },
  name: string
): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

async function performUpstreamFetch(
  format: ExtractedFormat,
  clientReq: { headers: Record<string, string | string[] | undefined> }
): Promise<Response> {
  const headers: Record<string, string> = {
    ...defaultProxyHeaders(),
    ...(format.httpHeaders ?? {}),
  };
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = getRequestHeader(clientReq, name);
    if (value) headers[name.replace(/(^|-)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase())] = value;
  }
  // We always handle redirects ourselves so we can keep the same headers
  // across hops (googlevideo redirects between rrN sub-CDNs frequently).
  return fetch(format.url, { headers, redirect: "follow" });
}

export default apiHandler(
  { methods: ["GET", "HEAD"], contentType: null },
  async ({ req, res, redis, logger, startTime }) => {
    const idParam = (req.query.id as string | undefined) || undefined;
    const urlParam = (req.query.url as string | undefined) || undefined;
    const typeParam = ((req.query.type as string | undefined) || "video").toLowerCase();
    const fmtParam = (req.query.fmt as string | undefined) || null;

    const videoId = parseVideoId(idParam || urlParam || "");
    if (!videoId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Missing or invalid YouTube id/url" });
      return;
    }
    const type: "video" | "audio" = typeParam === "audio" ? "audio" : "video";

    // Rate limit byte-proxy hits separately from `extract`. Keep this
    // generous because a single playback session legitimately makes many
    // Range requests as the user seeks.
    try {
      const ip = getClientIp(req);
      const burst = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey(["rl", "yt-stream", "burst", "ip", ip]),
        windowSeconds: 60,
        limit: 240,
      });
      if (!burst.allowed) {
        res.setHeader("Retry-After", String(burst.resetSeconds ?? 60));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({ error: "rate_limit_exceeded", scope: "burst" });
        return;
      }
    } catch (err) {
      logger.error("Rate limit check failed (yt-stream)", err);
    }

    let payload;
    try {
      payload = (await resolveExtraction(videoId, { redis, logger })).payload;
    } catch (err) {
      const message = (err as Error).message || String(err);
      const isMissingBin =
        /ENOENT|not found|spawn/i.test(message) &&
        /yt-dlp/i.test(message + " " + ytDlpBinary());
      const status = isMissingBin ? 503 : 502;
      logger.error("yt-dlp failure (stream)", { videoId, message });
      logger.response(status, Date.now() - startTime);
      res.status(status).json({
        error: isMissingBin
          ? "yt-dlp binary not available on the server"
          : "Failed to extract YouTube video",
        detail: message.slice(0, 500),
      });
      return;
    }

    let format = pickFormat(payload, type, fmtParam);
    if (!format) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "no_playable_format", videoId, type });
      return;
    }

    let upstream: Response;
    try {
      upstream = await performUpstreamFetch(format, req);
    } catch (err) {
      logger.error("upstream fetch failed", { videoId, err: String(err) });
      logger.response(502, Date.now() - startTime);
      res.status(502).json({ error: "upstream_fetch_failed" });
      return;
    }

    // Refresh-on-stale: if googlevideo decided this signed URL is no
    // good (most often 403, sometimes 410), re-run yt-dlp once and try
    // a fresh URL. Anything else we forward as-is.
    if (upstream.status === 403 || upstream.status === 410) {
      logger.warn("upstream rejected signed URL, refreshing", {
        videoId,
        upstreamStatus: upstream.status,
      });
      try {
        upstream.body?.cancel().catch(() => undefined);
      } catch {
        /* ignore */
      }
      try {
        const refreshed = (
          await resolveExtraction(videoId, { redis, logger }, { refresh: true })
        ).payload;
        const refreshedFormat = pickFormat(refreshed, type, fmtParam);
        if (refreshedFormat) {
          format = refreshedFormat;
          upstream = await performUpstreamFetch(format, req);
        }
      } catch (err) {
        logger.error("refresh-after-403 failed", { videoId, err: String(err) });
      }
    }

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (FORWARD_RESPONSE_HEADERS.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    if (!res.getHeader("content-type") && format.mimeType) {
      res.setHeader("Content-Type", format.mimeType);
    }
    if (!res.getHeader("accept-ranges")) {
      res.setHeader("Accept-Ranges", "bytes");
    }
    // Allow short browser-side caching of the proxied bytes; the URL is
    // stable as long as `?id` + `?fmt` don't change.
    if (!res.getHeader("cache-control")) {
      res.setHeader("Cache-Control", "private, max-age=300");
    }

    if (req.method === "HEAD" || !upstream.body) {
      res.end();
      return;
    }

    // Pipe upstream → response. We use the underlying ReadableStream
    // reader rather than `pipeTo()` so client disconnects (req `close`)
    // cleanly cancel the upstream fetch and free the socket.
    const reader = upstream.body.getReader();
    let aborted = false;

    const onClose = () => {
      aborted = true;
      try {
        reader.cancel().catch(() => undefined);
      } catch {
        /* ignore */
      }
    };
    if (typeof (req as { on?: (e: string, cb: () => void) => void }).on === "function") {
      (req as { on: (e: string, cb: () => void) => void }).on("close", onClose);
      (req as { on: (e: string, cb: () => void) => void }).on("aborted", onClose);
    }

    try {
      while (!aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          // Stop pumping if the client socket already disappeared. Some
          // shims return false from write(); others throw.
          const ok = res.write(Buffer.from(value));
          if (ok === false) {
            // Wait briefly for drain in node-style streams; otherwise just
            // continue — the BunResponseShim has no drain backpressure.
            const maybeOnce =
              (res as { once?: (e: string, cb: () => void) => void }).once;
            if (typeof maybeOnce === "function") {
              await new Promise<void>((resolve) =>
                maybeOnce.call(res, "drain", resolve)
              );
            }
          }
        }
      }
    } catch (err) {
      logger.warn("stream pump aborted", { videoId, err: String(err) });
    } finally {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
  }
);
