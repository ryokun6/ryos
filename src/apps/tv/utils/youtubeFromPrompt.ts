import type { Video } from "@/stores/useVideoStore";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { isYouTubeUrl, parseYouTubeId } from "@/apps/tv/utils";

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

  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
  const oembedResponse = await abortableFetch(oembedUrl, {
    timeout: 15000,
    throwOnHttpError: false,
    credentials: "omit",
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
  if (!oembedResponse.ok) return null;

  const oembedData = await oembedResponse.json();
  const rawTitle = (oembedData.title as string) || `Video ${id}`;
  const authorName = oembedData.author_name as string | undefined;

  const videoInfo: Partial<Video> = {
    title: rawTitle,
    artist: undefined,
  };

  try {
    const parseResponse = await abortableFetch(getApiUrl("/api/parse-title"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: rawTitle,
        author_name: authorName,
      }),
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    });
    if (parseResponse.ok) {
      const parsedData = await parseResponse.json();
      videoInfo.title = parsedData.title || rawTitle;
      videoInfo.artist = parsedData.artist;
    }
  } catch {
    // ignore — keep oEmbed title
  }

  return {
    id,
    url,
    title: videoInfo.title!,
    artist: videoInfo.artist,
  };
}
