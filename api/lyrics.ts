import { z } from "zod";
import { Redis } from "@upstash/redis";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "./utils/cors.js";

// Vercel Edge Function configuration
export const config = {
  runtime: "edge",
};

/**
 * Expected request body
 */
const LyricsRequestSchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  force: z.boolean().optional(),
  action: z.enum(["auto", "search", "fetch"]).optional(),
  query: z.string().optional(),
  selectedHash: z.string().optional(),
  selectedAlbumId: z.union([z.string(), z.number()]).optional(),
  selectedTitle: z.string().optional(),
  selectedArtist: z.string().optional(),
  selectedAlbum: z.string().optional(),
});

type LyricsRequest = z.infer<typeof LyricsRequestSchema>;

/**
 * Custom headers required by Kugou endpoints
 */
const kugouHeaders: HeadersInit = {
  "User-Agent":
    '{"percent": 21.4, "useragent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36", "system": "Chrome 116.0 Win10", "browser": "chrome", "version": 116.0, "os": "win10"}',
};

/**
 * Generate a random alphanumeric string of given length
 */
function randomString(length: number, chars: string) {
  let result = "";
  const charsLength = chars.length;
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * charsLength));
  }
  return result;
}

/**
 * Fetch cover image URL for the given song hash and album id
 */
async function getCover(
  hash: string,
  albumId: string | number
): Promise<string> {
  const url = new URL("https://wwwapi.kugou.com/yy/index.php");
  url.searchParams.set("r", "play/getdata");
  url.searchParams.set("hash", hash);
  url.searchParams.set(
    "dfid",
    randomString(
      23,
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    )
  );
  url.searchParams.set(
    "mid",
    randomString(23, "abcdefghijklmnopqrstuvwxyz0123456789")
  );
  url.searchParams.set("album_id", String(albumId));
  url.searchParams.set("_", String(Date.now()));

  const res = await fetch(url.toString(), { headers: kugouHeaders });
  if (!res.ok) return "";
  const json = (await res.json()) as { data?: { img?: string } };
  return json?.data?.img ?? "";
}

/**
 * Decode base64 to UTF-8 string in edge runtimes (Buffer is not available)
 */
function base64ToUtf8(base64: string): string {
  // atob returns a binary string where each charCode is a byte
  const binaryString = atob(base64);
  const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Removes content within parentheses from a string
 * Example: "The Chase (R&B Remix)" -> "The Chase"
 */
function stripParentheses(str: string): string {
  if (!str) return str;
  return str.replace(/\s*\([^)]*\)\s*/g, " ").trim();
}

/**
 * Normalize a string for comparison: lowercase, remove accents, strip extra spaces
 */
function normalizeForComparison(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^\w\s]/g, " ") // Replace non-word chars with space
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();
}

/**
 * Calculate a similarity score between two strings (0-1)
 * Uses multiple heuristics: exact match, contains, word overlap
 */
function calculateSimilarity(query: string, target: string): number {
  const normQuery = normalizeForComparison(query);
  const normTarget = normalizeForComparison(target);

  if (!normQuery || !normTarget) return 0;

  // Exact match
  if (normQuery === normTarget) return 1.0;

  // One contains the other
  if (normTarget.includes(normQuery)) return 0.9;
  if (normQuery.includes(normTarget)) return 0.85;

  // Word overlap scoring
  const queryWords = new Set(normQuery.split(" ").filter(Boolean));
  const targetWords = new Set(normTarget.split(" ").filter(Boolean));

  if (queryWords.size === 0) return 0;

  let matchingWords = 0;
  for (const word of Array.from(queryWords)) {
    if (targetWords.has(word)) {
      matchingWords++;
    } else {
      // Check partial word matches (for words > 3 chars)
      if (word.length > 3) {
        for (const targetWord of Array.from(targetWords)) {
          if (targetWord.includes(word) || word.includes(targetWord)) {
            matchingWords += 0.5;
            break;
          }
        }
      }
    }
  }

  return matchingWords / queryWords.size * 0.8; // Scale to max 0.8 for word overlap
}

/**
 * Score a song result based on how well it matches the requested title and artist
 */
function scoreSongMatch(
  song: { songname: string; singername: string },
  requestedTitle: string,
  requestedArtist: string
): number {
  const titleScore = calculateSimilarity(
    stripParentheses(requestedTitle),
    stripParentheses(song.songname)
  );
  const artistScore = calculateSimilarity(
    stripParentheses(requestedArtist),
    stripParentheses(song.singername)
  );

  // Weight title slightly higher than artist
  // Both title and artist matching well should boost the score significantly
  const combinedScore = titleScore * 0.55 + artistScore * 0.45;

  // Bonus if both are good matches
  if (titleScore >= 0.7 && artistScore >= 0.7) {
    return combinedScore + 0.1;
  }

  return combinedScore;
}

// ------------------------------------------------------------------
// Redis cache helpers
// ------------------------------------------------------------------
const LYRICS_CACHE_PREFIX = "lyrics:cache:";

// Simple djb2 string hash -> 32-bit unsigned then hex
const hashString = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

/**
 * Build a stable cache key for a (title, artist) pair.
 * We use a hash of the normalized input to create a clean, fixed-length key.
 * @param songHash - Optional song hash for specific version caching (e.g., when user selects a specific match)
 */
const buildLyricsCacheKey = (title: string, artist: string, songHash?: string): string => {
  const normalized = [title.trim().toLowerCase(), artist.trim().toLowerCase()]
    .filter(Boolean)
    .join("|");
  // Include song hash if provided to cache specific versions separately
  const keySource = songHash ? `${normalized}|${songHash}` : normalized;
  const fingerprint = hashString(keySource);
  return `${LYRICS_CACHE_PREFIX}${fingerprint}`;
};

// ------------------------------------------------------------------
// Basic logging helpers (mirrors style from iframe-check)
// ------------------------------------------------------------------
const logRequest = (
  method: string,
  url: string,
  action: string | null,
  id: string
) => {
  console.log(`[${id}] ${method} ${url} - Action: ${action || "none"}`);
};

const logInfo = (id: string, message: string, data?: unknown) => {
  console.log(`[${id}] INFO: ${message}`, data ?? "");
};

const logError = (id: string, message: string, error: unknown) => {
  console.error(`[${id}] ERROR: ${message}`, error);
};

const generateRequestId = (): string =>
  Math.random().toString(36).substring(2, 10);

// Define minimal response types to avoid any
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

/**
 * Main handler
 */
export default async function handler(req: Request) {
  const requestId = generateRequestId();
  logRequest(req.method, req.url, null, requestId);

  if (req.method === "OPTIONS") {
    const effectiveOrigin = getEffectiveOrigin(req);
    const resp = preflightIfNeeded(req, ["POST", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  if (req.method !== "POST") {
    logError(requestId, "Method not allowed", null);
    return new Response("Method not allowed", { status: 405 });
  }

  // Parse and validate request body
  let body: LyricsRequest;
  try {
    const effectiveOrigin = getEffectiveOrigin(req);
    if (!isAllowedOrigin(effectiveOrigin)) {
      return new Response("Unauthorized", { status: 403 });
    }

    // Rate limiting removed - no longer limiting lyrics search requests

    body = LyricsRequestSchema.parse(await req.json());
  } catch {
    logError(requestId, "Invalid request body", null);
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const {
    title = "",
    artist = "",
    album = "",
    force = false,
    action = "auto",
    query,
    selectedHash,
    selectedAlbumId,
    selectedTitle,
    selectedArtist,
    selectedAlbum,
  } = body;

  // For search action, query is required if title/artist not provided
  if (action === "search" && !query && !title && !artist) {
    return new Response(
      JSON.stringify({
        error: "Query or title/artist is required for search",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // For fetch action, selectedHash is required
  if (action === "fetch" && !selectedHash) {
    return new Response(
      JSON.stringify({
        error: "selectedHash is required for fetch action",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // For auto action (default), require title or artist
  if (action === "auto" && !title && !artist) {
    return new Response(
      JSON.stringify({
        error: "At least one of title or artist is required",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  logInfo(requestId, "Received lyrics request", {
    title,
    artist,
    action,
    query,
    selectedHash,
  });

  // --------------------------
  // 1. Attempt cache lookup (skip if force refresh requested)
  // --------------------------
  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });

  // For search action, skip cache and return results list
  if (action === "search") {
    try {
      // Use query if provided, otherwise build from title/artist/album
      const searchQuery =
        query ||
        [stripParentheses(title), stripParentheses(artist), album]
          .filter(Boolean)
          .join(" ");

      if (!searchQuery) {
        return new Response(
          JSON.stringify({ error: "Search query is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const keyword = encodeURIComponent(searchQuery);
      const searchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${keyword}&page=1&pagesize=20&showtype=1`;

      const searchRes = await fetch(searchUrl, { headers: kugouHeaders });
      if (!searchRes.ok) {
        throw new Error(
          `Kugou search request failed with status ${searchRes.status}`
        );
      }

      const searchJson =
        (await searchRes.json()) as unknown as KugouSearchResponse;
      const infoList: KugouSongInfo[] = searchJson?.data?.info ?? [];

      if (infoList.length === 0) {
        return new Response(
          JSON.stringify({ results: [] }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": getEffectiveOrigin(req)!,
            },
          }
        );
      }

      // Score and sort results
      const scoredResults = infoList.map((song) => ({
        song,
        score: scoreSongMatch(song, title || "", artist || ""),
      }));
      scoredResults.sort((a, b) => b.score - a.score);

      // Return results list without fetching lyrics
      const results = scoredResults.map(({ song, score }) => ({
        title: song.songname,
        artist: song.singername,
        album: song.album_name ?? undefined,
        hash: song.hash,
        albumId: song.album_id,
        score: Math.round(score * 1000) / 1000, // Round to 3 decimals
      }));

      return new Response(JSON.stringify({ results }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getEffectiveOrigin(req)!,
        },
      });
    } catch (error: unknown) {
      logError(requestId, "Error searching lyrics", error);
      console.error("Error searching lyrics:", error);
      return new Response(
        JSON.stringify({ error: "Unexpected server error during search" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": getEffectiveOrigin(req)!,
          },
        }
      );
    }
  }

  // For fetch action, use selectedHash directly
  if (action === "fetch" && selectedHash && selectedAlbumId) {
    // Include the hash in the cache key to ensure different versions are cached separately
    const cacheKey = buildLyricsCacheKey(
      selectedTitle || title,
      selectedArtist || artist,
      selectedHash
    );
    if (!force) {
      try {
        const cachedRaw = await redis.get(cacheKey);
        if (cachedRaw) {
          const cachedStr =
            typeof cachedRaw === "string"
              ? cachedRaw
              : JSON.stringify(cachedRaw);
          logInfo(requestId, "Lyrics cache HIT (fetch)", { cacheKey });
          return new Response(cachedStr, {
            headers: {
              "Content-Type": "application/json",
              "X-Lyrics-Cache": "HIT",
              "Access-Control-Allow-Origin": getEffectiveOrigin(req)!,
            },
          });
        }
        logInfo(requestId, "Lyrics cache MISS (fetch)", { cacheKey });
      } catch (e) {
        logError(requestId, "Redis cache lookup failed (lyrics fetch)", e);
        console.error("Redis cache lookup failed (lyrics fetch)", e);
        // continue without cache
      }
    } else {
      logInfo(requestId, "Bypassing lyrics cache due to force flag (fetch)", {
        cacheKey,
      });
    }

    // Fetch lyrics for selected hash
    try {
      const songHash = selectedHash;
      const albumId = selectedAlbumId;

      // Get lyrics candidate id & access key
      const candidateUrl = `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=${songHash}&album_audio_id=`;
      const candidateRes = await fetch(candidateUrl, {
        headers: kugouHeaders,
      });
      if (!candidateRes.ok) {
        throw new Error(
          `Failed to get lyrics candidate (status ${candidateRes.status})`
        );
      }

      const candidateJson =
        (await candidateRes.json()) as unknown as CandidateResponse;
      const candidate = candidateJson?.candidates?.[0];
      if (!candidate) {
        throw new Error("No lyrics candidate found");
      }

      // Download LRC content
      const lyricsId = candidate.id;
      const lyricsKey = candidate.accesskey;
      const lyricsUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${lyricsId}&accesskey=${lyricsKey}&fmt=lrc&charset=utf8`;
      const lyricsRes = await fetch(lyricsUrl, { headers: kugouHeaders });
      if (!lyricsRes.ok) {
        throw new Error(`Failed to download lyrics (status ${lyricsRes.status})`);
      }

      const lyricsJson =
        (await lyricsRes.json()) as unknown as LyricsDownloadResponse;
      const encoded = lyricsJson?.content;
      if (!encoded) {
        throw new Error("No lyrics content in response");
      }

      const lyricsText = base64ToUtf8(encoded);

      // Fetch cover image
      const cover = await getCover(songHash, albumId);

      // Build response object
      const result = {
        title: selectedTitle || title,
        artist: selectedArtist || artist,
        album: selectedAlbum || album || undefined,
        lyrics: lyricsText,
        cover,
      };

      // Store in cache
      try {
        await redis.set(cacheKey, JSON.stringify(result));
        logInfo(requestId, "Fetched lyrics successfully (fetch)", {
          title: result.title,
          artist: result.artist,
        });
      } catch (err) {
        logError(requestId, "Redis cache write failed (lyrics fetch)", err);
        console.error("Redis cache write failed (lyrics fetch)", err);
      }

      return new Response(JSON.stringify(result), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getEffectiveOrigin(req)!,
          "X-Lyrics-Cache": force ? "BYPASS" : "MISS",
        },
      });
    } catch (error: unknown) {
      logError(requestId, "Error fetching lyrics (fetch action)", error);
      console.error("Error fetching lyrics (fetch action):", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Unexpected server error during fetch",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": getEffectiveOrigin(req)!,
          },
        }
      );
    }
  }

  // Default auto action - existing behavior
  const cacheKey = buildLyricsCacheKey(title, artist);
  if (!force) {
    try {
      const cachedRaw = await redis.get(cacheKey);
      if (cachedRaw) {
        const cachedStr =
          typeof cachedRaw === "string" ? cachedRaw : JSON.stringify(cachedRaw);
        logInfo(requestId, "Lyrics cache HIT", { cacheKey });
        return new Response(cachedStr, {
          headers: {
            "Content-Type": "application/json",
            "X-Lyrics-Cache": "HIT",
            "Access-Control-Allow-Origin": getEffectiveOrigin(req)!,
          },
        });
      }
      logInfo(requestId, "Lyrics cache MISS", { cacheKey });
    } catch (e) {
      logError(requestId, "Redis cache lookup failed (lyrics)", e);
      console.error("Redis cache lookup failed (lyrics)", e);
      // continue without cache
    }
  } else {
    logInfo(requestId, "Bypassing lyrics cache due to force flag", {
      cacheKey,
    });
  }

  try {

    // 1. Search song (fetch more results to find best match)
    const keyword = encodeURIComponent(
      [stripParentheses(title), stripParentheses(artist), album]
        .filter(Boolean)
        .join(" ")
    );
    const searchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${keyword}&page=1&pagesize=20&showtype=1`;

    const searchRes = await fetch(searchUrl, { headers: kugouHeaders });
    if (!searchRes.ok) {
      throw new Error(
        `Kugou search request failed with status ${searchRes.status}`
      );
    }

    const searchJson =
      (await searchRes.json()) as unknown as KugouSearchResponse;
    const infoList: KugouSongInfo[] = searchJson?.data?.info ?? [];

    if (infoList.length === 0) {
      return new Response(
        JSON.stringify({ error: "No matching songs found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Score and sort results by how well they match title/artist
    const scoredResults = infoList.map((song) => ({
      song,
      score: scoreSongMatch(song, title, artist),
    }));
    scoredResults.sort((a, b) => b.score - a.score);

    logInfo(requestId, "Kugou search results scored", {
      totalResults: scoredResults.length,
      topMatches: scoredResults.slice(0, 3).map((r) => ({
        title: r.song.songname,
        artist: r.song.singername,
        score: r.score.toFixed(3),
      })),
    });

    // Iterate through sorted results until we successfully fetch lyrics
    for (const { song } of scoredResults) {
      const songHash: string = song.hash;
      const albumId = song.album_id;

      // 2. Get lyrics candidate id & access key
      const candidateUrl = `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=${songHash}&album_audio_id=`;
      const candidateRes = await fetch(candidateUrl, { headers: kugouHeaders });
      if (!candidateRes.ok) continue;

      const candidateJson =
        (await candidateRes.json()) as unknown as CandidateResponse;
      const candidate = candidateJson?.candidates?.[0];
      if (!candidate) continue;

      // 3. Download LRC content
      const lyricsId = candidate.id;
      const lyricsKey = candidate.accesskey;
      const lyricsUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${lyricsId}&accesskey=${lyricsKey}&fmt=lrc&charset=utf8`;
      const lyricsRes = await fetch(lyricsUrl, { headers: kugouHeaders });
      if (!lyricsRes.ok) continue;

      const lyricsJson =
        (await lyricsRes.json()) as unknown as LyricsDownloadResponse;
      const encoded = lyricsJson?.content;
      if (!encoded) continue;

      const lyricsText = base64ToUtf8(encoded);

      // 4. Fetch cover image
      const cover = await getCover(songHash, albumId);

      // 5. Build response object
      const result = {
        title: song.songname,
        artist: song.singername,
        album: song.album_name ?? undefined,
        lyrics: lyricsText,
        cover,
      };

      // 6. Store in cache (TTL 30 days)
      try {
        await redis.set(cacheKey, JSON.stringify(result));
        logInfo(requestId, "Fetched lyrics successfully", {
          title: result.title,
          artist: result.artist,
        });
      } catch (err) {
        logError(requestId, "Redis cache write failed (lyrics)", err);
        console.error("Redis cache write failed (lyrics)", err);
      }

      return new Response(JSON.stringify(result), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getEffectiveOrigin(req)!,
          "X-Lyrics-Cache": force ? "BYPASS" : "MISS",
        },
      });
    }

    // If loop completes without returning, we failed to fetch lyrics
    return new Response(
      JSON.stringify({ error: "Lyrics not found for given query" }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getEffectiveOrigin(req)!,
        },
      }
    );
  } catch (error: unknown) {
    logError(requestId, "Error fetching lyrics", error);
    console.error("Error fetching lyrics:", error);
    return new Response(JSON.stringify({ error: "Unexpected server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getEffectiveOrigin(req)!,
      },
    });
  }
}
