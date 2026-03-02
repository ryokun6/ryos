/**
 * Kugou API Functions
 * 
 * Functions for searching and fetching lyrics from Kugou music service.
 */

import { Converter } from "opencc-js";
import { kugouHeaders } from "./_constants.js";
import {
  fetchWithTimeout,
  base64ToUtf8,
  decodeKRC,
  scoreSongMatch,
  logInfo,
  logError,
} from "./_utils.js";
import type { LyricsSource, LyricsContent } from "../_utils/_song-service.js";

// Chinese character converters
const simplifiedToTraditional = Converter({ from: "cn", to: "tw" });
const traditionalToSimplified = Converter({ from: "tw", to: "cn" });

/**
 * Normalize artist separator from Chinese comma to " & "
 * KuGou uses "、" to separate multiple artists (e.g., "周杰倫、蔡依林")
 */
function normalizeArtistSeparator(artist: string): string {
  return artist.replace(/、/g, " & ");
}

// =============================================================================
// Types
// =============================================================================

type KugouSongInfo = {
  hash: string;
  album_id: string | number;
  songname: string;
  singername: string;
  album_name?: string;
};

type KugouSearchResponse = {
  data?: {
    info?: KugouSongInfo[];
  };
};

type LyricsCandidate = {
  id: number | string;
  accesskey: string;
};

type CandidateResponse = {
  candidates?: LyricsCandidate[];
};

type LyricsDownloadResponse = {
  content?: string;
};

export interface KugouSearchResult {
  title: string;
  artist: string;
  album?: string;
  hash: string;
  albumId: string | number;
  score: number;
}

/**
 * Result from fetching lyrics from Kugou
 * Cover is returned separately from lyrics content since it's stored in metadata
 */
export interface KugouLyricsResult {
  lyrics: LyricsContent;
  cover: string;
}

// =============================================================================
// Cover URL Functions
// =============================================================================

/**
 * Fetch cover image URL from Kugou API
 * Uses the album/info endpoint which returns imgurl
 * The URL contains {size} placeholder that should be replaced on the client
 * Returns HTTPS URL to avoid mixed content issues
 */
export async function fetchCoverUrl(hash: string, albumId: string | number): Promise<string> {
  if (!albumId) return "";
  
  try {
    const url = `http://mobilecdn.kugou.com/api/v3/album/info?albumid=${albumId}`;
    const res = await fetchWithTimeout(url, { headers: kugouHeaders }, 5000);
    if (!res.ok) return "";
    const json = (await res.json()) as { data?: { imgurl?: string } };
    const imgurl = json?.data?.imgurl ?? "";
    // Convert to HTTPS to avoid mixed content issues in browsers
    return imgurl.replace(/^http:\/\//, "https://");
  } catch {
    return "";
  }
}

/**
 * Replace {size} placeholder in Kugou image URL with actual size
 * Kugou image URLs contain {size} that needs to be replaced with: 100, 150, 240, 400, etc.
 */
export function formatKugouImageUrl(imgUrl: string | undefined, size: number = 400): string {
  if (!imgUrl) return "";
  return imgUrl.replace("{size}", String(size));
}

// =============================================================================
// Public API
// =============================================================================

// Timeout for Kugou API search (15 seconds - external API may be slow)
const KUGOU_SEARCH_TIMEOUT_MS = 15000;

/**
 * Search for songs on Kugou
 * Converts query to Simplified Chinese for better search results
 * (Kugou is a Chinese service that works best with Simplified Chinese)
 */
export async function searchKugou(
  query: string,
  title: string,
  artist: string
): Promise<KugouSearchResult[]> {
  // Convert query to Simplified Chinese for better Kugou search results
  const simplifiedQuery = traditionalToSimplified(query);
  const keyword = encodeURIComponent(simplifiedQuery);
  const searchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${keyword}&page=1&pagesize=20&showtype=1`;

  let searchRes: Response;
  try {
    searchRes = await fetchWithTimeout(searchUrl, { headers: kugouHeaders }, KUGOU_SEARCH_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Kugou search timed out after ${KUGOU_SEARCH_TIMEOUT_MS / 1000} seconds`);
    }
    throw new Error(`Kugou search network error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  if (!searchRes.ok) {
    throw new Error(`Kugou search failed with status ${searchRes.status}`);
  }

  const searchJson = (await searchRes.json()) as unknown as KugouSearchResponse;
  const infoList: KugouSongInfo[] = searchJson?.data?.info ?? [];

  // Convert Kugou metadata from Simplified to Traditional Chinese
  // Also normalize artist separator from Chinese comma "、" to " & "
  const scoredResults = infoList.map((song) => ({
    title: simplifiedToTraditional(song.songname),
    artist: normalizeArtistSeparator(simplifiedToTraditional(song.singername)),
    album: song.album_name ? simplifiedToTraditional(song.album_name) : undefined,
    hash: song.hash,
    albumId: song.album_id,
    score: Math.round(scoreSongMatch(song, title, artist) * 1000) / 1000,
  }));

  scoredResults.sort((a, b) => b.score - a.score);
  return scoredResults;
}

/**
 * Fetch lyrics from Kugou using a lyrics source
 * Returns both lyrics content and cover URL (cover is stored in metadata, not lyrics)
 */
export async function fetchLyricsFromKugou(
  source: LyricsSource,
  requestId: string
): Promise<KugouLyricsResult | null> {
  const { hash, albumId } = source;

  // Get lyrics candidate
  const candidateUrl = `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=${hash}&album_audio_id=`;
  let candidateRes: Response;
  try {
    candidateRes = await fetchWithTimeout(candidateUrl, { headers: kugouHeaders });
  } catch (err) {
    logError(requestId, "Failed to fetch lyrics candidate (network/timeout)", err);
    return null;
  }

  if (!candidateRes.ok) {
    logError(requestId, "Failed to get lyrics candidate", candidateRes.status);
    return null;
  }

  let candidateJson: CandidateResponse;
  try {
    candidateJson = (await candidateRes.json()) as unknown as CandidateResponse;
  } catch (err) {
    logError(requestId, "Failed to parse lyrics candidate response", err);
    return null;
  }

  const candidate = candidateJson?.candidates?.[0];
  if (!candidate) {
    logError(requestId, "No lyrics candidate found", null);
    return null;
  }

  const lyricsId = candidate.id;
  const lyricsKey = candidate.accesskey;

  // Try KRC format first
  let lrc: string | undefined;
  let krc: string | undefined;

  const krcUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${lyricsId}&accesskey=${lyricsKey}&fmt=krc&charset=utf8`;
  try {
    const krcRes = await fetchWithTimeout(krcUrl, { headers: kugouHeaders });
    if (krcRes.ok) {
      const krcJson = (await krcRes.json()) as unknown as LyricsDownloadResponse;
      if (krcJson?.content) {
        try {
          krc = decodeKRC(krcJson.content);
          logInfo(requestId, "Successfully decoded KRC lyrics");
        } catch (decodeErr) {
          logInfo(requestId, "KRC decode failed", decodeErr);
        }
      }
    }
  } catch (err) {
    logInfo(requestId, "KRC fetch failed, trying LRC", err);
  }

  // Fetch LRC format
  const lrcUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${lyricsId}&accesskey=${lyricsKey}&fmt=lrc&charset=utf8`;
  try {
    const lrcRes = await fetchWithTimeout(lrcUrl, { headers: kugouHeaders });
    if (lrcRes.ok) {
      const lrcJson = (await lrcRes.json()) as unknown as LyricsDownloadResponse;
      if (lrcJson?.content) {
        try {
          lrc = base64ToUtf8(lrcJson.content);
        } catch (decodeErr) {
          logInfo(requestId, "LRC base64 decode failed", decodeErr);
        }
      }
    }
  } catch (err) {
    logInfo(requestId, "LRC fetch failed", err);
  }

  if (!lrc && !krc) {
    return null;
  }

  // Fetch cover image URL from Kugou API
  const cover = await fetchCoverUrl(hash, albumId);

  return {
    lyrics: {
      lrc: lrc || krc || "",
      krc,
    },
    cover,
  };
}

