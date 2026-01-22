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

import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  getClientIp,
} from "../_utils/middleware.js";
import { validateAuth } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
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
  generateRequestId,
  logInfo,
  logError,
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

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";
import { openai } from "@ai-sdk/openai";

// Vercel Node.js Function configuration
export const runtime = "nodejs";
export const maxDuration = 120;

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

export default async function handler(req: Request) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Extract song ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const songId = pathParts[pathParts.length - 1];

  console.log(`[${requestId}] ${req.method} /api/songs/${songId}`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const effectiveOrigin = getEffectiveOrigin(req);
    const resp = preflightIfNeeded(req, ["GET", "POST", "DELETE", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  // Validate origin
  const effectiveOrigin = getEffectiveOrigin(req);

  // Helper for JSON responses (defined early for use in origin validation)
  const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": effectiveOrigin!,
        ...headers,
      },
    });

  const errorResponse = (message: string, status = 400) => {
    logInfo(requestId, `Response: ${status} - ${message}`);
    return jsonResponse({ error: message }, status);
  };

  if (!isAllowedOrigin(effectiveOrigin)) {
    return errorResponse("Unauthorized", 403);
  }

  // Create Redis client
  const redis = createRedis();

  if (!songId || songId === "[id]") {
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

      const includeParam = url.searchParams.get("include") || "metadata";
      const includes = includeParam.split(",").map((s) => s.trim());

      logInfo(requestId, "GET song", { songId, includes });

      // Fetch song with requested includes
      const song = await getSong(redis, songId, {
        includeMetadata: includes.includes("metadata"),
        includeLyrics: includes.includes("lyrics"),
        includeTranslations: includes.includes("translations"),
        includeFurigana: includes.includes("furigana"),
        includeSoramimi: includes.includes("soramimi"),
      });

      if (!song) {
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

      logInfo(requestId, `Response: 200 OK`, { 
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
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch (parseError) {
        logError(requestId, "Failed to parse request body", parseError);
        return errorResponse("Invalid JSON body", 400);
      }
      const action = body.action;
      logInfo(requestId, `POST action=${action || "update-metadata"}`, {
        hasLyricsSource: !!body.lyricsSource,
        language: body.language,
        force: body.force,
        query: body.query,
      });

      // Extract auth credentials
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");
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

        const parsed = SearchLyricsSchema.safeParse(body);
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
            logInfo(requestId, "AI-parsed search query (no artist)", { original: rawTitle, parsed: { title: searchTitle, artist: searchArtist } });
          }
          query = `${stripParentheses(searchTitle)} ${stripParentheses(searchArtist)}`.trim();
        } else if (!query) {
          query = `${stripParentheses(rawTitle)} ${stripParentheses(rawArtist)}`.trim();
        }

        if (!query) {
          return errorResponse("Search query is required");
        }

        logInfo(requestId, "Searching lyrics", { query });
        const results = await searchKugou(query, searchTitle, searchArtist);
        logInfo(requestId, `Response: 200 OK - Found ${results.length} results`);
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

        const parsed = FetchLyricsSchema.safeParse(body);
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
          logInfo(requestId, "Lyrics source changed, will re-fetch and clear cached annotations", {
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
                  logInfo(requestId, "Fetched missing cover in background");
                }
              })
              .catch((err) => {
                logInfo(requestId, "Failed to fetch missing cover", err);
              });
          }
          
          logInfo(requestId, `Response: 200 OK - Returning cached lyrics`, {
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
                logInfo(requestId, "Using KRC-derived Traditional Chinese translation (skipping AI)");
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
            logInfo(requestId, "Auto-searching lyrics with AI-parsed title (no artist)", { 
              original: { title: rawTitle, artist: rawArtist },
              parsed: { title: searchTitle, artist: searchArtist }
            });
          } else {
            logInfo(requestId, "Auto-searching lyrics with existing metadata", { 
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

        logInfo(requestId, "Fetching lyrics from Kugou", { source: lyricsSource });
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
        logInfo(requestId, `Lyrics saved to song document`, { 
          songId,
          hasLyricsStored: !!savedSong.lyrics,
          parsedLinesCount: parsedLines.length,
        });

        logInfo(requestId, `Response: 200 OK - Lyrics fetched`, { parsedLinesCount: parsedLines.length });
        
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
              logInfo(requestId, "Using KRC-derived Traditional Chinese translation for fresh lyrics (skipping AI)");
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
          typeof body.language === "string" ? body.language.trim() : "";
        const force = body.force === true;

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
            logInfo(requestId, "Using KRC-derived Traditional Chinese translation (non-stream)");
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

        const parsed = TranslateStreamSchema.safeParse(body);
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
          logInfo(requestId, "Returning cached translation via SSE");
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "cached",
                translation: song.translations![language],
              })}\n\n`));
              controller.close();
            },
          });
          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
              "X-Accel-Buffering": "no",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          });
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
            logInfo(requestId, "Using KRC-derived Traditional Chinese translation (skipping AI)");
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: "cached",
                  translation: krcDerivedLrc,
                })}\n\n`));
                controller.close();
              },
            });
            return new Response(stream, {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Access-Control-Allow-Origin": effectiveOrigin!,
              },
            });
          }
        }

        const totalLines = parsedLines.length;

        logInfo(requestId, `Starting translate SSE stream`, { totalLines, language });

        // Prepare lines for translation
        const lines: LyricLine[] = parsedLines.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
        }));

        // Build numbered text input for AI
        const textsToProcess = lines.map((line, i) => `${i + 1}: ${line.words}`).join("\n");

        // Use AI SDK's createUIMessageStream for proper streaming
        const allTranslations: string[] = new Array(totalLines).fill("");
        let completedLines = 0;
        let currentLineBuffer = "";

        const uiStream = createUIMessageStream({
          execute: async ({ writer }) => {
            // Send start event immediately
            writer.write({
              type: "data-start" as const,
              data: { totalLines, message: "Translation started" },
            });

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
                  
                  writer.write({
                    type: "data-line" as const,
                    data: { lineIndex, translation, progress: Math.round((completedLines / totalLines) * 100) },
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
              logInfo(requestId, `Translation saved to Redis`);
            } catch (err) {
              logError(requestId, "Failed to save translation", err);
            }

            // Send complete event
            writer.write({
              type: "data-complete" as const,
              data: { totalLines, successCount: completedLines, translations: allTranslations, success: true },
            });
          },
        });

        // Use createUIMessageStreamResponse for proper streaming
        const response = createUIMessageStreamResponse({ stream: uiStream });
        
        // Add CORS header
        const headers = new Headers(response.headers);
        headers.set("Access-Control-Allow-Origin", effectiveOrigin!);
        
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }

      // =======================================================================
      // Handle furigana-stream action - SSE streaming with line-by-line updates
      // Uses streamText for real-time line emission as AI generates each line
      // - First time furigana: anyone can do it
      // - Force refresh: requires auth + canModifySong
      // =======================================================================
      if (action === "furigana-stream") {
        const rlKey = RateLimit.makeKey(["rl", "song", "furigana-stream", "user", rateLimitUser]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.furiganaStream.windowSeconds,
          limit: RATE_LIMITS.furiganaStream.limit,
        });

        if (!rlResult.allowed) {
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

        const parsed = FuriganaStreamSchema.safeParse(body);
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
        // Use lyricsSource title/artist for filtering (consistent with cached lyrics)
        const parsedLinesFurigana = parseLyricsContent(
          { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
          song.lyricsSource?.title || song.title,
          song.lyricsSource?.artist || song.artist
        );

        // Check if already cached in main document
        if (!force && song.furigana && song.furigana.length > 0) {
          logInfo(requestId, "Returning cached furigana via SSE");
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "cached",
                furigana: song.furigana,
              })}\n\n`));
              controller.close();
            },
          });
          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
              "X-Accel-Buffering": "no",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          });
        }

        const totalLines = parsedLinesFurigana.length;

        logInfo(requestId, `Starting furigana SSE stream using createUIMessageStream`, { 
          totalLines,
        });

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

        // Use AI SDK's createUIMessageStream for proper streaming
        const allFurigana: Array<Array<{ text: string; reading?: string }>> = 
          new Array(totalLines).fill(null).map((_, i) => [{ text: lines[i].words }]);
        let completedLines = 0;
        let currentLineBuffer = "";

        const uiStream = createUIMessageStream({
          execute: async ({ writer }) => {
            // Send start event immediately
            writer.write({
              type: "data-start" as const,
              data: { totalLines, message: "Furigana generation started" },
            });

            // Emit non-kanji lines immediately (they don't need furigana)
            for (const info of lineInfo) {
              if (!info.needsFurigana) {
                completedLines++;
                writer.write({
                  type: "data-line" as const,
                  data: { lineIndex: info.originalIndex, furigana: [{ text: info.line.words }], progress: Math.round((completedLines / totalLines) * 100) },
                });
              }
            }

            // If no kanji lines, we're done
            if (linesNeedingFurigana.length === 0) {
              logInfo(requestId, `No kanji lines, skipping furigana AI generation`);
              writer.write({
                type: "data-complete" as const,
                data: { totalLines, successCount: completedLines, furigana: allFurigana, success: true },
              });
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
                  
                  writer.write({
                    type: "data-line" as const,
                    data: { lineIndex: originalIndex, furigana: segments, progress: Math.round((completedLines / totalLines) * 100) },
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
              logInfo(requestId, `Furigana saved to Redis`);
            } catch (err) {
              logError(requestId, "Failed to save furigana", err);
            }

            // Send complete event
            writer.write({
              type: "data-complete" as const,
              data: { totalLines, successCount: completedLines, furigana: allFurigana, success: true },
            });
          },
        });

        // Use createUIMessageStreamResponse for proper streaming
        const response = createUIMessageStreamResponse({ stream: uiStream });
        
        // Add CORS header
        const headers = new Headers(response.headers);
        headers.set("Access-Control-Allow-Origin", effectiveOrigin!);
        
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }

      // =======================================================================
      // Handle soramimi-stream action - SSE streaming with line-by-line updates
      // Uses streamText for real-time line emission as AI generates each line
      // - First time soramimi: anyone can do it
      // - Force refresh: requires auth + canModifySong
      // =======================================================================
      if (action === "soramimi-stream") {
        const rlKey = RateLimit.makeKey(["rl", "song", "soramimi-stream", "user", rateLimitUser]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.soramimiStream.windowSeconds,
          limit: RATE_LIMITS.soramimiStream.limit,
        });

        if (!rlResult.allowed) {
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

        const parsed = SoramimiStreamSchema.safeParse(body);
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
        // Use lyricsSource title/artist for filtering (consistent with cached lyrics)
        const parsedLinesSoramimi = parseLyricsContent(
          { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
          song.lyricsSource?.title || song.title,
          song.lyricsSource?.artist || song.artist
        );

        // Skip Chinese soramimi for Chinese lyrics (no point making Chinese sound like Chinese)
        // But English soramimi should still work for Chinese lyrics
        if (targetLanguage === "zh-TW" && lyricsAreMostlyChinese(parsedLinesSoramimi)) {
          logInfo(requestId, "Skipping Chinese soramimi stream - lyrics are already Chinese");
          return jsonResponse({
            skipped: true,
            skipReason: "chinese_lyrics",
          });
        }

        // Check if already cached in main document (and not forcing regeneration)
        // First check new soramimiByLang field, then fall back to legacy soramimi field
        const cachedSoramimi = song.soramimiByLang?.[targetLanguage] 
          ?? (targetLanguage === "zh-TW" ? song.soramimi : undefined);
        
        if (!force && cachedSoramimi && cachedSoramimi.length > 0) {
          logInfo(requestId, `Returning cached ${targetLanguage} soramimi via SSE`);
          
          // Helper to check if text contains Korean or Japanese (for cleaning old cached data)
          const containsKoreanOrJapanese = (text: string): boolean => {
            return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u309F\u30A0-\u30FF]/.test(text);
          };
          
          // Clean cached data - remove segments with Korean/Japanese text but no reading
          // Also clean readings that may contain Korean/Japanese (for Chinese soramimi)
          const cleanedSoramimi = cachedSoramimi.map(lineSegments => 
            lineSegments
              .map(seg => {
                if (seg.reading && targetLanguage === "zh-TW") {
                  // Clean the reading using shared helper from _soramimi.ts (Chinese only)
                  const cleanedReading = cleanSoramimiReading(seg.reading);
                  return cleanedReading ? { ...seg, reading: cleanedReading } : { text: seg.text };
                }
                return seg;
              })
              .filter(seg => {
                // Keep segments that have a reading, OR are plain text without Korean/Japanese
                if (seg.reading) return true;
                return !containsKoreanOrJapanese(seg.text);
              })
          );
          
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "cached",
                soramimi: cleanedSoramimi,
              })}\n\n`));
              controller.close();
            },
          });
          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
              "X-Accel-Buffering": "no",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          });
        }

        const totalLines = parsedLinesSoramimi.length;

        // Check if furigana was provided by client (for Japanese songs)
        // This helps the AI know the correct pronunciation of kanji
        const hasFuriganaData = clientFurigana && clientFurigana.length > 0 && 
          clientFurigana.some(line => line.some(seg => seg.reading));

        logInfo(requestId, `Starting soramimi SSE stream using createUIMessageStream`, { 
          totalLines,
          hasFurigana: hasFuriganaData,
        });

        // Prepare lines for soramimi - identify non-English lines
        // Include wordTimings for segment alignment
        const lines: LyricLine[] = parsedLinesSoramimi.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
          wordTimings: line.wordTimings,
        }));

        // Build the text prompt for soramimi (same as in _soramimi.ts)
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
        // This includes hiragana readings after kanji so AI knows exact pronunciation
        let textsToProcess: string;
        let systemPrompt: string;
        
        // Select prompt based on target language (Chinese vs English soramimi)
        const isEnglishOutput = targetLanguage === "en";
        
        if (hasFuriganaData) {
          // Convert furigana to annotated text: 私(わたし)は走(はし)る
          const annotatedLines = convertLinesToAnnotatedText(lines, clientFurigana);
          textsToProcess = nonEnglishLines.map((info, idx) => {
            return `${idx + 1}: ${annotatedLines[info.originalIndex]}`;
          }).join("\n");
          systemPrompt = isEnglishOutput 
            ? SORAMIMI_ENGLISH_WITH_FURIGANA_PROMPT 
            : SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT;
          logInfo(requestId, `Using ${isEnglishOutput ? 'English' : 'Chinese'} prompt with furigana annotations`);
        } else {
          // No furigana - use standard prompt with word boundaries if available
          textsToProcess = nonEnglishLines.map((info, idx) => {
            const wordTimings = info.line.wordTimings;
            if (wordTimings && wordTimings.length > 0) {
              // Mark word boundaries with | so AI knows exact segments
              const wordsMarked = wordTimings.map(w => w.text).join('|');
              return `${idx + 1}: ${wordsMarked}`;
            }
            return `${idx + 1}: ${info.line.words}`;
          }).join("\n");
          systemPrompt = isEnglishOutput 
            ? SORAMIMI_ENGLISH_SYSTEM_PROMPT 
            : SORAMIMI_SYSTEM_PROMPT;
        }
        
        logInfo(requestId, `Target soramimi language: ${targetLanguage}`);

        // Use AI SDK's createUIMessageStream for proper streaming
        const allSoramimi: Array<Array<{ text: string; reading?: string }>> =
          new Array(totalLines).fill(null).map(() => []);
        let completedLines = 0;
        let currentLineBuffer = "";

        const uiStream = createUIMessageStream({
          execute: async ({ writer }) => {
            // Send start event immediately
            writer.write({
              type: "data-start" as const,
              data: { totalLines, message: "AI processing started" },
            });

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
                writer.write({
                  type: "data-line" as const,
                  data: { lineIndex: i, soramimi: [{ text }], progress: Math.round((completedLines / totalLines) * 100) },
                });
              }
            }

            // Helper to process a complete line from AI output
            // Uses shared parseRubyMarkup from _soramimi.ts
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
                  
                  // Use shared parsing from _soramimi.ts
                  // parseSoramimiRubyMarkup handles: extracting {text|reading} patterns,
                  // stripping furigana annotations from output, cleaning readings
                  const rawSegments = parseSoramimiRubyMarkup(content);
                  const segments = fillMissingReadings(rawSegments);
                  
                  
                  if (segments.length > 0) {
                    allSoramimi[originalIndex] = segments;
                    completedLines++;
                    
                    writer.write({
                      type: "data-line" as const,
                      data: { lineIndex: originalIndex, soramimi: segments, progress: Math.round((completedLines / totalLines) * 100) },
                    });
                  }
                }
              }
            };

            // Use streamText and manually iterate (don't use merge - it bypasses onChunk)
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
              logInfo(requestId, `${targetLanguage} soramimi saved to Redis`);
            } catch (err) {
              logError(requestId, "Failed to save soramimi", err);
            }

            // Send complete event
            writer.write({
              type: "data-complete" as const,
              data: { totalLines, successCount: completedLines, soramimi: allSoramimi, success: true },
            });
          },
        });

        // Use createUIMessageStreamResponse for proper streaming
        const response = createUIMessageStreamResponse({ stream: uiStream });
        
        // Add CORS header
        const headers = new Headers(response.headers);
        headers.set("Access-Control-Allow-Origin", effectiveOrigin!);
        
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }

      // =======================================================================
      // Handle clear-cached-data action - clears translations and/or furigana
      // =======================================================================
      if (action === "clear-cached-data") {
        const parsed = ClearCachedDataSchema.safeParse(body);
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

        logInfo(requestId, `Cleared cached data: ${cleared.length > 0 ? cleared.join(", ") : "nothing to clear"}`);
        return jsonResponse({ success: true, cleared });
      }

      // =======================================================================
      // Handle unshare action - clears the createdBy field (admin only)
      // =======================================================================
      if (action === "unshare") {
        const parsed = UnshareSongSchema.safeParse(body);
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

        logInfo(requestId, "Song unshared (createdBy cleared)", { duration: `${Date.now() - startTime}ms` });
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

      const parsed = UpdateSongSchema.safeParse(body);
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

      logInfo(requestId, isUpdate ? "Song updated" : "Song created", { duration: `${Date.now() - startTime}ms` });
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
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");
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

      logInfo(requestId, "Song deleted", { duration: `${Date.now() - startTime}ms` });
      return jsonResponse({ success: true, deleted: true });
    }

    return errorResponse("Method not allowed", 405);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    logError(requestId, "Song API error", error);
    return errorResponse(errorMessage, 500);
  }
}
