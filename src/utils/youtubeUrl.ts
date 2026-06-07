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

export interface ParseYouTubeVideoIdOptions {
  /**
   * Accept legacy app-local shortcuts such as `youtube://VIDEO_ID`,
   * `youtube:/VIDEO_ID`, and `yt:VIDEO_ID`.
   */
  allowProtocolAliases?: boolean;
  /** Accept pasted URLs without a scheme, e.g. `youtube.com/watch?v=...`. */
  allowBareHost?: boolean;
  /**
   * Preserve older caller behavior that matched hostnames by substring.
   * Leave false for new code so spoof-like hosts stay rejected.
   */
  allowLooseHostMatch?: boolean;
}

export type YouTubeThumbnailQuality =
  | "default"
  | "mqdefault"
  | "hqdefault"
  | "sddefault"
  | "maxresdefault";

/** Build the `img.youtube.com` thumbnail URL for a video id. */
export function youtubeThumbnailUrl(
  videoId: string,
  quality: YouTubeThumbnailQuality = "maxresdefault"
): string {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Canonical YouTube video-id extractor. By default, accepts a raw 11-char id
 * or any supported YouTube URL (watch, youtu.be, embed, shorts, v/). Returns
 * null for unsupported hosts or invalid input.
 *
 * Host validation uses the same exact-match allow-list as {@link isYouTubeUrl}
 * (not substring checks), so substring-confusable hosts like
 * `evil-youtube.com` cannot slip through.
 */
export function parseYouTubeVideoId(
  input: string | undefined | null,
  options: ParseYouTubeVideoIdOptions = {}
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;

  if (options.allowProtocolAliases) {
    const aliasValue = trimmed
      .replace(/^youtube:\/\/?/i, "")
      .replace(/^yt:/i, "");
    if (YOUTUBE_ID_RE.test(aliasValue)) return aliasValue;
  }

  const parseCandidate = (candidate: string): string | null => {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    const isAllowedHost = options.allowLooseHostMatch
      ? isYouTubeHostname(hostname) ||
        hostname.includes("youtube.com") ||
        hostname.includes("youtu.be")
      : isYouTubeHostname(hostname);
    if (!isAllowedHost) return null;

    const v = url.searchParams.get("v");
    if (v && YOUTUBE_ID_RE.test(v)) return v;
    if (hostname === "youtu.be" || hostname.endsWith(".youtu.be")) {
      const id = url.pathname.slice(1).split("/")[0] ?? "";
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }
    const m = url.pathname.match(
      /\/(?:embed\/|e\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})/
    );
    return m ? m[1] : null;
  };

  try {
    return parseCandidate(trimmed);
  } catch {
    if (
      options.allowBareHost &&
      /^[^:/?#]+\.[^:/?#]+(?:[/?#]|$)/.test(trimmed)
    ) {
      try {
        return parseCandidate(`https://${trimmed}`);
      } catch {
        return null;
      }
    }
    return null;
  }
}
