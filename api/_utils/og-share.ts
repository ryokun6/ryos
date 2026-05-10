import { Redis } from "@upstash/redis";
import { getAppPublicOrigin } from "./runtime-config.js";

// App display names for OG titles
const APP_NAMES: Record<string, string> = {
  finder: "Finder",
  soundboard: "Soundboard",
  "internet-explorer": "Internet Explorer",
  chats: "Chats",
  textedit: "TextEdit",
  paint: "Paint",
  "photo-booth": "Photo Booth",
  minesweeper: "Minesweeper",
  videos: "Videos",
  tv: "TV",
  ipod: "iPod",
  karaoke: "Karaoke",
  synth: "Synth",
  pc: "Virtual PC",
  "infinite-pc": "Virtual PC",
  terminal: "Terminal",
  "applet-viewer": "Applet Store",
  "control-panels": "Control Panels",
  stickies: "Stickies",
  "infinite-mac": "Infinite Mac",
  winamp: "Winamp",
  dashboard: "Dashboard",
};

// App descriptions
const APP_DESCRIPTIONS: Record<string, string> = {
  finder: "Browse and manage files",
  soundboard: "Record and trigger custom sounds",
  "internet-explorer": "Browse the web through time",
  chats: "Talk to Ryo and neighbors online",
  textedit: "Write and edit documents",
  paint: "Draw and edit art, like it's 1984",
  "photo-booth": "Take photos with shader effects",
  minesweeper: "Play this classic puzzle game",
  videos: "Watch videos on ryOS",
  tv: "Channel-surf YouTube on ryOS",
  ipod: "Click-wheel music player with live lyrics",
  karaoke: "Full-screen karaoke with live lyrics",
  synth: "Virtual synthesizer with custom sounds",
  pc: "x86 OS emulation (v86) and classic DOS games",
  "infinite-pc": "x86 OS emulation (v86) and classic DOS games",
  terminal: "Command line interface with Ryo AI",
  "applet-viewer": "Explore and install community applets",
  "control-panels": "Set themes, sounds, and system preferences",
  stickies: "Colorful sticky notes for reminders and quick notes",
  "infinite-mac": "Run classic Mac OS and NeXT in your browser",
  winamp: "Classic Winamp media player in your browser",
  dashboard: "Widgets dashboard with clock, calendar, and weather",
};

// App ID to macOS icon mapping (relative to /public/icons/macosx/)
const APP_ICONS: Record<string, string> = {
  finder: "mac.png",
  soundboard: "sound.png",
  "internet-explorer": "ie.png",
  chats: "chats.png",
  textedit: "textedit.png",
  paint: "paint.png",
  "photo-booth": "photo-booth.png",
  minesweeper: "minesweeper.png",
  videos: "videos.png",
  tv: "tv.png",
  ipod: "ipod.png",
  karaoke: "karaoke.png",
  synth: "synth.png",
  pc: "pc.png",
  "infinite-pc": "infinite-pc.png",
  terminal: "terminal.png",
  "applet-viewer": "applet.png",
  "control-panels": "control-panels/appearance-manager/app.png",
  stickies: "stickies.png",
  "infinite-mac": "infinite-mac.png",
  winamp: "winamp.png",
  dashboard: "dashboard.png",
};

// Known dimensions of macOS-X icon assets in /public/icons/macosx/
// (used for og:image:width/height hints so social platforms render
// previews without an extra HEAD round-trip to compute the size)
const APP_ICON_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "mac.png": { width: 256, height: 256 },
  "sound.png": { width: 128, height: 128 },
  "ie.png": { width: 128, height: 128 },
  "chats.png": { width: 300, height: 300 },
  "textedit.png": { width: 512, height: 512 },
  "paint.png": { width: 512, height: 512 },
  "photo-booth.png": { width: 512, height: 512 },
  "minesweeper.png": { width: 128, height: 128 },
  "videos.png": { width: 128, height: 128 },
  "tv.png": { width: 512, height: 512 },
  "ipod.png": { width: 128, height: 128 },
  "karaoke.png": { width: 128, height: 128 },
  "synth.png": { width: 512, height: 512 },
  "pc.png": { width: 128, height: 128 },
  "infinite-pc.png": { width: 128, height: 128 },
  "terminal.png": { width: 128, height: 128 },
  "applet.png": { width: 128, height: 128 },
  "control-panels/appearance-manager/app.png": { width: 128, height: 128 },
  "stickies.png": { width: 128, height: 128 },
  "infinite-mac.png": { width: 128, height: 128 },
  "winamp.png": { width: 128, height: 128 },
  "dashboard.png": { width: 348, height: 348 },
};

const DEFAULT_APP_ICON_DIMENSIONS = { width: 256, height: 256 };

// Aliased app IDs so legacy / alias paths inherit canonical app metadata
// (e.g. /infinite-pc reuses /pc descriptions but keeps its own icon).
const APP_ID_ALIASES: Record<string, string> = {
  "infinite-pc": "pc",
};

function inferImageMimeType(imageUrl: string): string | null {
  // Strip query string / fragment so URLs like `?v=1` don't break extension matching
  const cleaned = imageUrl.split(/[?#]/)[0].toLowerCase();
  if (cleaned.endsWith(".png")) return "image/png";
  if (cleaned.endsWith(".jpg") || cleaned.endsWith(".jpeg"))
    return "image/jpeg";
  if (cleaned.endsWith(".webp")) return "image/webp";
  if (cleaned.endsWith(".gif")) return "image/gif";
  if (cleaned.endsWith(".svg")) return "image/svg+xml";
  return null;
}

function generateOgHtml(options: {
  title: string;
  description: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  imageAlt?: string;
  imageType?: string | null;
  url: string;
  redirectUrl: string;
  type?: string;
  twitterCard?: "summary" | "summary_large_image";
}): string {
  const {
    title,
    description,
    imageUrl,
    imageWidth,
    imageHeight,
    imageAlt,
    url,
    redirectUrl,
    type = "website",
    twitterCard = "summary",
  } = options;

  const imageType = options.imageType ?? inferImageMimeType(imageUrl);
  const altText = imageAlt ?? title;

  const imageMeta: string[] = [
    `  <meta property="og:image" content="${escapeHtml(imageUrl)}">`,
    `  <meta property="og:image:url" content="${escapeHtml(imageUrl)}">`,
  ];

  // og:image:secure_url is meaningful only for https URLs and is required by
  // some scrapers (e.g. Facebook's older crawler) to confirm the image is
  // delivered over TLS. Only emit it for https sources.
  if (imageUrl.startsWith("https://")) {
    imageMeta.push(
      `  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">`
    );
  }

  if (imageType) {
    imageMeta.push(
      `  <meta property="og:image:type" content="${escapeHtml(imageType)}">`
    );
  }

  if (imageWidth && imageHeight) {
    imageMeta.push(
      `  <meta property="og:image:width" content="${imageWidth}">`,
      `  <meta property="og:image:height" content="${imageHeight}">`
    );
  }

  imageMeta.push(
    `  <meta property="og:image:alt" content="${escapeHtml(altText)}">`
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${type}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
${imageMeta.join("\n")}
  <meta property="og:site_name" content="ryOS">
  <meta name="twitter:card" content="${twitterCard}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <meta name="twitter:image:alt" content="${escapeHtml(altText)}">
  <script>location.replace("${escapeHtml(redirectUrl)}")</script>
</head>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Fetch song metadata from Redis song library
async function getSongFromRedis(
  videoId: string
): Promise<{ title: string; artist: string | null; cover: string | null } | null> {
  try {
    // Skip if no Redis credentials
    if (
      !process.env.REDIS_KV_REST_API_URL ||
      !process.env.REDIS_KV_REST_API_TOKEN
    ) {
      return null;
    }

    const redis = new Redis({
      url: process.env.REDIS_KV_REST_API_URL,
      token: process.env.REDIS_KV_REST_API_TOKEN,
    });

    // Fetch from song:meta:{id} (split storage format)
    const metaKey = `song:meta:${videoId}`;
    const raw = await redis.get(metaKey);

    if (!raw) return null;

    const meta = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!meta?.title) return null;

    return {
      title: meta.title,
      artist: meta.artist || null,
      cover: meta.cover || null,
    };
  } catch {
    return null;
  }
}

/**
 * Format Kugou image URL by replacing {size} placeholder
 * Ensures HTTPS is used to avoid mixed content issues.
 *
 * Default size is 720 so social-card crops (Twitter `summary_large_image`,
 * Facebook, Discord, iMessage) render album art crisply instead of
 * upscaling a 400px asset.
 */
function formatKugouImageUrl(
  imgUrl: string | null,
  size: number = 720
): string | null {
  if (!imgUrl) return null;
  let url = imgUrl.replace("{size}", String(size));
  url = url.replace(/^http:\/\//, "https://");
  return url;
}

/**
 * Pick the largest YouTube thumbnail that actually exists for a given video.
 *
 * `maxresdefault.jpg` (1280×720) is only generated when the uploaded source is
 * at least 720p, so older / low-res / removed videos return 404. We probe with
 * a HEAD request (small + cached upstream) and fall back to `hqdefault.jpg`
 * (480×360), which YouTube guarantees for every video.
 */
async function pickYouTubeThumbnail(
  videoId: string
): Promise<{ url: string; width: number; height: number }> {
  const maxres = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  const hq = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const response = await fetch(maxres, {
      method: "HEAD",
      signal: AbortSignal.timeout(2500),
      headers: { "User-Agent": "ryOS/1.0" },
    });
    if (response.ok) {
      // YouTube sometimes serves a 120x90 placeholder under the maxresdefault
      // URL when the real one isn't available. Use Content-Length as a
      // heuristic: the placeholder is ~1KB, while a real thumb is ≥10KB.
      const length = Number(response.headers.get("content-length") || "0");
      if (length === 0 || length > 5_000) {
        return { url: maxres, width: 1280, height: 720 };
      }
    }
  } catch {
    // network error / timeout — fall through to hqdefault
  }
  return { url: hq, width: 480, height: 360 };
}

// Simple title parser - extracts artist and title from common YouTube formats
function parseYouTubeTitle(rawTitle: string): {
  title: string;
  artist: string | null;
} {
  const cleaned = rawTitle
    .replace(/\s*\(Official\s*(Music\s*)?Video\)/gi, "")
    .replace(/\s*\[Official\s*(Music\s*)?Video\]/gi, "")
    .replace(/\s*Official\s*(Music\s*)?Video/gi, "")
    .replace(/\s*\(Official\s*Audio\)/gi, "")
    .replace(/\s*\[Official\s*Audio\]/gi, "")
    .replace(/\s*\(Lyric\s*Video\)/gi, "")
    .replace(/\s*\[Lyric\s*Video\]/gi, "")
    .replace(/\s*\(Lyrics\)/gi, "")
    .replace(/\s*\[Lyrics\]/gi, "")
    .replace(/\s*\(Audio\)/gi, "")
    .replace(/\s*\[Audio\]/gi, "")
    .replace(/\s*\(MV\)/gi, "")
    .replace(/\s*\[MV\]/gi, "")
    .replace(/\s*MV$/gi, "")
    .replace(/\s*M\/V$/gi, "")
    .replace(/\s*【[^】]*】\s*/g, " ")
    .trim();

  const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    return { artist: dashMatch[1].trim(), title: dashMatch[2].trim() };
  }

  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return { artist: byMatch[2].trim(), title: byMatch[1].trim() };
  }

  return { title: cleaned, artist: null };
}

// Fetch YouTube video info via oEmbed
async function getYouTubeInfo(
  videoId: string
): Promise<{ title: string; artist: string | null } | null> {
  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oEmbedUrl, {
      headers: { "User-Agent": "ryOS/1.0" },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const rawTitle = data.title || "";

    return parseYouTubeTitle(rawTitle);
  } catch {
    return null;
  }
}

export async function createOgShareResponse(
  request: Request
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  const url = new URL(request.url);
  const pathname = url.pathname;
  const publicOrigin = getAppPublicOrigin(url.origin);

  // Skip if already redirected (has _ryo param)
  if (url.searchParams.has("_ryo")) {
    return null;
  }

  let imageUrl = `${publicOrigin}/icons/mac-512.png`;
  let imageWidth: number | undefined = 512;
  let imageHeight: number | undefined = 512;
  let imageAlt: string | undefined = "ryOS app icon";
  let twitterCard: "summary" | "summary_large_image" = "summary";
  let title = "ryOS";
  let description = "An AI OS experience, made with Cursor";
  let matched = false;

  const appMatch = pathname.match(/^\/([a-z-]+)$/);
  if (appMatch && APP_NAMES[appMatch[1]]) {
    const requestedAppId = appMatch[1];
    const aliasedAppId = APP_ID_ALIASES[requestedAppId] ?? requestedAppId;
    const iconPath = APP_ICONS[requestedAppId] ?? APP_ICONS[aliasedAppId];
    if (iconPath) {
      imageUrl = `${publicOrigin}/icons/macosx/${iconPath}`;
      const dims =
        APP_ICON_DIMENSIONS[iconPath] ?? DEFAULT_APP_ICON_DIMENSIONS;
      imageWidth = dims.width;
      imageHeight = dims.height;
    }
    title = `${APP_NAMES[requestedAppId]} on ryOS`;
    description =
      APP_DESCRIPTIONS[requestedAppId] ||
      APP_DESCRIPTIONS[aliasedAppId] ||
      "Open app in ryOS";
    imageAlt = `${APP_NAMES[requestedAppId]} icon on ryOS`;
    matched = true;
  }

  const videoMatch = pathname.match(/^\/videos\/([a-zA-Z0-9_-]+)$/);
  if (videoMatch) {
    const videoId = videoMatch[1];
    const thumb = await pickYouTubeThumbnail(videoId);
    imageUrl = thumb.url;
    imageWidth = thumb.width;
    imageHeight = thumb.height;
    // YouTube thumbnails are 16:9 — show them as full hero cards on Twitter
    twitterCard = "summary_large_image";

    const ytInfo = await getYouTubeInfo(videoId);
    if (ytInfo) {
      title = ytInfo.artist
        ? `${ytInfo.title} - ${ytInfo.artist}`
        : ytInfo.title;
      description = "Watch on ryOS Videos";
    } else {
      title = "Shared Video on ryOS";
      description = "Watch on ryOS Videos";
    }
    imageAlt = `${title} thumbnail`;
    matched = true;
  }

  const ipodMatch = pathname.match(/^\/ipod\/([a-zA-Z0-9_-]+)$/);
  if (ipodMatch) {
    const videoId = ipodMatch[1];

    const songInfo = await getSongFromRedis(videoId);
    if (songInfo) {
      const cover = formatKugouImageUrl(songInfo.cover, 720);
      if (cover) {
        imageUrl = cover;
        // Kugou album art is square (1:1) at the requested size
        imageWidth = 720;
        imageHeight = 720;
      } else {
        const thumb = await pickYouTubeThumbnail(videoId);
        imageUrl = thumb.url;
        imageWidth = thumb.width;
        imageHeight = thumb.height;
      }
      if (songInfo.artist) {
        title = `${songInfo.title} - ${songInfo.artist}`;
      } else {
        title = songInfo.title;
      }
      description = "Listen on ryOS iPod";
    } else {
      const thumb = await pickYouTubeThumbnail(videoId);
      imageUrl = thumb.url;
      imageWidth = thumb.width;
      imageHeight = thumb.height;
      const ytInfo = await getYouTubeInfo(videoId);
      if (ytInfo) {
        title = ytInfo.artist
          ? `${ytInfo.title} - ${ytInfo.artist}`
          : ytInfo.title;
      } else {
        title = "Shared Song - ryOS";
      }
      description = "Listen on ryOS iPod";
    }
    // Album art / large video thumbnail looks great as a large card
    twitterCard = "summary_large_image";
    imageAlt = `${title} cover art`;
    matched = true;
  }

  const karaokeMatch = pathname.match(/^\/karaoke\/([a-zA-Z0-9_-]+)$/);
  if (karaokeMatch) {
    const videoId = karaokeMatch[1];

    const songInfo = await getSongFromRedis(videoId);
    if (songInfo) {
      const cover = formatKugouImageUrl(songInfo.cover, 720);
      if (cover) {
        imageUrl = cover;
        imageWidth = 720;
        imageHeight = 720;
      } else {
        const thumb = await pickYouTubeThumbnail(videoId);
        imageUrl = thumb.url;
        imageWidth = thumb.width;
        imageHeight = thumb.height;
      }
      const songDisplay = songInfo.artist
        ? `${songInfo.title} - ${songInfo.artist}`
        : songInfo.title;
      title = `Sing ${songDisplay} on ryOS`;
      description = "Sing along on ryOS Karaoke";
    } else {
      const thumb = await pickYouTubeThumbnail(videoId);
      imageUrl = thumb.url;
      imageWidth = thumb.width;
      imageHeight = thumb.height;
      const ytInfo = await getYouTubeInfo(videoId);
      if (ytInfo) {
        const songDisplay = ytInfo.artist
          ? `${ytInfo.title} - ${ytInfo.artist}`
          : ytInfo.title;
        title = `Sing ${songDisplay} on ryOS`;
        description = "Sing along on ryOS Karaoke";
      } else {
        title = "Sing on ryOS Karaoke";
        description = "Sing along on ryOS Karaoke";
      }
    }
    twitterCard = "summary_large_image";
    imageAlt = `${title} cover art`;
    matched = true;
  }

  const listenMatch = pathname.match(/^\/listen\/([a-zA-Z0-9_-]+)$/);
  if (listenMatch) {
    const iconPath = "karaoke.png";
    imageUrl = `${publicOrigin}/icons/macosx/${iconPath}`;
    const dims = APP_ICON_DIMENSIONS[iconPath] ?? DEFAULT_APP_ICON_DIMENSIONS;
    imageWidth = dims.width;
    imageHeight = dims.height;
    imageAlt = "ryOS Karaoke icon";
    title = "Join Live Session on ryOS";
    description = "Listen together in real-time on ryOS Karaoke";
    matched = true;
  }

  const appletMatch = pathname.match(/^\/applet-viewer\/([a-zA-Z0-9_-]+)$/);
  if (appletMatch) {
    const iconPath = "applet.png";
    imageUrl = `${publicOrigin}/icons/macosx/${iconPath}`;
    const dims = APP_ICON_DIMENSIONS[iconPath] ?? DEFAULT_APP_ICON_DIMENSIONS;
    imageWidth = dims.width;
    imageHeight = dims.height;
    imageAlt = "ryOS Applet Store icon";
    title = "Shared Applet on ryOS";
    description = "Open applet in ryOS";
    matched = true;
  }

  const ieMatch = pathname.match(/^\/internet-explorer\/([a-zA-Z0-9_-]+)$/);
  if (ieMatch) {
    const code = ieMatch[1];
    let iconPath = "ie.png";
    imageUrl = `${publicOrigin}/icons/macosx/${iconPath}`;

    try {
      const base64 = code.replace(/-/g, "+").replace(/_/g, "/");
      const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      const decoded = atob(paddedBase64);

      const [sharedUrl, sharedYear] = decoded.split("|");
      if (sharedUrl && sharedYear) {
        let hostname = sharedUrl;
        try {
          const urlObj = new URL(
            sharedUrl.startsWith("http") ? sharedUrl : `https://${sharedUrl}`
          );
          hostname = urlObj.hostname.replace(/^www\./, "");

          if (hostname.includes("infinitemac")) {
            iconPath = "infinite-mac.png";
            imageUrl = `${publicOrigin}/icons/macosx/${iconPath}`;
          }
        } catch {
          // Use the raw URL if parsing fails.
        }

        if (sharedYear === "current") {
          title = `${hostname} on ryOS`;
          description = "Open in ryOS Internet Explorer";
        } else {
          title = `${hostname} in ${sharedYear} on ryOS`;
          description = "Time travel in ryOS Internet Explorer";
        }
      } else {
        title = "Shared Page on ryOS";
        description = "Open in ryOS Internet Explorer";
      }
    } catch {
      title = "Shared Page on ryOS";
      description = "Open in ryOS Internet Explorer";
    }
    const dims = APP_ICON_DIMENSIONS[iconPath] ?? DEFAULT_APP_ICON_DIMENSIONS;
    imageWidth = dims.width;
    imageHeight = dims.height;
    imageAlt = "ryOS Internet Explorer icon";
    matched = true;
  }

  if (!matched) {
    return null;
  }

  const pageUrl = `${publicOrigin}${pathname}`;
  const redirectUrl = `${pageUrl}?_ryo=1`;
  const html = generateOgHtml({
    title,
    description,
    imageUrl,
    imageWidth,
    imageHeight,
    imageAlt,
    url: pageUrl,
    redirectUrl,
    twitterCard,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // no-store prevents service worker from caching this redirect page
      // s-maxage allows CDN to cache for crawlers (they don't have SW)
      "Cache-Control": "no-store, s-maxage=3600",
    },
  });
}
