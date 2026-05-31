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

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Canonical YouTube video-id extractor. Accepts a raw 11-char id or any
 * supported YouTube URL (watch, youtu.be, embed, shorts, v/). Returns null
 * for unsupported hosts or invalid input.
 *
 * Host validation uses the same exact-match allow-list as {@link isYouTubeUrl}
 * (not substring checks), so substring-confusable hosts like
 * `evil-youtube.com` cannot slip through.
 */
export function parseYouTubeVideoId(
  input: string | undefined | null
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    if (!isYouTubeHostname(hostname)) return null;

    const v = url.searchParams.get("v");
    if (v && YOUTUBE_ID_RE.test(v)) return v;
    if (hostname === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0] ?? "";
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }
    const m = url.pathname.match(/\/(?:embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
