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
  ipod: "iPod",
  synth: "Synth",
  pc: "Virtual PC",
  terminal: "Terminal",
  "applet-viewer": "Applet Store",
  "control-panels": "Control Panels",
};

// App descriptions
const APP_DESCRIPTIONS: Record<string, string> = {
  finder: "Browse and manage files",
  soundboard: "Play sound effects",
  "internet-explorer": "Browse the web through time",
  chats: "Chat with Ryo and neighbors on ryOS",
  textedit: "A simple rich text editor",
  paint: "Draw and edit images, like it's 1984",
  "photo-booth": "Take photos with effects",
  minesweeper: "Classic puzzle game",
  videos: "Watch videos on ryOS",
  ipod: "iPod music player with karaoke",
  synth: "Virtual synthesizer",
  pc: "DOS emulator",
  terminal: "ryOS Command line interface",
  "applet-viewer": "View and run shared applets",
  "control-panels": "ryOS System settings",
};

// App ID to macOS icon mapping
const APP_ICONS: Record<string, string> = {
  finder: "mac.png",
  soundboard: "sound.png",
  "internet-explorer": "ie.png",
  chats: "question.png",
  textedit: "textedit.png",
  paint: "paint.png",
  "photo-booth": "photo-booth.png",
  minesweeper: "minesweeper.png",
  videos: "videos.png",
  ipod: "ipod.png",
  synth: "synth.png",
  pc: "pc.png",
  terminal: "terminal.png",
  "applet-viewer": "applet.png",
  "control-panels": "control-panels/appearance-manager/app.png",
};

function generateOgHtml(options: {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
  redirectUrl: string;
  type?: string;
}): string {
  const { title, description, imageUrl, url, redirectUrl, type = "website" } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
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

export const config = {
  matcher: [
    "/finder",
    "/soundboard",
    "/internet-explorer",
    "/internet-explorer/:path*",
    "/chats",
    "/textedit",
    "/paint",
    "/photo-booth",
    "/minesweeper",
    "/videos",
    "/videos/:path*",
    "/ipod",
    "/ipod/:path*",
    "/synth",
    "/pc",
    "/terminal",
    "/applet-viewer",
    "/applet-viewer/:path*",
    "/control-panels",
  ],
};

// Simple title parser - extracts artist and title from common YouTube formats
function parseYouTubeTitle(rawTitle: string): { title: string; artist: string | null } {
  // Remove common suffixes
  let cleaned = rawTitle
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
    .trim();

  // Try "Artist - Title" format (most common)
  const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    return { artist: dashMatch[1].trim(), title: dashMatch[2].trim() };
  }

  // Try "Title by Artist" format
  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return { artist: byMatch[2].trim(), title: byMatch[1].trim() };
  }

  // No clear separator, return as title only
  return { title: cleaned, artist: null };
}

// Fetch YouTube video info via oEmbed
async function getYouTubeInfo(videoId: string): Promise<{ title: string; artist: string | null } | null> {
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

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const baseUrl = url.origin;

  // Skip if already redirected (has _ryo param)
  if (url.searchParams.has("_ryo")) {
    return;
  }

  // Default values
  let imageUrl = `${baseUrl}/icons/mac-512.png`;
  let title = "ryOS";
  let description = "An AI OS experience, made with Cursor";
  let matched = false;

  // App URLs: /soundboard, /paint, /ipod, etc.
  const appMatch = pathname.match(/^\/([a-z-]+)$/);
  if (appMatch && APP_NAMES[appMatch[1]]) {
    const appId = appMatch[1];
    imageUrl = `${baseUrl}/icons/macosx/${APP_ICONS[appId]}`;
    title = `${APP_NAMES[appId]}`;
    description = APP_DESCRIPTIONS[appId] || "Open in ryOS";
    matched = true;
  }

  // Video URLs: /videos/{videoId} - use YouTube thumbnail and fetch title
  const videoMatch = pathname.match(/^\/videos\/([a-zA-Z0-9_-]+)$/);
  if (videoMatch) {
    const videoId = videoMatch[1];
    imageUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    
    // Fetch YouTube info for title
    const ytInfo = await getYouTubeInfo(videoId);
    if (ytInfo) {
      title = ytInfo.title;
      description = "Watch on ryOS Videos";
    } else {
      title = "Shared Video";
      description = "Watch on ryOS Videos";
    }
    matched = true;
  }

  // iPod URLs: /ipod/{videoId} - use YouTube thumbnail and fetch title
  const ipodMatch = pathname.match(/^\/ipod\/([a-zA-Z0-9_-]+)$/);
  if (ipodMatch) {
    const videoId = ipodMatch[1];
    imageUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    
    // Fetch YouTube info for title/artist
    const ytInfo = await getYouTubeInfo(videoId);
    if (ytInfo) {
      if (ytInfo.artist) {
        title = `${ytInfo.title} - ${ytInfo.artist}`;
        description = `Listen on ryOS iPod`;
      } else {
        title = ytInfo.title;
        description = "Listen on ryOS iPod";
      }
    } else {
      title = "Shared Song - ryOS";
      description = "Listen on ryOS iPod";
    }
    matched = true;
  }

  // Applet URLs: /applet-viewer/{appletId}
  const appletMatch = pathname.match(/^\/applet-viewer\/([a-zA-Z0-9_-]+)$/);
  if (appletMatch) {
    imageUrl = `${baseUrl}/icons/macosx/applet.png`;
    title = "Shared Applet - ryOS";
    description = "Open this applet in ryOS";
    matched = true;
  }

  // Internet Explorer URLs: /internet-explorer/{code}
  const ieMatch = pathname.match(/^\/internet-explorer\/([a-zA-Z0-9_-]+)$/);
  if (ieMatch) {
    imageUrl = `${baseUrl}/icons/macosx/ie.png`;
    title = "Shared Page - ryOS";
    description = "View this page in ryOS";
    matched = true;
  }

  // If we have matched a share URL, return OG HTML
  if (matched) {
    const pageUrl = `${baseUrl}${pathname}`;
    // Redirect URL includes _ryo param to bypass middleware on next request
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
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  }

  // For all other paths, continue normally
  return;
}
