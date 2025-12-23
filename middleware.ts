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
  karaoke: "Karaoke",
  synth: "Synth",
  pc: "Virtual PC",
  terminal: "Terminal",
  "applet-viewer": "Applet Store",
  "control-panels": "Control Panels",
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
  ipod: "Click-wheel music player with live lyrics",
  karaoke: "Full-screen karaoke with live lyrics",
  synth: "Virtual synthesizer with custom sounds",
  pc: "DOS emulator with classic games",
  terminal: "Command line interface with Ryo AI",
  "applet-viewer": "Explore and install community applets",
  "control-panels": "Set themes, sounds, and system preferences",
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
  karaoke: "karaoke.png",
  synth: "synth.png",
  pc: "pc.png",
  terminal: "terminal.png",
  "applet-viewer": "app.png",
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
    "/karaoke",
    "/karaoke/:path*",
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
    .replace(/\s*【[^】]*】\s*/g, " ") // Remove Japanese brackets and contents
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
    title = `${APP_NAMES[appId]} on ryOS`;
    description = APP_DESCRIPTIONS[appId] || "Open app in ryOS";
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
      title = `${ytInfo.title}`;
      description = "Watch on ryOS Videos";
    } else {
      title = "Shared Video on ryOS";
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

  // Karaoke URLs: /karaoke/{videoId} - use YouTube thumbnail and fetch title
  const karaokeMatch = pathname.match(/^\/karaoke\/([a-zA-Z0-9_-]+)$/);
  if (karaokeMatch) {
    const videoId = karaokeMatch[1];
    imageUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    
    // Fetch YouTube info for title/artist
    const ytInfo = await getYouTubeInfo(videoId);
    if (ytInfo) {
      // Format: "Sing [Title] - [Artist] on ryOS" or "Sing [Title] on ryOS"
      const songDisplay = ytInfo.artist ? `${ytInfo.title} - ${ytInfo.artist}` : ytInfo.title;
      title = `Sing ${songDisplay} on ryOS`;
      description = `Sing along on ryOS Karaoke`;
    } else {
      title = "Sing on ryOS Karaoke";
      description = "Sing along on ryOS Karaoke";
    }
    matched = true;
  }

  // Applet URLs: /applet-viewer/{appletId}
  const appletMatch = pathname.match(/^\/applet-viewer\/([a-zA-Z0-9_-]+)$/);
  if (appletMatch) {
    imageUrl = `${baseUrl}/icons/macosx/applet.png`;
    title = "Shared Applet on ryOS";
    description = "Open applet in ryOS";
    matched = true;
  }

  // Internet Explorer URLs: /internet-explorer/{code}
  const ieMatch = pathname.match(/^\/internet-explorer\/([a-zA-Z0-9_-]+)$/);
  if (ieMatch) {
    const code = ieMatch[1];
    imageUrl = `${baseUrl}/icons/macosx/ie.png`;
    
    // Decode base64 share code to get URL and year
    try {
      // Replace URL-safe characters back to standard Base64
      const base64 = code.replace(/-/g, "+").replace(/_/g, "/");
      // Add padding if needed
      const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      const decoded = atob(paddedBase64);
      
      // Parse compact format (url|year)
      const [sharedUrl, sharedYear] = decoded.split("|");
      if (sharedUrl && sharedYear) {
        // Extract hostname from URL for display
        let hostname = sharedUrl;
        try {
          const urlObj = new URL(sharedUrl.startsWith("http") ? sharedUrl : `https://${sharedUrl}`);
          hostname = urlObj.hostname.replace(/^www\./, "");
        } catch {
          // Use the raw URL if parsing fails
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
        // no-store prevents service worker from caching this redirect page
        // s-maxage allows CDN to cache for crawlers (they don't have SW)
        "Cache-Control": "no-store, s-maxage=3600",
      },
    });
  }

  // For all other paths, continue normally
  return;
}
