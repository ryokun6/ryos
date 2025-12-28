/**
 * Kugou API Functions
 * 
 * Functions for searching and fetching lyrics from Kugou music service.
 */

import { Converter } from "opencc-js";
import { kugouHeaders } from "./_constants.js";
import {
  fetchWithTimeout,
  randomString,
  base64ToUtf8,
  decodeKRC,
  scoreSongMatch,
  logInfo,
  logError,
} from "./_utils.js";
import type { LyricsSource, LyricsContent } from "../_utils/song-service.js";

// Simplified Chinese to Traditional Chinese converter
const simplifiedToTraditional = Converter({ from: "cn", to: "tw" });

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

// =============================================================================
// Internal Functions
// =============================================================================

async function getCover(hash: string, albumId: string | number): Promise<string> {
  try {
    const url = new URL("https://wwwapi.kugou.com/yy/index.php");
    url.searchParams.set("r", "play/getdata");
    url.searchParams.set("hash", hash);
    url.searchParams.set("dfid", randomString(23, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"));
    url.searchParams.set("mid", randomString(23, "abcdefghijklmnopqrstuvwxyz0123456789"));
    url.searchParams.set("album_id", String(albumId));
    url.searchParams.set("_", String(Date.now()));

    const res = await fetchWithTimeout(url.toString(), { headers: kugouHeaders });
    if (!res.ok) return "";
    const json = (await res.json()) as { data?: { img?: string } };
    return json?.data?.img ?? "";
  } catch {
    return "";
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Search for songs on Kugou
 */
export async function searchKugou(
  query: string,
  title: string,
  artist: string
): Promise<KugouSearchResult[]> {
  const keyword = encodeURIComponent(query);
  const searchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${keyword}&page=1&pagesize=20&showtype=1`;

  let searchRes: Response;
  try {
    searchRes = await fetchWithTimeout(searchUrl, { headers: kugouHeaders });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Kugou search timed out after 10 seconds");
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
 */
export async function fetchLyricsFromKugou(
  source: LyricsSource,
  requestId: string
): Promise<LyricsContent | null> {
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

  // Fetch cover image
  const cover = await getCover(hash, albumId);

  return {
    lrc: lrc || krc || "",
    krc,
    cover,
  };
}

// Re-export the converter for use in KRC translation extraction
export { simplifiedToTraditional };
