/**
 * GET /api/link-preview
 * 
 * Fetch metadata for a URL (title, description, image, etc.)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  setCorsHeaders,
  isOriginAllowed,
  getClientIpFromRequest,
} from "./_utils/middleware.js";
import * as RateLimit from "./_utils/_rate-limit.js";

export const config = {
  runtime: "nodejs",
};

interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

// Helper function to check if URL is YouTube
function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/.test(url);
}

// Helper function to extract YouTube video ID
function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
  return match ? match[1] : null;
}

// Helper function to get YouTube metadata using oEmbed API
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
    url: url,
    title: oembedData.title || `YouTube Video: ${videoId}`,
    description: `By ${oembedData.author_name || 'Unknown'} on YouTube`,
    image: oembedData.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    siteName: "YouTube",
  };
}

// Decode HTML entities
function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(parseInt(dec, 10)));
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const origin = req.headers.origin as string | undefined;

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, ["GET", "OPTIONS"]);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, ["GET", "OPTIONS"]);

  if (!isOriginAllowed(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // Rate limiting
    const ip = getClientIpFromRequest(req);
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
      res.setHeader("Retry-After", String(global.resetSeconds ?? BURST_WINDOW));
      res.status(429).json({
        error: "rate_limit_exceeded",
        limit: GLOBAL_LIMIT,
        retryAfter: global.resetSeconds ?? BURST_WINDOW,
        scope: "global",
      });
      return;
    }

    if (url) {
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        const hostKey = RateLimit.makeKey(["rl", "preview", "ip", ip, "host", hostname]);
        const host = await RateLimit.checkCounterLimit({
          key: hostKey,
          windowSeconds: BURST_WINDOW,
          limit: 5,
        });
        if (!host.allowed) {
          res.setHeader("Retry-After", String(host.resetSeconds ?? BURST_WINDOW));
          res.status(429).json({
            error: "rate_limit_exceeded",
            limit: 5,
            retryAfter: host.resetSeconds ?? BURST_WINDOW,
            scope: "host",
          });
          return;
        }
      } catch {
        // Ignore invalid URL parse
      }
    }

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "No URL provided" });
      return;
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      res.status(400).json({ error: "Invalid URL format" });
      return;
    }

    // Only allow HTTP and HTTPS URLs
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      res.status(400).json({ error: "Only HTTP and HTTPS URLs are allowed" });
      return;
    }

    // Handle YouTube URLs using oEmbed API
    if (isYouTubeUrl(url)) {
      try {
        const metadata = await getYouTubeMetadata(url);
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.status(200).json(metadata);
        return;
      } catch (error) {
        console.error("Error fetching YouTube metadata:", error);
        // Fall back to general scraping
      }
    }

    // Fetch the webpage
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      res.status(response.status).json({ error: `HTTP error! status: ${response.status}` });
      return;
    }

    const html = await response.text();
    
    // Extract metadata from HTML
    const metadata: LinkMetadata = { url };

    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim().replace(/\s+/g, ' ');
    }

    // Extract Open Graph tags
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogTitleMatch) metadata.title = ogTitleMatch[1].trim();

    const ogDescriptionMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogDescriptionMatch) metadata.description = ogDescriptionMatch[1].trim();

    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogImageMatch) {
      try {
        metadata.image = new URL(ogImageMatch[1].trim(), url).href;
      } catch {
        metadata.image = ogImageMatch[1].trim();
      }
    }

    const ogSiteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogSiteNameMatch) metadata.siteName = ogSiteNameMatch[1].trim();

    // Twitter Card fallbacks
    if (!metadata.title) {
      const twitterTitleMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      if (twitterTitleMatch) metadata.title = twitterTitleMatch[1].trim();
    }

    if (!metadata.description) {
      const twitterDescriptionMatch = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      if (twitterDescriptionMatch) metadata.description = twitterDescriptionMatch[1].trim();
    }

    if (!metadata.image) {
      const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      if (twitterImageMatch) {
        try {
          metadata.image = new URL(twitterImageMatch[1].trim(), url).href;
        } catch {
          metadata.image = twitterImageMatch[1].trim();
        }
      }
    }

    // Meta description fallback
    if (!metadata.description) {
      const metaDescriptionMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      if (metaDescriptionMatch) metadata.description = metaDescriptionMatch[1].trim();
    }

    // Use hostname as fallback site name
    if (!metadata.siteName) metadata.siteName = parsedUrl.hostname;

    // Decode HTML entities
    if (metadata.title) metadata.title = decodeHtml(metadata.title);
    if (metadata.description) metadata.description = decodeHtml(metadata.description);
    if (metadata.siteName) metadata.siteName = decodeHtml(metadata.siteName);

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).json(metadata);

  } catch (error: unknown) {
    console.error("Error fetching link preview:", error);

    let status = 500;
    let errorMessage = "Error fetching link preview";

    if (error instanceof Error) {
      errorMessage = error.message;
      if (error.name === 'AbortError') {
        errorMessage = "Request timeout";
        status = 408;
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = "Network error";
        status = 503;
      }
    }

    res.status(status).json({ error: errorMessage });
  }
}
