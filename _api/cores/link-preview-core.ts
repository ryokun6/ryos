import * as RateLimit from "../_utils/_rate-limit.js";
import { safeFetchWithRedirects, validatePublicUrl, SsrfBlockedError } from "../_utils/_ssrf.js";
import type { CoreResponse } from "../_runtime/core-types.js";

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
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  );
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

  const oembedData = await response.json();
  return {
    url,
    title: oembedData.title || `YouTube Video: ${videoId}`,
    description: `By ${oembedData.author_name || "Unknown"} on YouTube`,
    image:
      oembedData.thumbnail_url ||
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    siteName: "YouTube",
  };
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

interface LinkPreviewCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  urlParam: string | undefined;
  ip: string;
}

export async function executeLinkPreviewCore(
  input: LinkPreviewCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: "Unauthorized" };
  }

  if (input.method !== "GET") {
    return { status: 405, body: "Method not allowed" };
  }

  try {
    try {
      const BURST_WINDOW = 60;
      const GLOBAL_LIMIT = 10;

      const globalKey = RateLimit.makeKey(["rl", "preview", "ip", input.ip]);
      const global = await RateLimit.checkCounterLimit({
        key: globalKey,
        windowSeconds: BURST_WINDOW,
        limit: GLOBAL_LIMIT,
      });
      if (!global.allowed) {
        return {
          status: 429,
          body: {
            error: "rate_limit_exceeded",
            scope: "global",
            limit: GLOBAL_LIMIT,
            retryAfter: global.resetSeconds ?? BURST_WINDOW,
          },
        };
      }

      if (input.urlParam) {
        try {
          const hostname = new URL(input.urlParam).hostname.toLowerCase();
          const hostKey = RateLimit.makeKey([
            "rl",
            "preview",
            "ip",
            input.ip,
            "host",
            hostname,
          ]);
          const host = await RateLimit.checkCounterLimit({
            key: hostKey,
            windowSeconds: BURST_WINDOW,
            limit: 5,
          });
          if (!host.allowed) {
            return {
              status: 429,
              body: {
                error: "rate_limit_exceeded",
                scope: "host",
                limit: 5,
                retryAfter: host.resetSeconds ?? BURST_WINDOW,
              },
            };
          }
        } catch {
          // Ignore invalid URL parse or missing hostname
        }
      }
    } catch {
      // best-effort rate limiting
    }

    const url = input.urlParam;
    if (!url || typeof url !== "string") {
      return { status: 400, body: { error: "No URL provided" } };
    }

    try {
      await validatePublicUrl(url);
    } catch (error) {
      const message =
        error instanceof SsrfBlockedError ? error.message : "Invalid URL format";
      return { status: 400, body: { error: message } };
    }

    if (isYouTubeUrl(url)) {
      try {
        const metadata = await getYouTubeMetadata(url);
        return {
          status: 200,
          headers: { "Cache-Control": "public, max-age=3600" },
          body: metadata,
        };
      } catch {
        // Fall back to general scraping if YouTube API fails
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
      return {
        status: response.status,
        body: { error: `HTTP error! status: ${response.status}` },
      };
    }

    const html = await response.text();
    const metadata: LinkMetadata = { url: finalUrl };

    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim().replace(/\s+/g, " ");
    }

    const ogTitleMatch = html.match(
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i
    );
    if (ogTitleMatch) metadata.title = ogTitleMatch[1].trim();

    const ogDescriptionMatch = html.match(
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i
    );
    if (ogDescriptionMatch) metadata.description = ogDescriptionMatch[1].trim();

    const ogImageMatch = html.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i
    );
    if (ogImageMatch) {
      const imageUrl = ogImageMatch[1].trim();
      try {
        metadata.image = new URL(imageUrl, finalUrl).href;
      } catch {
        metadata.image = imageUrl;
      }
    }

    const ogSiteNameMatch = html.match(
      /<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i
    );
    if (ogSiteNameMatch) metadata.siteName = ogSiteNameMatch[1].trim();

    if (!metadata.title) {
      const twitterTitleMatch = html.match(
        /<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["'][^>]*>/i
      );
      if (twitterTitleMatch) metadata.title = twitterTitleMatch[1].trim();
    }

    if (!metadata.description) {
      const twitterDescriptionMatch = html.match(
        /<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["'][^>]*>/i
      );
      if (twitterDescriptionMatch) metadata.description = twitterDescriptionMatch[1].trim();
    }

    if (!metadata.image) {
      const twitterImageMatch = html.match(
        /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i
      );
      if (twitterImageMatch) {
        const imageUrl = twitterImageMatch[1].trim();
        try {
          metadata.image = new URL(imageUrl, finalUrl).href;
        } catch {
          metadata.image = imageUrl;
        }
      }
    }

    if (!metadata.description) {
      const metaDescriptionMatch = html.match(
        /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i
      );
      if (metaDescriptionMatch) metadata.description = metaDescriptionMatch[1].trim();
    }

    if (!metadata.siteName) {
      metadata.siteName = new URL(finalUrl).hostname;
    }

    if (metadata.title) metadata.title = decodeHtml(metadata.title);
    if (metadata.description) metadata.description = decodeHtml(metadata.description);
    if (metadata.siteName) metadata.siteName = decodeHtml(metadata.siteName);

    return {
      status: 200,
      headers: { "Cache-Control": "public, max-age=3600" },
      body: metadata,
    };
  } catch (error: unknown) {
    let status = 500;
    let errorMessage = "Error fetching link preview";

    if (error instanceof SsrfBlockedError) {
      status = 400;
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
      if (error.name === "AbortError") {
        status = 408;
        errorMessage = "Request timeout";
      } else if (
        error.name === "TypeError" &&
        error.message.includes("fetch")
      ) {
        status = 503;
        errorMessage = "Network error";
      }
    }

    return { status, body: { error: errorMessage } };
  }
}
