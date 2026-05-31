import type { Video } from "@/stores/useVideoStore";
import { isYouTubeUrl, parseYouTubeId } from "@/apps/tv/utils";
import { fetchYouTubeOembed, parseYouTubeTitle } from "@/utils/youtubeMetadata";

/**
 * Returns the pasted substring that should be treated as a single YouTube
 * reference (full URL, bare youtu.be link, or bare 11-char id), or null.
 */
export function parseYoutubePasteInput(trimmed: string): string | null {
  if (!trimmed) return null;
  if (parseYouTubeId(trimmed)) return trimmed;
  const urlMatch = trimmed.match(/https?:\/\/[^\s<>"']+/i);
  if (urlMatch?.[0] && isYouTubeUrl(urlMatch[0])) return urlMatch[0];
  return null;
}

/** Resolve oEmbed (+ optional parse-title) into a Videos-store-shaped clip. */
export async function fetchYoutubeVideoForTvPrompt(
  rawInput: string
): Promise<Video | null> {
  const id = parseYouTubeId(rawInput.trim());
  if (!id) return null;

  const url =
    rawInput.trim().startsWith("http") && isYouTubeUrl(rawInput.trim())
      ? rawInput.trim()
      : `https://www.youtube.com/watch?v=${id}`;

  const oembed = await fetchYouTubeOembed(id);
  if (!oembed.ok) return null;

  const rawTitle = oembed.rawTitle || `Video ${id}`;
  const { title, artist } = await parseYouTubeTitle(rawTitle, oembed.authorName);

  return { id, url, title, artist };
}
