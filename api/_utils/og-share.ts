import { getAppPublicOrigin } from "./runtime-config.js";
import { parseYouTubeTitleSimple } from "./parse-youtube-title.js";

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

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const APPLE_MUSIC_ID_REGEX = /^am:[A-Za-z0-9._-]{1,64}$/;

function extractYouTubeVideoId(value: string): string | null {
  if (YOUTUBE_VIDEO_ID_REGEX.test(value)) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes("youtube.com")) {
      const vParam = parsed.searchParams.get("v");
      if (vParam && YOUTUBE_VIDEO_ID_REGEX.test(vParam)) {
        return vParam;
      }

      const pathMatch = parsed.pathname.match(
        /\/(?:embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})/
      );
      if (pathMatch) {
        return pathMatch[1];
      }
    }

    if (parsed.hostname === "youtu.be") {
      const videoId = parsed.pathname.slice(1).split("/")[0];
      if (YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
        return videoId;
      }
    }
  } catch {
    // Fall through to regex extraction for URL-like strings without a scheme.
  }

  const match = value.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|shorts\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] ?? null;
}

function extractAppleMusicSongId(value: string): string | null {
  if (APPLE_MUSIC_ID_REGEX.test(value)) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (!parsed.hostname.endsWith("music.apple.com")) {
      return null;
    }

    const iParam = parsed.searchParams.get("i");
    if (iParam) {
      return `am:${iParam}`;
    }

    const pathId = parsed.pathname.split("/").filter(Boolean).at(-1);
    return pathId ? `am:${pathId}` : null;
  } catch {
    return null;
  }
}

export function resolveSongShareId(routeId: string): string {
  const decoded = decodeRouteId(routeId);
  return (
    extractYouTubeVideoId(decoded) ||
    extractAppleMusicSongId(decoded) ||
    decoded
  );
}

export function getSongShareMetadataFromRaw(
  raw: unknown
): SongShareMetadata | null {
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
      asNonEmptyString(meta?.albumArtworkUrl) ||
      asNonEmptyString(artwork?.url) ||
      asNonEmptyString(meta?.artwork) ||
      asNonEmptyString(meta?.image),
  };
}

async function createSongRedisClient(): Promise<{
  get<T = unknown>(key: string): Promise<T | null>;
} | null> {
  // Delegate to the canonical Redis factory so the OG read path resolves the
  // exact same backend (Upstash REST vs standard REDIS_URL) that the song API
  // writes to. Picking a backend independently here used to silently diverge on
  // non-Vercel deploys — e.g. when REDIS_URL (and/or REDIS_PROVIDER=redis-url)
  // is set but stale Upstash vars also linger — causing reads to hit an empty
  // store and previews to always fall back. The dynamic import keeps the
  // standard-Redis (ioredis) dependency out of edge bundles that only use
  // Upstash REST. `createRedis` throws when nothing is configured, which the
  // caller treats as "no metadata".
  const { createRedis } = await import("./redis.js");
  return createRedis();
}

// Fetch song metadata from Redis song library
async function getSongFromRedis(
  songId: string
): Promise<SongShareMetadata | null> {
  try {
    const redis = await createSongRedisClient();
    if (!redis) return null;

    // Fetch from song:meta:{id} (split storage format)
    const metaKey = `song:meta:${songId}`;
    const raw = await redis.get(metaKey);
    return getSongShareMetadataFromRaw(raw);
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
    const parsed = parseYouTubeTitleSimple(rawTitle);

    return { title: parsed.title, artist: parsed.artist || null };
  } catch {
    return null;
  }
}

/**
 * Resolve song metadata + cover image for iPod / Karaoke OG pages.
 *
 * Prefers the song stored in Redis (richest data: album cover, curated
 * title/artist). When the song hasn't been persisted yet — e.g. it was shared
 * by a logged-out user, the metadata save failed, or it simply isn't in the
 * library — fall back to YouTube oEmbed (mirroring the `/videos/` path) so the
 * preview still shows a real title and thumbnail instead of the generic app
 * fallback.
 */
type SongShareSource = "redis" | "youtube" | "none";

async function resolveSongShareInfo(
  songId: string,
  getSong: (songId: string) => Promise<SongShareMetadata | null>
): Promise<{
  songInfo: SongShareMetadata | null;
  imageUrl: string | null;
  source: SongShareSource;
}> {
  const stored = await getSong(songId);
  if (stored) {
    return {
      songInfo: stored,
      imageUrl: formatMusicCoverUrl(stored.cover, 400),
      source: "redis",
    };
  }

  if (YOUTUBE_VIDEO_ID_REGEX.test(songId)) {
    const ytInfo = await getYouTubeInfo(songId);
    if (ytInfo) {
      return {
        songInfo: { title: ytInfo.title, artist: ytInfo.artist, cover: null },
        imageUrl: `https://i.ytimg.com/vi/${songId}/hqdefault.jpg`,
        source: "youtube",
      };
    }
  }

  return { songInfo: null, imageUrl: null, source: "none" };
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
  // Crawlers cache aggressively, so OG pages are CDN-cached for an hour by
  // default. Song shares persist their metadata to Redis asynchronously (and
  // skip it entirely for logged-out users), so the first crawler hit can race
  // ahead of the save and serve an incomplete preview. When we don't have rich
  // metadata yet, cache only briefly so the CDN re-fetches and picks up the
  // song once it lands in Redis instead of pinning a stale fallback.
  const RICH_CACHE_SECONDS = 3600;
  const FALLBACK_CACHE_SECONDS = 60;
  let cacheMaxAge = RICH_CACHE_SECONDS;

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
    const songId = resolveSongShareId(ipodMatch[1]);
    imageUrl = getAppIconUrl(publicOrigin, "ipod");

    const {
      songInfo,
      imageUrl: songImageUrl,
      source,
    } = await resolveSongShareInfo(songId, options.getSong || getSongFromRedis);
    if (source !== "redis") {
      cacheMaxAge = FALLBACK_CACHE_SECONDS;
    }
    if (songInfo) {
      imageUrl = songImageUrl || imageUrl;
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
    const songId = resolveSongShareId(karaokeMatch[1]);
    imageUrl = getAppIconUrl(publicOrigin, "karaoke");

    const {
      songInfo,
      imageUrl: songImageUrl,
      source,
    } = await resolveSongShareInfo(songId, options.getSong || getSongFromRedis);
    if (source !== "redis") {
      cacheMaxAge = FALLBACK_CACHE_SECONDS;
    }
    if (songInfo) {
      imageUrl = songImageUrl || imageUrl;
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
      "Cache-Control": `no-store, s-maxage=${cacheMaxAge}`,
    },
  });
}
