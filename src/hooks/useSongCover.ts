/**
 * Hook to fetch song cover art from the song metadata cache.
 * Returns the Kugou cover URL if available, otherwise falls back to YouTube thumbnail.
 */
import { useState, useEffect } from "react";
import { ApiRequestError } from "@/api/core";
import { getSongById } from "@/api/songs";
import { formatKugouImageUrl } from "@/utils/kugouImageUrl";

interface SongMetadataResponse {
  id: string;
  cover?: string;
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
        const data = await getSongById<SongMetadataResponse>(youtubeId, {
          include: "metadata",
          signal: controller.signal,
        });
        const formattedCover = formatKugouImageUrl(data.cover, 400);
        coverCache.set(youtubeId, formattedCover);
        setCoverUrl(formattedCover ?? fallbackThumbnail ?? null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (error instanceof ApiRequestError && error.status === 404) {
          coverCache.set(youtubeId, null);
          setCoverUrl(fallbackThumbnail ?? null);
          return;
        }
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

/**
 * Clear the cover cache for a specific song or all songs.
 * Useful when song metadata is updated.
 */
export function clearSongCoverCache(youtubeId?: string): void {
  if (youtubeId) {
    coverCache.delete(youtubeId);
  } else {
    coverCache.clear();
  }
}
