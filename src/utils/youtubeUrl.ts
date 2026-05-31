const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "music.youtube.com",
]);

export function isYouTubeHostname(hostname: string): boolean {
  return YOUTUBE_HOSTS.has(hostname.toLowerCase());
}

/**
 * True iff `url` parses as a YouTube URL on an allowed host (not substring
 * checks like `hostname.includes("youtube.com")`).
 */
export function isYouTubeUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    return YOUTUBE_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
