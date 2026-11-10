import { apiHandler } from "./_utils/api-handler.js";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { decodeHtmlEntitiesOnce } from "./_utils/html-entities.js";
import { safeFetchWithRedirects, validatePublicUrl, SsrfBlockedError } from "./_utils/_ssrf.js";
import { resolveSongShareLinkPreview } from "./_utils/og-share.js";
import { readResponseTextPrefix } from "./_utils/_ie-html.js";
import { extractLinkMetadataLinear } from "./_utils/_html-linear.js";

/** OG / Twitter tags live in <head>; refuse to buffer multi‑MB bodies. */
const LINK_PREVIEW_MAX_HTML_BYTES = 256_000;

interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/.test(url);
}

function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
  return match ? match[1] : null;
}

async function getYouTubeMetadata(url: string): Promise<LinkMetadata> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  const oembedUrl = `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`;

  const response = await fetch(oembedUrl, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch YouTube oEmbed data (${response.status})`);
  }

  const oembedData = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };

  return {
    url: url,
    title: oembedData.title || `YouTube Video: ${videoId}`,
    description: `By ${oembedData.author_name || 'Unknown'} on YouTube`,
    image: oembedData.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    siteName: "YouTube",
  };
}

export default apiHandler(
  { methods: ["GET"] },
  async ({ req, res, logger, startTime }) => {
    try {
      const ip = getClientIp(req);
      const BURST_WINDOW = 60;
      const GLOBAL_LIMIT = 10;

      const url = req.query.url as string | undefined;

      const globalKey = RateLimit.makeKey(["rl", "preview", "ip", ip]);
      const global = await RateLimit.checkCounterLimit({
        key: globalKey,
        windowSeconds: BURST_WINDOW,
        limit: GLOBAL_LIMIT,
      });
      if (!global.allowed) {
        logger.warn("Rate limit exceeded (global)", { ip });
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          error: "rate_limit_exceeded",
          scope: "global",
          limit: GLOBAL_LIMIT,
          retryAfter: global.resetSeconds ?? BURST_WINDOW,
        });
        return;
      }

      let hostname: string | null = null;
      if (url) {
        try {
          hostname = new URL(url).hostname.toLowerCase();
        } catch {
          hostname = null;
        }
      }

      if (hostname) {
        const hostKey = RateLimit.makeKey(["rl", "preview", "ip", ip, "host", hostname]);
        const host = await RateLimit.checkCounterLimit({
          key: hostKey,
          windowSeconds: BURST_WINDOW,
          limit: 5,
        });
        if (!host.allowed) {
          logger.warn("Rate limit exceeded (host)", { ip, hostname });
          logger.response(429, Date.now() - startTime);
          res.status(429).json({
            error: "rate_limit_exceeded",
            scope: "host",
            limit: 5,
            retryAfter: host.resetSeconds ?? BURST_WINDOW,
          });
          return;
        }
      }
    } catch (rlErr) {
      // Fail closed: a Redis/limiter outage must not turn the preview fetcher
      // into an unlimited outbound proxy.
      logger.error("Rate limit check failed", rlErr);
      logger.response(503, Date.now() - startTime);
      res.status(503).json({
        error: "rate_limit_unavailable",
        message: "Rate limiting is temporarily unavailable. Please try again shortly.",
      });
      return;
    }

    const url = req.query.url as string | undefined;

    if (!url || typeof url !== "string") {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "No URL provided" });
      return;
    }

    // Karaoke / iPod share links resolve from the Redis song library before
    // any outbound fetch. This also covers localhost share URLs that SSRF
    // checks would otherwise reject.
    try {
      const songPreview = await resolveSongShareLinkPreview(url);
      if (songPreview) {
        logger.info("Resolved song share preview", {
          url,
          source: songPreview.source,
          title: songPreview.title,
        });
        logger.response(200, Date.now() - startTime);
        res.setHeader(
          "Cache-Control",
          songPreview.source === "redis"
            ? "public, max-age=3600"
            : "public, max-age=60"
        );
        res.status(200).json({
          url: songPreview.url,
          title: songPreview.title,
          description: songPreview.description,
          image: songPreview.image,
          siteName: songPreview.siteName,
        });
        return;
      }
    } catch (error) {
      logger.error("Song share preview failed", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Error fetching link preview" });
      return;
    }

    try {
      await validatePublicUrl(url);
    } catch (error) {
      const message =
        error instanceof SsrfBlockedError
          ? error.message
          : "Invalid URL format";
      logger.warn("Blocked URL for link preview", { url, message });
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: message });
      return;
    }

    logger.info("Fetching preview for URL", { url });

    try {
      if (isYouTubeUrl(url)) {
        try {
          const metadata = await getYouTubeMetadata(url);
          logger.info("YouTube metadata fetched", { title: metadata.title });
          logger.response(200, Date.now() - startTime);
          res.setHeader("Cache-Control", "public, max-age=3600");
          res.status(200).json(metadata);
          return;
        } catch (error) {
          logger.error("Error fetching YouTube metadata", error);
        }
      }

      const { response, finalUrl } = await safeFetchWithRedirects(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            Connection: "keep-alive",
            "Upgrade-Insecure-Requests": "1",
          },
          signal: AbortSignal.timeout(10000),
        },
        { maxRedirects: 5 }
      );

      if (!response.ok) {
        logger.warn("HTTP error from upstream", { status: response.status });
        logger.response(response.status, Date.now() - startTime);
        res.status(response.status).json({ error: `HTTP error! status: ${response.status}` });
        return;
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (
        contentType &&
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml")
      ) {
        try {
          response.body?.cancel();
        } catch {
          /* ignore */
        }
        logger.warn("Non-HTML content type for link preview", { contentType });
        logger.response(415, Date.now() - startTime);
        res.status(415).json({ error: "URL did not return HTML" });
        return;
      }

      // Bound the read and use linear tag scans — unbounded response.text()
      // plus `/<meta[^>]*…/` regexes stalled the process on crafted pages.
      const html = await readResponseTextPrefix(
        response,
        LINK_PREVIEW_MAX_HTML_BYTES
      );
      const extracted = extractLinkMetadataLinear(
        html,
        LINK_PREVIEW_MAX_HTML_BYTES
      );

      const metadata: LinkMetadata = {
        url: finalUrl,
      };

      if (extracted.title) {
        metadata.title = decodeHtmlEntitiesOnce(extracted.title);
      }
      if (extracted.description) {
        metadata.description = decodeHtmlEntitiesOnce(extracted.description);
      }
      if (extracted.image) {
        try {
          metadata.image = new URL(extracted.image, finalUrl).href;
        } catch {
          metadata.image = extracted.image;
        }
      }
      if (extracted.siteName) {
        metadata.siteName = decodeHtmlEntitiesOnce(extracted.siteName);
      } else {
        metadata.siteName = new URL(finalUrl).hostname;
      }

      logger.info("Metadata extracted", { title: metadata.title, siteName: metadata.siteName });
      logger.response(200, Date.now() - startTime);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.status(200).json(metadata);

    } catch (error: unknown) {
      logger.error("Error fetching link preview", error);

      let status = 500;
      let errorMessage = "Error fetching link preview";

      if (error instanceof SsrfBlockedError) {
        status = 400;
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;

        if (error.name === "AbortError" || error.name === "TimeoutError") {
          errorMessage = "Request timeout";
          status = 408;
        } else if (error.name === "TypeError" && error.message.includes("fetch")) {
          errorMessage = "Network error";
          status = 503;
        }
      }

      logger.response(status, Date.now() - startTime);
      res.status(status).json({ error: errorMessage });
    }
  }
);
