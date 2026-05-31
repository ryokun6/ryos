import {
  isYouTubeHostname,
  isYouTubeUrl as isYouTubeHostUrl,
} from "@/utils/youtubeUrl";

export function isYouTubeUrl(url: string): boolean {
  if (/(?:\/ipod\/|\/karaoke\/)/.test(url)) return true;
  return isYouTubeHostUrl(url);
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const validateId = (id: string | null) =>
      id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;

    if (url.includes("/ipod/")) {
      const match = url.match(/\/ipod\/([^&\n?#/]+)/);
      return validateId(match ? match[1] : null);
    }

    if (url.includes("/karaoke/")) {
      const match = url.match(/\/karaoke\/([^&\n?#/]+)/);
      return validateId(match ? match[1] : null);
    }

    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    if (hostname === "youtu.be") {
      const id = urlObj.pathname.slice(1).split("/")[0] ?? "";
      return validateId(id || null);
    }

    if (isYouTubeHostname(hostname)) {
      if (urlObj.pathname === "/watch") {
        const videoId = urlObj.searchParams.get("v");
        return validateId(videoId);
      }

      if (urlObj.pathname.startsWith("/embed/")) {
        const match = urlObj.pathname.match(/\/embed\/([^&\n?#]+)/);
        return validateId(match ? match[1] : null);
      }
    }

    return null;
  } catch (error) {
    console.error("Error extracting YouTube video ID:", error);
    return null;
  }
}

export function getFaviconUrl(url: string): string {
  try {
    if (url.includes("/ipod/")) {
      return `/icons/macosx/ipod.png`;
    }
    if (url.includes("/karaoke/")) {
      return `/icons/macosx/karaoke.png`;
    }

    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=example.com&sz=16`;
  }
}

export function isTouchDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}
