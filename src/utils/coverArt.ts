import {
  parseYouTubeVideoId,
  youtubeThumbnailUrl,
  type YouTubeThumbnailQuality,
} from "@/utils/youtubeUrl";

/**
 * Replace the `{size}` placeholder in a Kugou image URL with an actual size.
 * Kugou image URLs contain `{size}` that needs to be replaced with: 100, 150,
 * 240, 400, etc. Also upgrades `http://` to `https://` to avoid mixed-content
 * issues. Returns null when no URL is provided.
 */
export function formatKugouImageUrl(
  imgUrl: string | undefined,
  size: number = 400
): string | null {
  if (!imgUrl) return null;
  let url = imgUrl.replace("{size}", String(size));
  url = url.replace(/^http:\/\//, "https://");
  return url;
}

/**
 * Resolve an Apple Music artwork URL. Apple's API returns artwork URLs with
 * `{w}` / `{h}` size placeholders; some stored covers are already resolved.
 * Handles both, and upgrades `http://` to `https://`. Returns null when no URL
 * is provided so callers can render a placeholder instead of a broken image.
 */
export function resolveAppleMusicArtworkUrl(
  cover: string | undefined,
  size: number = 400
): string | null {
  if (!cover) return null;
  let url = cover
    .replace(/\{w\}/g, String(size))
    .replace(/\{h\}/g, String(size));
  url = url.replace(/^http:\/\//, "https://");
  return url;
}

export interface MediaCoverInput {
  url?: string;
  cover?: string;
  source?: string;
}

export interface ResolveMediaCoverUrlOptions {
  kugouSize?: number;
  youtubeQuality?: YouTubeThumbnailQuality;
}

export function resolveMediaCoverUrl(
  media: MediaCoverInput | null | undefined,
  options: ResolveMediaCoverUrlOptions = {}
): string | null {
  if (!media) return null;
  if (media.source === "appleMusic") {
    return media.cover ?? null;
  }

  const kugouSize = options.kugouSize ?? 400;
  const youtubeQuality = options.youtubeQuality ?? "maxresdefault";
  const videoId = parseYouTubeVideoId(media.url);
  const youtubeThumbnail = videoId
    ? youtubeThumbnailUrl(videoId, youtubeQuality)
    : null;

  return formatKugouImageUrl(media.cover, kugouSize) ?? youtubeThumbnail;
}
