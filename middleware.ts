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
  chats: "Chat with Ryo AI assistant",
  textedit: "A simple rich text editor",
  paint: "Draw and edit images",
  "photo-booth": "Take photos with effects",
  minesweeper: "Classic puzzle game",
  videos: "Watch YouTube videos",
  ipod: "Music player with YouTube integration",
  synth: "Virtual synthesizer",
  pc: "DOS emulator",
  terminal: "Command line interface",
  "applet-viewer": "View and run HTML applets",
  "control-panels": "System settings",
};

function generateOgHtml(options: {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
  type?: string;
}): string {
  const { title, description, imageUrl, url, type = "website" } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="${type}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:width" content="800">
  <meta property="og:image:height" content="400">
  <meta property="og:site_name" content="ryOS">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  
  <!-- Redirect to actual page for crawlers that follow redirects -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(url)}">
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(url)}">${escapeHtml(title)}</a>...</p>
</body>
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

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const baseUrl = url.origin;

  // Match different share URL patterns
  let ogParams: URLSearchParams | null = null;
  let title = "ryOS";
  let description = "An AI OS experience, made with Cursor";

  // App URLs: /soundboard, /paint, /ipod, etc.
  const appMatch = pathname.match(/^\/([a-z-]+)$/);
  if (appMatch && APP_NAMES[appMatch[1]]) {
    const appId = appMatch[1];
    ogParams = new URLSearchParams({ app: appId });
    title = `${APP_NAMES[appId]} - ryOS`;
    description = APP_DESCRIPTIONS[appId] || "Open in ryOS";
  }

  // Video URLs: /videos/{videoId}
  const videoMatch = pathname.match(/^\/videos\/([a-zA-Z0-9_-]+)$/);
  if (videoMatch) {
    const videoId = videoMatch[1];
    ogParams = new URLSearchParams({ video: videoId });
    title = "Shared Video - ryOS";
    description = "Watch this video in ryOS";
  }

  // iPod URLs: /ipod/{videoId}
  const ipodMatch = pathname.match(/^\/ipod\/([a-zA-Z0-9_-]+)$/);
  if (ipodMatch) {
    const videoId = ipodMatch[1];
    ogParams = new URLSearchParams({ video: videoId });
    title = "Shared Song - ryOS";
    description = "Listen in ryOS iPod";
  }

  // Applet URLs: /applet-viewer/{appletId}
  const appletMatch = pathname.match(/^\/applet-viewer\/([a-zA-Z0-9_-]+)$/);
  if (appletMatch) {
    const appletId = appletMatch[1];
    ogParams = new URLSearchParams({ applet: appletId });
    title = "Shared Applet - ryOS";
    description = "Open this applet in ryOS";
  }

  // Internet Explorer URLs: /internet-explorer/{code}
  const ieMatch = pathname.match(/^\/internet-explorer\/([a-zA-Z0-9_-]+)$/);
  if (ieMatch) {
    ogParams = new URLSearchParams({ app: "internet-explorer" });
    title = "Shared Page - ryOS";
    description = "View this page in ryOS Internet Explorer";
  }

  // If we have matched a share URL, return OG HTML
  if (ogParams) {
    const imageUrl = `${baseUrl}/api/og?${ogParams.toString()}`;
    const pageUrl = `${baseUrl}${pathname}`;

    const html = generateOgHtml({
      title,
      description,
      imageUrl,
      url: pageUrl,
    });

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  }

  // For all other paths, continue normally (return undefined to pass through)
  return;
}
