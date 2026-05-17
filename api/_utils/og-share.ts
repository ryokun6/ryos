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
  terminal: "Command line interface with Ryo AI",
  "applet-viewer": "Explore and install community applets",
  "control-panels": "Set themes, sounds, and system preferences",
  stickies: "Colorful sticky notes for reminders and quick notes",
  "infinite-mac": "Run classic Mac OS and NeXT in your browser",
  winamp: "Classic Winamp media player in your browser",
  dashboard: "Widgets dashboard with clock, calendar, and weather",
};

// App ID to macOS icon mapping
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
  terminal: "terminal.png",
  "applet-viewer": "app.png",
  "control-panels": "control-panels/appearance-manager/app.png",
  stickies: "stickies.png",
  "infinite-mac": "infinite-mac.png",
  winamp: "winamp.png",
  dashboard: "dashboard.png",
};

export type SongShareMetadata = {
  title: string;
  artist: string | null;
  cover: string | null;
};

function generateOgHtml(options: {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
  redirectUrl: string;
  type?: string;
}): string {
  const {
    title,
    description,
    imageUrl,
    url,
    redirectUrl,
    type = "website",
  } = options;

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
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:site_name" content="ryOS">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
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

function getAppIconUrl(publicOrigin: string, appId: string): string {
  return `${publicOrigin}/icons/macosx/${APP_ICONS[appId]}`;
}

function decodeRouteId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

// Fetch song metadata from Redis song library
async function getSongFromRedis(
  songId: string
): Promise<SongShareMetadata | null> {
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
    const metaKey = `song:meta:${songId}`;
    const raw = await redis.get(metaKey);

    if (!raw) return null;

    const meta = getRecord(typeof raw === "string" ? JSON.parse(raw) : raw);
    if (!meta) return null;

    const lyricsSource = getRecord(meta.lyricsSource);
    const artwork = getRecord(meta.artwork);
    const title =
      asNonEmptyString(lyricsSource?.title) || asNonEmptyString(meta?.title);
    if (!title) return null;

    return {
      title,
      artist:
        asNonEmptyString(lyricsSource?.artist) ||
        asNonEmptyString(meta?.artist),
      cover:
        asNonEmptyString(meta?.cover) ||
        asNonEmptyString(meta?.artworkUrl) ||
        asNonEmptyString(artwork?.url) ||
        asNonEmptyString(meta?.image),
    };
  } catch {
    return null;
  }
}

/**
 * Format music cover URLs by replacing Kugou / Apple Music placeholders.
 * Ensures HTTPS is used to avoid mixed content issues.
 */
function formatMusicCoverUrl(
  imgUrl: string | null,
  size: number = 400
): string | null {
  if (!imgUrl) return null;
  let url = imgUrl
    .replace("{size}", String(size))
    .replace("{w}", String(size))
    .replace("{h}", String(size));
  url = url.replace(/^http:\/\//, "https://");
  return url;
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
  request: Request,
  options: {
    getSong?: (songId: string) => Promise<SongShareMetadata | null>;
  } = {}
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
  let title = "ryOS";
  let description = "An AI OS experience, made with Cursor";
  let matched = false;

  const appMatch = pathname.match(/^\/([a-z-]+)$/);
  if (appMatch && APP_NAMES[appMatch[1]]) {
    const appId = appMatch[1];
    imageUrl = getAppIconUrl(publicOrigin, appId);
    title = `${APP_NAMES[appId]} on ryOS`;
    description = APP_DESCRIPTIONS[appId] || "Open app in ryOS";
    matched = true;
  }

  const videoMatch = pathname.match(/^\/videos\/([a-zA-Z0-9_-]+)$/);
  if (videoMatch) {
    const videoId = videoMatch[1];
    imageUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    const ytInfo = await getYouTubeInfo(videoId);
    if (ytInfo) {
      title = ytInfo.title;
      description = "Watch on ryOS Videos";
    } else {
      title = "Shared Video on ryOS";
      description = "Watch on ryOS Videos";
    }
    matched = true;
  }

  const ipodMatch = pathname.match(/^\/ipod\/([^/?#]+)$/);
  if (ipodMatch) {
    const songId = decodeRouteId(ipodMatch[1]);
    imageUrl = getAppIconUrl(publicOrigin, "ipod");

    const songInfo = await (options.getSong || getSongFromRedis)(songId);
    if (songInfo) {
      imageUrl = formatMusicCoverUrl(songInfo.cover, 400) || imageUrl;
      if (songInfo.artist) {
        title = `${songInfo.title} - ${songInfo.artist}`;
        description = "Listen on ryOS iPod";
      } else {
        title = songInfo.title;
        description = "Listen on ryOS iPod";
      }
    } else {
      title = "Shared Song - ryOS";
      description = "Listen on ryOS iPod";
    }
    matched = true;
  }

  const karaokeMatch = pathname.match(/^\/karaoke\/([^/?#]+)$/);
  if (karaokeMatch) {
    const songId = decodeRouteId(karaokeMatch[1]);
    imageUrl = getAppIconUrl(publicOrigin, "karaoke");

    const songInfo = await (options.getSong || getSongFromRedis)(songId);
    if (songInfo) {
      imageUrl = formatMusicCoverUrl(songInfo.cover, 400) || imageUrl;
      const songDisplay = songInfo.artist
        ? `${songInfo.title} - ${songInfo.artist}`
        : songInfo.title;
      title = `Sing ${songDisplay} on ryOS`;
      description = "Sing along on ryOS Karaoke";
    } else {
      title = "Sing on ryOS Karaoke";
      description = "Sing along on ryOS Karaoke";
    }
    matched = true;
  }

  const listenMatch = pathname.match(/^\/listen\/([a-zA-Z0-9_-]+)$/);
  if (listenMatch) {
    imageUrl = `${publicOrigin}/icons/macosx/karaoke.png`;
    title = "Join Live Session on ryOS";
    description = "Listen together in real-time on ryOS Karaoke";
    matched = true;
  }

  const appletMatch = pathname.match(/^\/applet-viewer\/([a-zA-Z0-9_-]+)$/);
  if (appletMatch) {
    imageUrl = `${publicOrigin}/icons/macosx/applet.png`;
    title = "Shared Applet on ryOS";
    description = "Open applet in ryOS";
    matched = true;
  }

  const ieMatch = pathname.match(/^\/internet-explorer\/([a-zA-Z0-9_-]+)$/);
  if (ieMatch) {
    const code = ieMatch[1];
    imageUrl = `${publicOrigin}/icons/macosx/ie.png`;

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
            imageUrl = `${publicOrigin}/icons/macosx/infinite-mac.png`;
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
    url: pageUrl,
    redirectUrl,
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
