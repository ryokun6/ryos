/**
 * Hook to fetch song cover art from the song metadata cache.
 * Returns the Kugou cover URL if available, otherwise falls back to YouTube thumbnail.
 */
import { useState, useEffect } from "react";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

interface SongMetadataResponse {
  id: string;
  cover?: string;
}

/**
 * Replace {size} placeholder in Kugou image URL with actual size
 * Kugou image URLs contain {size} that needs to be replaced with: 100, 150, 240, 400, etc.
 * Also ensures HTTPS is used to avoid mixed content issues
 */
function formatKugouImageUrl(imgUrl: string | undefined, size: number = 400): string | null {
  if (!imgUrl) return null;
  let url = imgUrl.replace("{size}", String(size));
  // Ensure HTTPS
  url = url.replace(/^http:\/\//, "https://");
  return url;
}

// Simple in-memory cache for cover URLs to avoid repeated fetches
const coverCache = new Map<string, string | null>();

/**
 * Hook to get the cover URL for a song.
 * Fetches from the song metadata API and caches the result.
 * 
 * @param youtubeId - YouTube video ID
 * @param fallbackThumbnail - Optional fallback thumbnail URL (e.g., YouTube thumbnail)
 * @returns The cover URL (Kugou if available, otherwise fallback)
 */
export function useSongCover(
  youtubeId: string | null | undefined,
  fallbackThumbnail?: string | null
): string | null {
  const [coverUrl, setCoverUrl] = useState<string | null>(() => {
    // Check cache first
    if (youtubeId && coverCache.has(youtubeId)) {
      return coverCache.get(youtubeId) ?? fallbackThumbnail ?? null;
    }
    return fallbackThumbnail ?? null;
  });

  useEffect(() => {
    if (!youtubeId) {
      setCoverUrl(null);
      return;
    }

    // Check cache first
    if (coverCache.has(youtubeId)) {
      const cached = coverCache.get(youtubeId);
      setCoverUrl(cached ?? fallbackThumbnail ?? null);
      return;
    }

    // Set fallback immediately while fetching
    setCoverUrl(fallbackThumbnail ?? null);

    // Fetch cover from song metadata API
    const controller = new AbortController();
    
    (async () => {
      try {
        const response = await abortableFetch(
          getApiUrl(`/api/songs/${encodeURIComponent(youtubeId)}?include=metadata`),
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            signal: controller.signal,
            timeout: 10000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );

        if (response.ok) {
          const data: SongMetadataResponse = await response.json();
          const formattedCover = formatKugouImageUrl(data.cover, 400);
          coverCache.set(youtubeId, formattedCover);
          setCoverUrl(formattedCover ?? fallbackThumbnail ?? null);
        } else {
          // Song not found or error - cache null and use fallback
          coverCache.set(youtubeId, null);
          setCoverUrl(fallbackThumbnail ?? null);
        }
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        // On error, use fallback
        console.warn(`[useSongCover] Failed to fetch cover for ${youtubeId}:`, error);
        coverCache.set(youtubeId, null);
        setCoverUrl(fallbackThumbnail ?? null);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [youtubeId, fallbackThumbnail]);

  return coverUrl;
}
