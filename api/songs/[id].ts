/**
 * Unified Song API Endpoint
 *
 * GET /api/songs/{id} - Retrieve song data
 * POST /api/songs/{id} - Update song metadata
 * DELETE /api/songs/{id} - Delete song (admin only)
 *
 * Query params for GET:
 * - include: Comma-separated list of: metadata,lyrics,translations,furigana
 * - translateTo: Language code to fetch/generate translation
 * - withFurigana: Boolean to fetch/generate furigana
 * - force: Boolean to bypass cache
 *
 * Sub-routes (handled via action param):
 * - POST with action=fetch-lyrics: Fetch lyrics from Kugou
 * - POST with action=translate: Generate translation
 * - POST with action=furigana: Generate furigana
 * - POST with action=search-lyrics: Search for lyrics matches
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  getSong,
  saveSong,
  deleteSong,
  saveLyrics,
  saveTranslation,
  saveFurigana,
  saveSoramimi,
  canModifySong,
  type LyricsSource,
  type LyricsContent,
} from "../_utils/_song-service.js";

// Import from split modules
import {
  UpdateSongSchema,
  FetchLyricsSchema,
  SearchLyricsSchema,
  TranslateStreamSchema,
  FuriganaStreamSchema,
  SoramimiStreamSchema,
  ClearCachedDataSchema,
  UnshareSongSchema,
} from "./_constants.js";

import {
  isValidYouTubeVideoId,
  stripParentheses,
  parseYouTubeTitleWithAI,
  msToLrcTime,
  type LyricLine,
} from "./_utils.js";

import {
  searchKugou,
  fetchLyricsFromKugou,
  fetchCoverUrl,
} from "./_kugou.js";

import {
  isChineseTraditional,
  parseLyricsContent,
  buildChineseTranslationFromKrc,
  getTranslationSystemPrompt,
  streamTranslation,
} from "./_lyrics.js";

import {
  lyricsAreMostlyChinese,
  containsKanji,
  parseRubyMarkup,
} from "./_furigana.js";

import {
  SORAMIMI_SYSTEM_PROMPT,
  SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT,
  SORAMIMI_ENGLISH_SYSTEM_PROMPT,
  SORAMIMI_ENGLISH_WITH_FURIGANA_PROMPT,
  convertLinesToAnnotatedText,
  parseSoramimiRubyMarkup,
  fillMissingReadings,
  cleanSoramimiReading,
} from "./_soramimi.js";

import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { initLogger } from "../_utils/_logging.js";

export const runtime = "nodejs";
export const maxDuration = 120;

// ============================================================================
// Local Helper Functions
// ============================================================================

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

// Helper for SSE responses with Node.js VercelResponse
function sendSSEResponse(res: VercelResponse, origin: string | null, data: unknown): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  res.end();
}

// Rate limiting configuration
const RATE_LIMITS = {
  get: { windowSeconds: 60, limit: 300 },           // 300/min for GET
  fetchLyrics: { windowSeconds: 60, limit: 30 },    // 30/min for fetch-lyrics
  searchLyrics: { windowSeconds: 60, limit: 60 },   // 60/min for search-lyrics
  translateStream: { windowSeconds: 60, limit: 10 },// 10/min for translate-stream
  furiganaStream: { windowSeconds: 60, limit: 10 }, // 10/min for furigana-stream
  soramimiStream: { windowSeconds: 60, limit: 10 }, // 10/min for soramimi-stream
};

// =============================================================================
// Main Handler
// =============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();

  // Extract song ID from query params
  const songId = req.query.id as string | undefined;

  const effectiveOrigin = getEffectiveOrigin(req);
  setCorsHeaders(res, effectiveOrigin, { methods: ["GET", "POST", "DELETE", "OPTIONS"] });

  logger.request(req.method || "GET", `/api/songs/${songId || "[id]"}`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  // Helper for JSON responses
  const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) => {
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    logger.response(status, Date.now() - startTime);
    return res.status(status).json(data);
  };

  const errorResponse = (message: string, status = 400) => {
    logger.info(`Response: ${status} - ${message}`);
    return jsonResponse({ error: message }, status);
  };

  if (!isAllowedOrigin(effectiveOrigin)) {
    logger.warn("Unauthorized origin", { effectiveOrigin });
    return errorResponse("Unauthorized", 403);
  }

  // Create Redis client
  const redis = createRedis();

  if (!songId || songId === "[id]") {
    logger.warn("Song ID is required");
    return errorResponse("Song ID is required", 400);
  }

  // Validate YouTube video ID format (allow GET to return 404 for unknown IDs)
  if (!isValidYouTubeVideoId(songId)) {
    if (req.method === "GET") {
      return errorResponse("Song not found", 404);
    }
    return errorResponse("Invalid song ID format. Expected YouTube video ID (11 characters, alphanumeric with - and _)", 400);
  }

  try {
    // =========================================================================
    // GET: Retrieve song data
    // =========================================================================
    if (req.method === "GET") {
      const ip = getClientIp(req);
      const rlKey = RateLimit.makeKey(["rl", "song", "get", "ip", ip]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.get.windowSeconds,
        limit: RATE_LIMITS.get.limit,
      });

      if (!rlResult.allowed) {
        logger.warn("Rate limit exceeded (get)", { ip });
        return jsonResponse(
          {
            error: "rate_limit_exceeded",
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          },
          429,
          { "Retry-After": String(rlResult.resetSeconds) }
        );
      }

      const includeParam = (req.query.include as string) || "metadata";
      const includes = includeParam.split(",").map((s) => s.trim());

      logger.info("GET song", { songId, includes });

      // Fetch song with requested includes
      const song = await getSong(redis, songId, {
        includeMetadata: includes.includes("metadata"),
        includeLyrics: includes.includes("lyrics"),
        includeTranslations: includes.includes("translations"),
        includeFurigana: includes.includes("furigana"),
        includeSoramimi: includes.includes("soramimi"),
      });

      if (!song) {
        logger.warn("Song not found", { songId });
        return errorResponse("Song not found", 404);
      }

      // Generate parsedLines on-demand (not stored in Redis)
      // Use lyricsSource title/artist for filtering (consistent with how annotations were generated)
      if (song.lyrics) {
        (song.lyrics as LyricsContent & { parsedLines?: unknown }).parsedLines = parseLyricsContent(
          { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
          song.lyricsSource?.title || song.title,
          song.lyricsSource?.artist || song.artist
        );
      }

      logger.info(`Response: 200 OK`, { 
        hasLyrics: !!song.lyrics,
        hasTranslations: !!song.translations,
        hasFurigana: !!song.furigana,
        hasSoramimi: !!song.soramimi || !!song.soramimiByLang,
        duration: `${Date.now() - startTime}ms` 
      });
      return jsonResponse(song);
    }

    // =========================================================================
    // POST: Update song or perform action
    // =========================================================================
    if (req.method === "POST") {
      // Vercel throws an error when accessing req.body with malformed JSON
      // Wrap in try-catch to return proper 400 error
      let bodyObj: Record<string, unknown>;
      try {
        const body = req.body;
        if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
          return errorResponse("Invalid JSON body", 400);
        }
        bodyObj = body as Record<string, unknown>;
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }
      const action = bodyObj?.action;
      
      logger.info(`POST action=${action || "update-metadata"}`, {
        hasLyricsSource: !!bodyObj?.lyricsSource,
        language: bodyObj?.language,
        force: bodyObj?.force,
        query: bodyObj?.query,
      });

      // Extract auth credentials
      const authHeader = req.headers.authorization as string | undefined;
      const usernameHeader = req.headers["x-username"] as string | undefined;
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;
      const requestIp = getClientIp(req);
      const rateLimitUser = username?.toLowerCase() || requestIp;

      // Handle search-lyrics action (no auth required)
      if (action === "search-lyrics") {
        const rlKey = RateLimit.makeKey(["rl", "song", "search-lyrics", "ip", requestIp]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.searchLyrics.windowSeconds,
          limit: RATE_LIMITS.searchLyrics.limit,
        });

        if (!rlResult.allowed) {
          logger.warn("Rate limit exceeded (search-lyrics)", { ip: requestIp });
          return jsonResponse(
            {
              error: "rate_limit_exceeded",
              limit: rlResult.limit,
              retryAfter: rlResult.resetSeconds,
            },
            429,
            { "Retry-After": String(rlResult.resetSeconds) }
          );
        }

        const parsed = SearchLyricsSchema.safeParse(bodyObj);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        // Get song for title/artist context
        const song = await getSong(redis, songId, { includeMetadata: true });
        const rawTitle = song?.title || "";
        const rawArtist = song?.artist || "";
        
        let query = parsed.data.query;
        let searchTitle = rawTitle;
        let searchArtist = rawArtist;
        
        // If no custom query provided, build search query
        if (!query && rawTitle) {
          // Only use AI parsing if we don't have a proper artist (new video without metadata)
          // If artist exists, title/artist are already clean metadata - use them directly
          if (!rawArtist) {
            const aiParsed = await parseYouTubeTitleWithAI(rawTitle, rawArtist, requestId);
            searchTitle = aiParsed.title || rawTitle;
            searchArtist = aiParsed.artist || rawArtist;
            logger.info("AI-parsed search query (no artist)", { original: rawTitle, parsed: { title: searchTitle, artist: searchArtist } });
          }
          query = `${stripParentheses(searchTitle)} ${stripParentheses(searchArtist)}`.trim();
        } else if (!query) {
          query = `${stripParentheses(rawTitle)} ${stripParentheses(rawArtist)}`.trim();
        }

        if (!query) {
          return errorResponse("Search query is required");
        }

        logger.info("Searching lyrics", { query });
        const results = await searchKugou(query, searchTitle, searchArtist);
        logger.info(`Response: 200 OK - Found ${results.length} results`);
        return jsonResponse({ results });
      }

      // Handle fetch-lyrics action
      // - First time fetch (no existing lyrics): anyone can do it
      // - Changing lyrics source or force refresh: requires auth + canModifySong
      if (action === "fetch-lyrics") {
        const rlKey = RateLimit.makeKey(["rl", "song", "fetch-lyrics", "user", rateLimitUser]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.fetchLyrics.windowSeconds,
          limit: RATE_LIMITS.fetchLyrics.limit,
        });

        if (!rlResult.allowed) {
          logger.warn("Rate limit exceeded (fetch-lyrics)", { user: rateLimitUser });
          return jsonResponse(
            {
              error: "rate_limit_exceeded",
              limit: rlResult.limit,
              retryAfter: rlResult.resetSeconds,
            },
            429,
            { "Retry-After": String(rlResult.resetSeconds) }
          );
        }

        const parsed = FetchLyricsSchema.safeParse(bodyObj);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const force = parsed.data.force || false;
        let lyricsSource: LyricsSource | undefined = parsed.data.lyricsSource as LyricsSource | undefined;
        
        // Client can pass title/artist directly (useful when song not in Redis yet)
        const clientTitle = parsed.data.title;
        const clientArtist = parsed.data.artist;
        
        // Return metadata in response (useful for one-call song setup)
        const returnMetadata = parsed.data.returnMetadata;
        
        // Optional: include translation/furigana/soramimi info to reduce round-trips
        const translateTo = parsed.data.translateTo;
        const includeFurigana = parsed.data.includeFurigana;
        const includeSoramimi = parsed.data.includeSoramimi;
        const soramimiTargetLanguage = parsed.data.soramimiTargetLanguage || "zh-TW";

        // Get existing song (include translations/furigana/soramimi if requested)
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeTranslations: translateTo ? [translateTo] : undefined,
          includeFurigana: includeFurigana,
          includeSoramimi: includeSoramimi,
        });

        // Use provided source or existing source
        if (!lyricsSource && song?.lyricsSource) {
          lyricsSource = song.lyricsSource;
        }

        // Check if lyrics source changed (user picked different search result)
        const lyricsSourceChanged = lyricsSource?.hash && 
          song?.lyricsSource?.hash && 
          lyricsSource.hash !== song.lyricsSource.hash;

        // Permission check: changing lyrics source or force refresh requires auth
        // First-time fetch (no existing lyrics source) is allowed for anyone
        if ((force || lyricsSourceChanged) && song?.lyricsSource) {
          const isPublicSong = !song.createdBy;
          const allowAnonymousRefresh = isPublicSong && !username && !authToken;
          if (!allowAnonymousRefresh) {
            if (!username || !authToken) {
              return errorResponse("Unauthorized - authentication required to change lyrics source or force refresh", 401);
            }
            const authResult = await validateAuth(redis, username, authToken);
            if (!authResult.valid) {
              return errorResponse("Unauthorized - invalid credentials", 401);
            }
            const permission = canModifySong(song, username);
            if (!permission.canModify) {
              return errorResponse(permission.reason || "Only the song owner can change lyrics source", 403);
            }
          }
        }

        if (lyricsSourceChanged) {
          logger.info("Lyrics source changed, will re-fetch and clear cached annotations", {
            oldHash: song?.lyricsSource?.hash,
            newHash: lyricsSource?.hash,
          });
        }

        // If we have cached lyrics and not forcing AND source hasn't changed, return them
        if (!force && !lyricsSourceChanged && song?.lyrics?.lrc) {
          // Generate parsedLines on-demand (not stored in Redis)
          const parsedLines = parseLyricsContent(
            { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
            song.lyricsSource?.title || song.title,
            song.lyricsSource?.artist || song.artist
          );
          
          // Fetch cover in background if missing (don't block the response)
          if (!song.cover && song.lyricsSource?.hash && song.lyricsSource?.albumId) {
            const coverSource = song.lyricsSource;
            fetchCoverUrl(coverSource.hash, coverSource.albumId)
              .then(async (cover) => {
                if (cover) {
                  await saveLyrics(redis, songId, song.lyrics!, song.lyricsSource, cover);
                  logger.info("Fetched missing cover in background");
                }
              })
              .catch((err) => {
                logger.info("Failed to fetch missing cover", err);
              });
          }
          
          logger.info(`Response: 200 OK - Returning cached lyrics`, {
            parsedLinesCount: parsedLines.length,
          });
          
          // Build response with optional translation/furigana info
          const response: Record<string, unknown> = {
            lyrics: {
              lrc: song.lyrics.lrc,
              krc: song.lyrics.krc,
              parsedLines,
            },
            cached: true,
          };
          
          // Include translation info if requested
          if (translateTo && parsedLines.length > 0) {
            const totalLines = parsedLines.length;
            let hasTranslation = !!(song.translations?.[translateTo]);
            let translationLrc = hasTranslation ? song.translations![translateTo] : undefined;
            
            // For Chinese Traditional: use KRC source directly if available (skip AI)
            if (!hasTranslation && isChineseTraditional(translateTo) && song.lyrics.krc) {
              const krcDerivedLrc = buildChineseTranslationFromKrc(
                song.lyrics,
                song.lyricsSource?.title || song.title,
                song.lyricsSource?.artist || song.artist
              );
              if (krcDerivedLrc) {
                hasTranslation = true;
                translationLrc = krcDerivedLrc;
                logger.info("Using KRC-derived Traditional Chinese translation (skipping AI)");
                // Save this translation for future requests
                await saveTranslation(redis, songId, translateTo, krcDerivedLrc);
              }
            }
            
            response.translation = {
              totalLines,
              cached: hasTranslation,
              ...(translationLrc ? { lrc: translationLrc } : {}),
            };
          }
          
          // Include furigana info if requested
          if (includeFurigana && parsedLines.length > 0) {
            const totalLines = parsedLines.length;
            const hasFurigana = !!(song.furigana && song.furigana.length > 0);
            
            response.furigana = {
              totalLines,
              cached: hasFurigana,
              ...(hasFurigana ? { data: song.furigana } : {}),
            };
          }
          
          // Include soramimi info if requested
          if (includeSoramimi && parsedLines.length > 0) {
            const totalLines = parsedLines.length;
            
            // Skip Chinese soramimi for Chinese lyrics (no point making Chinese sound like Chinese)
            const shouldSkipChineseSoramimi = soramimiTargetLanguage === "zh-TW" && lyricsAreMostlyChinese(parsedLines);
            
            if (shouldSkipChineseSoramimi) {
              response.soramimi = {
                totalLines,
                cached: false,
                targetLanguage: soramimiTargetLanguage,
                skipped: true,
                skipReason: "chinese_lyrics",
              };
            } else {
              // Get cached soramimi for the requested language
              // First check new soramimiByLang, then fall back to legacy soramimi (Chinese only)
              const cachedSoramimiData = song.soramimiByLang?.[soramimiTargetLanguage] 
                ?? (soramimiTargetLanguage === "zh-TW" ? song.soramimi : undefined);
              const hasSoramimi = !!(cachedSoramimiData && cachedSoramimiData.length > 0);

              response.soramimi = {
                totalLines,
                cached: hasSoramimi,
                targetLanguage: soramimiTargetLanguage,
                ...(hasSoramimi ? { data: cachedSoramimiData } : {}),
              };
            }
          }
          
          // Include metadata if requested (useful for one-call song setup)
          if (returnMetadata) {
            response.metadata = {
              title: song.lyricsSource?.title || song.title,
              artist: song.lyricsSource?.artist || song.artist,
              album: song.lyricsSource?.album || song.album,
              cover: song.cover,
              lyricsSource: song.lyricsSource,
            };
          }
          
          return jsonResponse(response);
        }

        // Determine title/artist for auto-search
        // Priority: song from Redis > client-provided > empty
        const rawTitle = song?.title || clientTitle || "";
        const rawArtist = song?.artist || clientArtist || "";

        // If no source, try auto-search
        if (!lyricsSource && rawTitle) {
          let searchTitle = rawTitle;
          let searchArtist = rawArtist;
          
          // Only use AI parsing if we don't have a proper artist (new video without metadata)
          // If artist exists, title/artist are already clean metadata - use them directly
          if (!rawArtist) {
            const aiParsed = await parseYouTubeTitleWithAI(rawTitle, rawArtist, requestId);
            searchTitle = aiParsed.title || rawTitle;
            searchArtist = aiParsed.artist || rawArtist;
            logger.info("Auto-searching lyrics with AI-parsed title (no artist)", { 
              original: { title: rawTitle, artist: rawArtist },
              parsed: { title: searchTitle, artist: searchArtist }
            });
          } else {
            logger.info("Auto-searching lyrics with existing metadata", { 
              title: searchTitle, artist: searchArtist
            });
          }
          
          const query = `${stripParentheses(searchTitle)} ${stripParentheses(searchArtist)}`.trim();
          const results = await searchKugou(query, searchTitle, searchArtist);
          if (results.length > 0) {
            lyricsSource = {
              hash: results[0].hash,
              albumId: results[0].albumId,
              title: results[0].title,
              artist: results[0].artist,
              album: results[0].album,
            };
          }
        }

        if (!lyricsSource) {
          return errorResponse("No lyrics source available");
        }

        logger.info("Fetching lyrics from Kugou", { source: lyricsSource });
        const kugouResult = await fetchLyricsFromKugou(lyricsSource, requestId);

        if (!kugouResult) {
          return errorResponse("Failed to fetch lyrics", 404);
        }

        // Parse lyrics with consistent filtering (single source of truth)
        // NOTE: parsedLines is generated on-demand, NOT stored in Redis
        const parsedLines = parseLyricsContent(
          { lrc: kugouResult.lyrics.lrc, krc: kugouResult.lyrics.krc },
          lyricsSource.title,
          lyricsSource.artist
        );

        // Save raw lyrics only (no parsedLines - it's derived data)
        const lyrics: LyricsContent = kugouResult.lyrics;

        // Save to song document (lyrics + cover in metadata)
        // Clear annotations (translations, furigana, soramimi) when source changed or force refresh
        const shouldClearAnnotations = force || lyricsSourceChanged;
        const savedSong = await saveLyrics(redis, songId, lyrics, lyricsSource, kugouResult.cover, shouldClearAnnotations);
        logger.info(`Lyrics saved to song document`, { 
          songId,
          hasLyricsStored: !!savedSong.lyrics,
          parsedLinesCount: parsedLines.length,
        });

        logger.info(`Response: 200 OK - Lyrics fetched`, { parsedLinesCount: parsedLines.length });
        
        // Build response with optional translation/furigana info
        const response: Record<string, unknown> = {
          lyrics: {
            lrc: lyrics.lrc,
            krc: lyrics.krc,
            parsedLines,
          },
          cached: false,
        };
        
        // Include translation info if requested
        if (translateTo) {
          const totalLines = parsedLines.length;
          let hasTranslation = false;
          let translationLrc: string | undefined;
          
          // For Chinese Traditional: use KRC source directly if available (skip AI)
          if (isChineseTraditional(translateTo) && lyrics.krc) {
            const krcDerivedLrc = buildChineseTranslationFromKrc(
              lyrics,
              lyricsSource.title,
              lyricsSource.artist
            );
            if (krcDerivedLrc) {
              hasTranslation = true;
              translationLrc = krcDerivedLrc;
              logger.info("Using KRC-derived Traditional Chinese translation for fresh lyrics (skipping AI)");
              // Save this translation for future requests
              await saveTranslation(redis, songId, translateTo, krcDerivedLrc);
            }
          }
          
          response.translation = {
            totalLines,
            cached: hasTranslation,
            ...(translationLrc ? { lrc: translationLrc } : {}),
          };
        }
        
        // Include furigana info if requested (not cached since lyrics are fresh)
        if (includeFurigana) {
          response.furigana = {
            totalLines: parsedLines.length,
            cached: false,
          };
        }
        
        // Include soramimi info if requested (not cached since lyrics are fresh)
        if (includeSoramimi) {
          // Skip Chinese soramimi for Chinese lyrics (no point making Chinese sound like Chinese)
          const shouldSkipChineseSoramimi = soramimiTargetLanguage === "zh-TW" && lyricsAreMostlyChinese(parsedLines);
          
          response.soramimi = {
            totalLines: parsedLines.length,
            cached: false,
            targetLanguage: soramimiTargetLanguage,
            ...(shouldSkipChineseSoramimi ? { skipped: true, skipReason: "chinese_lyrics" } : {}),
          };
        }
        
        // Include metadata if requested (useful for one-call song setup)
        // For fresh fetch, savedSong has the complete metadata
        if (returnMetadata) {
          response.metadata = {
            title: savedSong.title,
            artist: savedSong.artist,
            album: savedSong.album,
            cover: savedSong.cover,
            lyricsSource: savedSong.lyricsSource,
          };
        }
        
        return jsonResponse(response);
      }

      // =======================================================================
      // Handle translate action - non-streaming translation response
      // Returns full LRC translation in JSON
      // =======================================================================
      if (action === "translate") {
        const language =
          typeof bodyObj?.language === "string" ? (bodyObj.language as string).trim() : "";
        const force = bodyObj?.force === true;

        if (!language) {
          return errorResponse("Invalid request body", 400);
        }

        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeTranslations: [language],
        });

        if (!song) {
          return errorResponse("Song not found", 404);
        }

        if (!song.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Permission check: force refresh requires auth when translation already exists
        if (force && song.translations?.[language]) {
          if (!username || !authToken) {
            return errorResponse("Unauthorized - authentication required to force refresh translation", 401);
          }
          const authResult = await validateAuth(redis, username, authToken);
          if (!authResult.valid) {
            return errorResponse("Unauthorized - invalid credentials", 401);
          }
          const permission = canModifySong(song, username);
          if (!permission.canModify) {
            return errorResponse(permission.reason || "Only the song owner can force refresh", 403);
          }
        }

        // Generate parsedLines on-demand (not stored in Redis)
        const parsedLines = parseLyricsContent(
          { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
          song.lyricsSource?.title || song.title,
          song.lyricsSource?.artist || song.artist
        );

        if (parsedLines.length === 0) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Return cached translation when available (and not forcing)
        if (!force && song.translations?.[language]) {
          return jsonResponse({
            translation: song.translations[language],
            cached: true,
          });
        }

        // For Chinese Traditional: use KRC source directly if available (skip AI)
        if (isChineseTraditional(language) && song.lyrics.krc) {
          const krcDerivedLrc = buildChineseTranslationFromKrc(
            song.lyrics,
            song.lyricsSource?.title || song.title,
            song.lyricsSource?.artist || song.artist
          );
          if (krcDerivedLrc) {
            await saveTranslation(redis, songId, language, krcDerivedLrc);
            logger.info("Using KRC-derived Traditional Chinese translation (non-stream)");
            return jsonResponse({
              translation: krcDerivedLrc,
              cached: false,
            });
          }
        }

        const { translations, success } = await streamTranslation(
          parsedLines,
          language,
          requestId,
          () => {}
        );

        if (!success) {
          return errorResponse("Failed to translate lyrics", 404);
        }

        const translatedLrc = parsedLines
          .map(
            (line, index) =>
              `${msToLrcTime(line.startTimeMs)}${translations[index] || line.words}`
          )
          .join("\n");

        await saveTranslation(redis, songId, language, translatedLrc);

        return jsonResponse({
          translation: translatedLrc,
          cached: false,
        });
      }

      // =======================================================================
      // Handle translate-stream action - SSE streaming with line-by-line updates
      // Uses streamText for real-time line emission as AI generates each line
      // - First time translation: anyone can do it
      // - Force refresh: requires auth + canModifySong
      // =======================================================================
      if (action === "translate-stream") {
        const rlKey = RateLimit.makeKey(["rl", "song", "translate-stream", "user", rateLimitUser]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.translateStream.windowSeconds,
          limit: RATE_LIMITS.translateStream.limit,
        });

        if (!rlResult.allowed) {
          logger.warn("Rate limit exceeded (translate-stream)", { user: rateLimitUser });
          return jsonResponse(
            {
              error: "rate_limit_exceeded",
              limit: rlResult.limit,
              retryAfter: rlResult.resetSeconds,
            },
            429,
            { "Retry-After": String(rlResult.resetSeconds) }
          );
        }

        const parsed = TranslateStreamSchema.safeParse(bodyObj);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { language, force } = parsed.data;

        // Get song with lyrics and existing translation
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeTranslations: [language],
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Permission check: force refresh requires auth when translation already exists
        if (force && song.translations?.[language]) {
          if (!username || !authToken) {
            return errorResponse("Unauthorized - authentication required to force refresh translation", 401);
          }
          const authResult = await validateAuth(redis, username, authToken);
          if (!authResult.valid) {
            return errorResponse("Unauthorized - invalid credentials", 401);
          }
          const permission = canModifySong(song, username);
          if (!permission.canModify) {
            return errorResponse(permission.reason || "Only the song owner can force refresh", 403);
          }
        }

        // Generate parsedLines on-demand (not stored in Redis)
        // Use lyricsSource title/artist for filtering (consistent with cached lyrics)
        const parsedLines = parseLyricsContent(
          { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
          song.lyricsSource?.title || song.title,
          song.lyricsSource?.artist || song.artist
        );

        // Check if already cached in main document (and not forcing regeneration)
        if (!force && song.translations?.[language]) {
          logger.info("Returning cached translation via SSE");
          sendSSEResponse(res, effectiveOrigin, {
            type: "cached",
            translation: song.translations![language],
          });
          return;
        }

        // For Chinese Traditional: use KRC source directly if available (skip AI)
        if (isChineseTraditional(language) && song.lyrics?.krc) {
          const krcDerivedLrc = buildChineseTranslationFromKrc(
            song.lyrics,
            song.lyricsSource?.title || song.title,
            song.lyricsSource?.artist || song.artist
          );
          if (krcDerivedLrc) {
            await saveTranslation(redis, songId, language, krcDerivedLrc);
            logger.info("Using KRC-derived Traditional Chinese translation (skipping AI)");
            sendSSEResponse(res, effectiveOrigin, {
              type: "cached",
              translation: krcDerivedLrc,
            });
            return;
          }
        }

        const totalLines = parsedLines.length;

        logger.info(`Starting translate SSE stream`, { totalLines, language });

        // Prepare lines for translation
        const lines: LyricLine[] = parsedLines.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
        }));

        // Build numbered text input for AI
        const textsToProcess = lines.map((line, i) => `${i + 1}: ${line.words}`).join("\n");

        // Use native SSE streaming for custom events (AI SDK's UIMessageStream expects specific types)
        // Set up SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.setHeader("Access-Control-Allow-Origin", effectiveOrigin!);

        const allTranslations: string[] = new Array(totalLines).fill("");
        let completedLines = 0;
        let currentLineBuffer = "";

        // Helper to send SSE event (type must be in JSON payload for client compatibility)
        const sendEvent = (eventType: string, data: Record<string, unknown>) => {
          res.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
        };

        try {
          // Send start event immediately
          sendEvent("start", { totalLines, message: "Translation started" });

          // Helper to process a complete line from AI output
          const processLine = (line: string) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;
            
            // Parse line number format: "1: translation text"
            const match = trimmedLine.match(/^(\d+)[:.\s]\s*(.*)$/);
            if (match) {
              const lineIndex = parseInt(match[1], 10) - 1; // 1-based to 0-based
              const translation = match[2].trim();
              
              if (lineIndex >= 0 && lineIndex < totalLines && translation) {
                allTranslations[lineIndex] = translation;
                completedLines++;
                
                sendEvent("line", { 
                  lineIndex, 
                  translation, 
                  progress: Math.round((completedLines / totalLines) * 100) 
                });
              }
            }
          };

          // Use streamText with GPT-5.2
          const result = streamText({
            model: openai("gpt-5.2"),
            messages: [
              { role: "system", content: getTranslationSystemPrompt(language) },
              { role: "user", content: textsToProcess },
            ],
            temperature: 0.3,
          });

          // Manually iterate textStream to process and emit custom events
          for await (const textChunk of result.textStream) {
            currentLineBuffer += textChunk;
            
            // Process complete lines
            let newlineIdx;
            while ((newlineIdx = currentLineBuffer.indexOf("\n")) !== -1) {
              const completeLine = currentLineBuffer.slice(0, newlineIdx);
              currentLineBuffer = currentLineBuffer.slice(newlineIdx + 1);
              processLine(completeLine);
            }
          }
          
          // Process any remaining buffer
          if (currentLineBuffer.trim()) {
            processLine(currentLineBuffer);
          }

          // Fill in any missing translations with original text
          for (let i = 0; i < totalLines; i++) {
            if (!allTranslations[i]) {
              allTranslations[i] = lines[i].words;
            }
          }

          // Save to Redis
          try {
            const translatedLrc = parsedLines
              .map((line, index) => `${msToLrcTime(line.startTimeMs)}${allTranslations[index] || line.words}`)
              .join("\n");
            await saveTranslation(redis, songId, language, translatedLrc);
            logger.info(`Translation saved to Redis`);
          } catch (err) {
            logger.error("Failed to save translation", err);
          }

          // Send complete event
          sendEvent("complete", { 
            totalLines, 
            successCount: completedLines, 
            translations: allTranslations, 
            success: true 
          });
          res.end();
        } catch (err) {
          logger.error("Translation stream error", err);
          sendEvent("error", { 
            error: err instanceof Error ? err.message : "Translation failed" 
          });
          res.end();
        }
        return;
      }

      // =======================================================================
      // Handle furigana-stream action - SSE streaming with line-by-line updates
      // =======================================================================
      if (action === "furigana-stream") {
        const rlKey = RateLimit.makeKey(["rl", "song", "furigana-stream", "user", rateLimitUser]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.furiganaStream.windowSeconds,
          limit: RATE_LIMITS.furiganaStream.limit,
        });

        if (!rlResult.allowed) {
          logger.warn("Rate limit exceeded (furigana-stream)", { user: rateLimitUser });
          return jsonResponse(
            {
              error: "rate_limit_exceeded",
              limit: rlResult.limit,
              retryAfter: rlResult.resetSeconds,
            },
            429,
            { "Retry-After": String(rlResult.resetSeconds) }
          );
        }

        const parsed = FuriganaStreamSchema.safeParse(bodyObj);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { force } = parsed.data;

        // Get song with lyrics and existing furigana
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeFurigana: true,
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Permission check: force refresh requires auth when furigana already exists
        if (force && song.furigana && song.furigana.length > 0) {
          if (!username || !authToken) {
            return errorResponse("Unauthorized - authentication required to force refresh furigana", 401);
          }
          const authResult = await validateAuth(redis, username, authToken);
          if (!authResult.valid) {
            return errorResponse("Unauthorized - invalid credentials", 401);
          }
          const permission = canModifySong(song, username);
          if (!permission.canModify) {
            return errorResponse(permission.reason || "Only the song owner can force refresh", 403);
          }
        }

        // Generate parsedLines on-demand (not stored in Redis)
        const parsedLinesFurigana = parseLyricsContent(
          { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
          song.lyricsSource?.title || song.title,
          song.lyricsSource?.artist || song.artist
        );

        // Check if already cached in main document
        if (!force && song.furigana && song.furigana.length > 0) {
          logger.info("Returning cached furigana via SSE");
          sendSSEResponse(res, effectiveOrigin, {
            type: "cached",
            furigana: song.furigana,
          });
          return;
        }

        const totalLines = parsedLinesFurigana.length;

        logger.info(`Starting furigana SSE stream`, { totalLines });

        // Prepare lines for furigana
        const lines: LyricLine[] = parsedLinesFurigana.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
        }));

        // Build index mapping: track which lines need furigana (contain kanji)
        const lineInfo = lines.map((line, originalIndex) => ({
          line,
          originalIndex,
          needsFurigana: containsKanji(line.words),
        }));
        const linesNeedingFurigana = lineInfo.filter((info) => info.needsFurigana);

        // Build numbered text input for AI (only kanji lines)
        const textsToProcess = linesNeedingFurigana.map((info, i) => `${i + 1}: ${info.line.words}`).join("\n");

        // Use native SSE streaming for custom events
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.setHeader("Access-Control-Allow-Origin", effectiveOrigin!);

        const allFurigana: Array<Array<{ text: string; reading?: string }>> = 
          new Array(totalLines).fill(null).map((_, i) => [{ text: lines[i].words }]);
        let completedLines = 0;
        let currentLineBuffer = "";

        // Helper to send SSE event (type must be in JSON payload for client compatibility)
        const sendEvent = (eventType: string, data: Record<string, unknown>) => {
          res.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
        };

        try {
          // Send start event immediately
          sendEvent("start", { totalLines, message: "Furigana generation started" });

          // Emit non-kanji lines immediately (they don't need furigana)
          for (const info of lineInfo) {
            if (!info.needsFurigana) {
              completedLines++;
              sendEvent("line", { 
                lineIndex: info.originalIndex, 
                furigana: [{ text: info.line.words }], 
                progress: Math.round((completedLines / totalLines) * 100) 
              });
            }
          }

          // If no kanji lines, we're done
          if (linesNeedingFurigana.length === 0) {
            logger.info(`No kanji lines, skipping furigana AI generation`);
            sendEvent("complete", { 
              totalLines, 
              successCount: completedLines, 
              furigana: allFurigana, 
              success: true 
            });
            res.end();
            return;
          }

          // Helper to process a complete line from AI output
          const processLine = (line: string) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;
            
            // Parse line number format: "1: {annotated|text}"
            const match = trimmedLine.match(/^(\d+)[:.\s]\s*(.*)$/);
            if (match) {
              const kanjiLineIndex = parseInt(match[1], 10) - 1; // 1-based to 0-based in kanji lines
              const content = match[2].trim();
              
              if (kanjiLineIndex >= 0 && kanjiLineIndex < linesNeedingFurigana.length && content) {
                const originalIndex = linesNeedingFurigana[kanjiLineIndex].originalIndex;
                const segments = parseRubyMarkup(content);
                allFurigana[originalIndex] = segments;
                completedLines++;
                
                sendEvent("line", { 
                  lineIndex: originalIndex, 
                  furigana: segments, 
                  progress: Math.round((completedLines / totalLines) * 100) 
                });
              }
            }
          };

          // Use streamText with GPT-5.2 for furigana (using numbered prompt format)
          const furiganaSystemPrompt = `Add furigana to kanji using ruby markup format: <text:reading>

Format: <漢字:ふりがな> - text first, then reading after colon
- Plain text without reading stays as-is
- Separate okurigana: <走:はし>る (NOT <走る:はしる>)

Output format: Number each line like "1: annotated line", "2: annotated line", etc.

Example:
Input:
1: 夜空の星
2: 私は走る

Output:
1: <夜空:よぞら>の<星:ほし>
2: <私:わたし>は<走:はし>る`;

          const result = streamText({
            model: openai("gpt-5.2"),
            messages: [
              { role: "system", content: furiganaSystemPrompt },
              { role: "user", content: textsToProcess },
            ],
            temperature: 0.1,
          });

          // Manually iterate textStream to process and emit custom events
          for await (const textChunk of result.textStream) {
            currentLineBuffer += textChunk;
            
            // Process complete lines
            let newlineIdx;
            while ((newlineIdx = currentLineBuffer.indexOf("\n")) !== -1) {
              const completeLine = currentLineBuffer.slice(0, newlineIdx);
              currentLineBuffer = currentLineBuffer.slice(newlineIdx + 1);
              processLine(completeLine);
            }
          }
          
          // Process any remaining buffer
          if (currentLineBuffer.trim()) {
            processLine(currentLineBuffer);
          }

          // Save to Redis
          try {
            await saveFurigana(redis, songId, allFurigana);
            logger.info(`Furigana saved to Redis`);
          } catch (err) {
            logger.error("Failed to save furigana", err);
          }

          // Send complete event
          sendEvent("complete", { 
            totalLines, 
            successCount: completedLines, 
            furigana: allFurigana, 
            success: true 
          });
          res.end();
        } catch (err) {
          logger.error("Furigana stream error", err);
          sendEvent("error", { 
            error: err instanceof Error ? err.message : "Furigana generation failed" 
          });
          res.end();
        }
        return;
      }

      // =======================================================================
      // Handle soramimi-stream action - SSE streaming with line-by-line updates
      // =======================================================================
      if (action === "soramimi-stream") {
        const rlKey = RateLimit.makeKey(["rl", "song", "soramimi-stream", "user", rateLimitUser]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.soramimiStream.windowSeconds,
          limit: RATE_LIMITS.soramimiStream.limit,
        });

        if (!rlResult.allowed) {
          logger.warn("Rate limit exceeded (soramimi-stream)", { user: rateLimitUser });
          return jsonResponse(
            {
              error: "rate_limit_exceeded",
              limit: rlResult.limit,
              retryAfter: rlResult.resetSeconds,
            },
            429,
            { "Retry-After": String(rlResult.resetSeconds) }
          );
        }

        const parsed = SoramimiStreamSchema.safeParse(bodyObj);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { force, furigana: clientFurigana, targetLanguage = "zh-TW" } = parsed.data;

        // Get song with lyrics and existing soramimi
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeSoramimi: true,
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Permission check: force refresh requires auth when soramimi already exists
        const existingSoramimi = song.soramimiByLang?.[targetLanguage]
          ?? (targetLanguage === "zh-TW" ? song.soramimi : undefined);
        if (force && existingSoramimi && existingSoramimi.length > 0) {
          if (!username || !authToken) {
            return errorResponse("Unauthorized - authentication required to force refresh soramimi", 401);
          }
          const authResult = await validateAuth(redis, username, authToken);
          if (!authResult.valid) {
            return errorResponse("Unauthorized - invalid credentials", 401);
          }
          const permission = canModifySong(song, username);
          if (!permission.canModify) {
            return errorResponse(permission.reason || "Only the song owner can force refresh", 403);
          }
        }

        // Generate parsedLines on-demand (not stored in Redis)
        const parsedLinesSoramimi = parseLyricsContent(
          { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
          song.lyricsSource?.title || song.title,
          song.lyricsSource?.artist || song.artist
        );

        // Skip Chinese soramimi for Chinese lyrics
        if (targetLanguage === "zh-TW" && lyricsAreMostlyChinese(parsedLinesSoramimi)) {
          logger.info("Skipping Chinese soramimi stream - lyrics are already Chinese");
          return jsonResponse({
            skipped: true,
            skipReason: "chinese_lyrics",
          });
        }

        // Check if already cached in main document (and not forcing regeneration)
        const cachedSoramimi = song.soramimiByLang?.[targetLanguage] 
          ?? (targetLanguage === "zh-TW" ? song.soramimi : undefined);
        
        if (!force && cachedSoramimi && cachedSoramimi.length > 0) {
          logger.info(`Returning cached ${targetLanguage} soramimi via SSE`);
          
          // Helper to check if text contains Korean or Japanese (for cleaning old cached data)
          const containsKoreanOrJapanese = (text: string): boolean => {
            return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u309F\u30A0-\u30FF]/.test(text);
          };
          
          // Clean cached data
          const cleanedSoramimi = cachedSoramimi.map(lineSegments => 
            lineSegments
              .map(seg => {
                if (seg.reading && targetLanguage === "zh-TW") {
                  const cleanedReading = cleanSoramimiReading(seg.reading);
                  return cleanedReading ? { ...seg, reading: cleanedReading } : { text: seg.text };
                }
                return seg;
              })
              .filter(seg => {
                if (seg.reading) return true;
                return !containsKoreanOrJapanese(seg.text);
              })
          );
          
          sendSSEResponse(res, effectiveOrigin, {
            type: "cached",
            soramimi: cleanedSoramimi,
          });
          return;
        }

        const totalLines = parsedLinesSoramimi.length;

        // Check if furigana was provided by client (for Japanese songs)
        const hasFuriganaData = clientFurigana && clientFurigana.length > 0 && 
          clientFurigana.some(line => line.some(seg => seg.reading));

        logger.info(`Starting soramimi SSE stream`, { totalLines, hasFurigana: hasFuriganaData, targetLanguage });

        // Prepare lines for soramimi
        const lines: LyricLine[] = parsedLinesSoramimi.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
          wordTimings: line.wordTimings,
        }));

        // Build the text prompt for soramimi
        const nonEnglishLines: { line: LyricLine; originalIndex: number }[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const text = line.words.trim();
          if (!text) continue;
          const isEnglish = /^[a-zA-Z0-9\s.,!?'"()\-:;]+$/.test(text);
          if (!isEnglish) {
            nonEnglishLines.push({ line, originalIndex: i });
          }
        }
        
        // Build prompt text - if furigana is available, use annotated text format
        let textsToProcess: string;
        let systemPrompt: string;
        
        // Select prompt based on target language (Chinese vs English soramimi)
        const isEnglishOutput = targetLanguage === "en";
        
        if (hasFuriganaData) {
          const annotatedLines = convertLinesToAnnotatedText(lines, clientFurigana);
          textsToProcess = nonEnglishLines.map((info, idx) => {
            return `${idx + 1}: ${annotatedLines[info.originalIndex]}`;
          }).join("\n");
          systemPrompt = isEnglishOutput 
            ? SORAMIMI_ENGLISH_WITH_FURIGANA_PROMPT 
            : SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT;
          logger.info(`Using ${isEnglishOutput ? 'English' : 'Chinese'} prompt with furigana annotations`);
        } else {
          textsToProcess = nonEnglishLines.map((info, idx) => {
            const wordTimings = info.line.wordTimings;
            if (wordTimings && wordTimings.length > 0) {
              const wordsMarked = wordTimings.map(w => w.text).join('|');
              return `${idx + 1}: ${wordsMarked}`;
            }
            return `${idx + 1}: ${info.line.words}`;
          }).join("\n");
          systemPrompt = isEnglishOutput 
            ? SORAMIMI_ENGLISH_SYSTEM_PROMPT 
            : SORAMIMI_SYSTEM_PROMPT;
        }

        // Use native SSE streaming for custom events
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.setHeader("Access-Control-Allow-Origin", effectiveOrigin!);

        const allSoramimi: Array<Array<{ text: string; reading?: string }>> =
          new Array(totalLines).fill(null).map(() => []);
        let completedLines = 0;
        let currentLineBuffer = "";

        // Helper to send SSE event (type must be in JSON payload for client compatibility)
        const sendEvent = (eventType: string, data: Record<string, unknown>) => {
          res.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
        };

        try {
          // Send start event immediately
          sendEvent("start", { totalLines, message: "AI processing started" });

          // Emit soramimi for English lines immediately (they stay as-is)
          for (let i = 0; i < lines.length; i++) {
            const text = lines[i].words.trim();
            if (!text) {
              allSoramimi[i] = [{ text: "" }];
              continue;
            }
            const isEnglish = /^[a-zA-Z0-9\s.,!?'"()\-:;]+$/.test(text);
            if (isEnglish) {
              allSoramimi[i] = [{ text }];
              completedLines++;
              sendEvent("line", { 
                lineIndex: i, 
                soramimi: [{ text }], 
                progress: Math.round((completedLines / totalLines) * 100) 
              });
            }
          }

          // Helper to process a complete line from AI output
          const processLine = (line: string) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;
            
            const match = trimmedLine.match(/^(\d+)[:.\s]\s*(.*)$/);
            if (match) {
              const nonEnglishLineIndex = parseInt(match[1], 10) - 1;
              const content = match[2].trim();
              
              if (nonEnglishLineIndex >= 0 && nonEnglishLineIndex < nonEnglishLines.length && content) {
                const info = nonEnglishLines[nonEnglishLineIndex];
                const originalIndex = info.originalIndex;
                
                const rawSegments = parseSoramimiRubyMarkup(content);
                const segments = fillMissingReadings(rawSegments);
                
                if (segments.length > 0) {
                  allSoramimi[originalIndex] = segments;
                  completedLines++;
                  
                  sendEvent("line", { 
                    lineIndex: originalIndex, 
                    soramimi: segments, 
                    progress: Math.round((completedLines / totalLines) * 100) 
                  });
                }
              }
            }
          };

          // Use streamText
          const result = streamText({
            model: openai("gpt-5.2"),
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: textsToProcess },
            ],
            temperature: 0.7,
          });

          // Manually iterate textStream to process and emit custom events
          for await (const textChunk of result.textStream) {
            currentLineBuffer += textChunk;
            
            // Process complete lines
            let newlineIdx;
            while ((newlineIdx = currentLineBuffer.indexOf("\n")) !== -1) {
              const completeLine = currentLineBuffer.slice(0, newlineIdx);
              currentLineBuffer = currentLineBuffer.slice(newlineIdx + 1);
              processLine(completeLine);
            }
          }
          
          // Process any remaining buffer
          if (currentLineBuffer.trim()) {
            processLine(currentLineBuffer);
          }

          // Save to Redis with language
          try {
            await saveSoramimi(redis, songId, allSoramimi, targetLanguage);
            logger.info(`${targetLanguage} soramimi saved to Redis`);
          } catch (err) {
            logger.error("Failed to save soramimi", err);
          }

          // Send complete event
          sendEvent("complete", { 
            totalLines, 
            successCount: completedLines, 
            soramimi: allSoramimi, 
            success: true 
          });
          res.end();
        } catch (err) {
          logger.error("Soramimi stream error", err);
          sendEvent("error", { 
            error: err instanceof Error ? err.message : "Soramimi generation failed" 
          });
          res.end();
        }
        return;
      }

      // =======================================================================
      // Handle clear-cached-data action - clears translations and/or furigana
      // =======================================================================
      if (action === "clear-cached-data") {
        const parsed = ClearCachedDataSchema.safeParse(bodyObj);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { clearTranslations: shouldClearTranslations, clearFurigana: shouldClearFurigana, clearSoramimi: shouldClearSoramimi } = parsed.data;

        // Get song to check what needs clearing
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeTranslations: true,
          includeFurigana: true,
          includeSoramimi: true,
        });

        if (!song) {
          return errorResponse("Song not found", 404);
        }

        const cleared: string[] = [];

        // Clear translations if requested
        if (shouldClearTranslations) {
          if (song.translations && Object.keys(song.translations).length > 0) {
            await saveSong(redis, { id: songId, translations: {} }, { preserveTranslations: false });
          }
          cleared.push("translations");
        }

        // Clear furigana if requested
        if (shouldClearFurigana) {
          if (song.furigana && song.furigana.length > 0) {
            await saveSong(redis, { id: songId, furigana: [] }, { preserveFurigana: false });
          }
          cleared.push("furigana");
        }

        // Clear soramimi if requested (both legacy soramimi and soramimiByLang)
        if (shouldClearSoramimi) {
          const hasSoramimi = (song.soramimi && song.soramimi.length > 0) || 
                              (song.soramimiByLang && Object.keys(song.soramimiByLang).length > 0);
          if (hasSoramimi) {
            await saveSong(redis, { id: songId, soramimi: [], soramimiByLang: {} }, { preserveSoramimi: false });
          }
          cleared.push("soramimi");
        }

        logger.info(`Cleared cached data: ${cleared.length > 0 ? cleared.join(", ") : "nothing to clear"}`);
        return jsonResponse({ success: true, cleared });
      }

      // =======================================================================
      // Handle unshare action - clears the createdBy field (admin only)
      // =======================================================================
      if (action === "unshare") {
        const parsed = UnshareSongSchema.safeParse(bodyObj);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        // Validate auth
        const authResult = await validateAuth(redis, username, authToken);
        if (!authResult.valid) {
          return errorResponse("Unauthorized - authentication required", 401);
        }

        // Only admin can unshare
        if (username?.toLowerCase() !== "ryo") {
          return errorResponse("Forbidden - admin access required", 403);
        }

        // Get existing song
        const existingSong = await getSong(redis, songId, { includeMetadata: true });
        if (!existingSong) {
          return errorResponse("Song not found", 404);
        }

        // Clear createdBy by explicitly setting to undefined
        const updatedSong = await saveSong(
          redis,
          {
            ...existingSong,
            createdBy: undefined,
          },
          { preserveLyrics: true, preserveTranslations: true, preserveFurigana: true },
          existingSong
        );

        logger.info("Song unshared (createdBy cleared)", { duration: `${Date.now() - startTime}ms` });
        return jsonResponse({
          success: true,
          id: updatedSong.id,
          createdBy: updatedSong.createdBy,
        });
      }

      // Default POST: Update song metadata (requires auth)
      const authResult = await validateAuth(redis, username, authToken);
      if (!authResult.valid) {
        return errorResponse("Unauthorized - authentication required", 401);
      }

      const parsed = UpdateSongSchema.safeParse(bodyObj);
      if (!parsed.success) {
        return errorResponse("Invalid request body");
      }

      // Check permission
      const existingSong = await getSong(redis, songId, { includeMetadata: true });
      const permission = canModifySong(existingSong, username);
      if (!permission.canModify) {
        return errorResponse(permission.reason || "Permission denied", 403);
      }

      // Update song
      const isUpdate = !!existingSong;
      const { lyricsSource, clearTranslations, clearFurigana, clearSoramimi, clearLyrics, isShare, ...restData } = parsed.data;
      
      // Determine what to preserve vs clear
      const preserveOptions = {
        preserveLyrics: !clearLyrics,
        preserveTranslations: !clearTranslations,
        preserveFurigana: !clearFurigana,
        preserveSoramimi: !clearSoramimi,
      };

      // Determine createdBy
      let createdBy = existingSong?.createdBy;
      if (isShare) {
        const canSetCreatedBy = username?.toLowerCase() === "ryo" || !existingSong?.createdBy;
        if (canSetCreatedBy) {
          createdBy = username || undefined;
        }
      }

      // Build update data
      const updateData: Parameters<typeof saveSong>[1] = {
        id: songId,
        ...restData,
        lyricsSource: lyricsSource as LyricsSource | undefined,
        createdBy,
      };

      // If clearing translations, furigana, soramimi, or lyrics, explicitly set them to undefined
      if (clearTranslations) {
        updateData.translations = undefined;
      }
      if (clearFurigana) {
        updateData.furigana = undefined;
      }
      if (clearSoramimi) {
        updateData.soramimi = undefined;
        updateData.soramimiByLang = undefined;
      }
      if (clearLyrics) {
        updateData.lyrics = undefined;
      }

      const updatedSong = await saveSong(redis, updateData, preserveOptions);

      logger.info(isUpdate ? "Song updated" : "Song created", { duration: `${Date.now() - startTime}ms` });
      return jsonResponse({
        success: true,
        id: updatedSong.id,
        isUpdate,
        createdBy: updatedSong.createdBy,
      });
    }

    // =========================================================================
    // DELETE: Delete song (admin only)
    // =========================================================================
    if (req.method === "DELETE") {
      const authHeader = req.headers.authorization as string | undefined;
      const usernameHeader = req.headers["x-username"] as string | undefined;
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      const authResult = await validateAuth(redis, username, authToken);
      if (!authResult.valid) {
        return errorResponse("Unauthorized - authentication required", 401);
      }

      // Only admin can delete
      if (username?.toLowerCase() !== "ryo") {
        return errorResponse("Forbidden - admin access required", 403);
      }

      const deleted = await deleteSong(redis, songId);
      if (!deleted) {
        return errorResponse("Song not found", 404);
      }

      logger.info("Song deleted", { duration: `${Date.now() - startTime}ms` });
      return jsonResponse({ success: true, deleted: true });
    }

    logger.warn("Method not allowed", { method: req.method });
    return errorResponse("Method not allowed", 405);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    logger.error("Song API error", error);
    return errorResponse(errorMessage, 500);
  }
}
