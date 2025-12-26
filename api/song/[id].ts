/**
 * Unified Song API Endpoint
 *
 * GET /api/song/{id} - Retrieve song data
 * POST /api/song/{id} - Update song metadata
 * DELETE /api/song/{id} - Delete song (admin only)
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

import { Redis } from "@upstash/redis";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../_utils/cors.js";
import { validateAuthToken } from "../_utils/auth-validate.js";
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
  type FuriganaSegment,
} from "../_utils/song-service.js";

// Import from split modules
import {
  CHUNK_SIZE,
  UpdateSongSchema,
  FetchLyricsSchema,
  SearchLyricsSchema,
  TranslateChunkSchema,
  FuriganaChunkSchema,
  SoramimiChunkSchema,
  GetChunkInfoSchema,
  SaveTranslationSchema,
  SaveFuriganaSchema,
  SaveSoramimiSchema,
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
  simplifiedToTraditional,
} from "./_kugou.js";

import {
  isChineseTraditional,
  parseLyricsContent,
  buildChineseTranslationFromKrc,
  translateChunk,
} from "./_lyrics.js";

import {
  lyricsAreMostlyChinese,
  generateFuriganaForChunk,
} from "./_furigana.js";

import {
  generateSoramimiForChunk,
} from "./_soramimi.js";

// Vercel Edge Function configuration
export const config = {
  runtime: "edge",
};

// Extended timeout for AI processing
export const maxDuration = 60;

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

  console.log(`[${requestId}] ${req.method} /api/song/${songId}`);

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
  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });

  if (!songId || songId === "[id]") {
    return errorResponse("Song ID is required", 400);
  }

  // Validate YouTube video ID format
  if (!isValidYouTubeVideoId(songId)) {
    return errorResponse("Invalid song ID format. Expected YouTube video ID (11 characters, alphanumeric with - and _)", 400);
  }

  try {
    // =========================================================================
    // GET: Retrieve song data
    // =========================================================================
    if (req.method === "GET") {
      const includeParam = url.searchParams.get("include") || "metadata";
      const includes = includeParam.split(",").map((s) => s.trim());

      logInfo(requestId, "GET song", { songId, includes });

      // Fetch song with requested includes
      const song = await getSong(redis, songId, {
        includeMetadata: includes.includes("metadata"),
        includeLyrics: includes.includes("lyrics"),
        includeTranslations: includes.includes("translations"),
        includeFurigana: includes.includes("furigana"),
      });

      if (!song) {
        return errorResponse("Song not found", 404);
      }

      // Ensure parsedLines exist (generate for legacy data)
      if (song.lyrics && !song.lyrics.parsedLines) {
        logInfo(requestId, "Generating parsedLines for legacy data");
        song.lyrics.parsedLines = parseLyricsContent(
          { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
          song.title,
          song.artist
        );
        // Save updated lyrics with parsedLines
        await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
      }

      logInfo(requestId, `Response: 200 OK`, { 
        hasLyrics: !!song.lyrics,
        hasTranslations: !!song.translations,
        hasFurigana: !!song.furigana,
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

      // Handle search-lyrics action (no auth required)
      if (action === "search-lyrics") {
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

      // Handle fetch-lyrics action (no auth required)
      if (action === "fetch-lyrics") {
        const parsed = FetchLyricsSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const force = parsed.data.force || false;
        let lyricsSource: LyricsSource | undefined = parsed.data.lyricsSource as LyricsSource | undefined;
        
        // Client can pass title/artist directly (useful when song not in Redis yet)
        const clientTitle = parsed.data.title;
        const clientArtist = parsed.data.artist;
        
        // Optional: include translation/furigana/soramimi info to reduce round-trips
        const translateTo = parsed.data.translateTo;
        const includeFurigana = parsed.data.includeFurigana;
        const includeSoramimi = parsed.data.includeSoramimi;

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

        // If we have cached lyrics and not forcing, return them
        if (!force && song?.lyrics?.lrc) {
          logInfo(requestId, `Response: 200 OK - Returning cached lyrics`, {
            parsedLinesCount: song.lyrics.parsedLines?.length ?? 0,
          });
          
          // Build response with optional translation/furigana info
          const response: Record<string, unknown> = {
            lyrics: { parsedLines: song.lyrics.parsedLines },
            cached: true,
          };
          
          // Include translation info if requested
          if (translateTo && song.lyrics.parsedLines) {
            const totalLines = song.lyrics.parsedLines.length;
            const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
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
              totalChunks,
              chunkSize: CHUNK_SIZE,
              cached: hasTranslation,
              ...(translationLrc ? { lrc: translationLrc } : {}),
            };
          }
          
          // Include furigana info if requested
          if (includeFurigana && song.lyrics.parsedLines) {
            const totalLines = song.lyrics.parsedLines.length;
            const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
            const hasFurigana = !!(song.furigana && song.furigana.length > 0);
            response.furigana = {
              totalLines,
              totalChunks,
              chunkSize: CHUNK_SIZE,
              cached: hasFurigana,
              ...(hasFurigana ? { data: song.furigana } : {}),
            };
          }
          
          // Include soramimi info if requested
          if (includeSoramimi && song.lyrics.parsedLines) {
            const totalLines = song.lyrics.parsedLines.length;
            const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
            const hasSoramimi = !!(song.soramimi && song.soramimi.length > 0);
            response.soramimi = {
              totalLines,
              totalChunks,
              chunkSize: CHUNK_SIZE,
              cached: hasSoramimi,
              ...(hasSoramimi ? { data: song.soramimi } : {}),
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
        const rawLyrics = await fetchLyricsFromKugou(lyricsSource, requestId);

        if (!rawLyrics) {
          return errorResponse("Failed to fetch lyrics", 404);
        }

        // Parse lyrics with consistent filtering (single source of truth)
        const parsedLines = parseLyricsContent(
          { lrc: rawLyrics.lrc, krc: rawLyrics.krc },
          lyricsSource.title,
          lyricsSource.artist
        );

        // Include parsedLines in the lyrics content
        const lyrics: LyricsContent = {
          ...rawLyrics,
          parsedLines,
        };

        // Save to song document (full lyrics with lrc/krc for internal use)
        const savedSong = await saveLyrics(redis, songId, lyrics, lyricsSource);
        logInfo(requestId, `Lyrics saved to song document`, { 
          songId,
          hasLyricsStored: !!savedSong.lyrics,
          parsedLinesCount: parsedLines.length,
        });

        logInfo(requestId, `Response: 200 OK - Lyrics fetched`, { parsedLinesCount: parsedLines.length });
        
        // Build response with optional translation/furigana chunk info
        const response: Record<string, unknown> = {
          lyrics: { parsedLines },
          cached: false,
        };
        
        // Include translation chunk info if requested
        if (translateTo) {
          const totalLines = parsedLines.length;
          const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
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
            totalChunks,
            chunkSize: CHUNK_SIZE,
            cached: hasTranslation,
            ...(translationLrc ? { lrc: translationLrc } : {}),
          };
        }
        
        // Include furigana chunk info if requested (not cached since lyrics are fresh)
        if (includeFurigana) {
          const totalLines = parsedLines.length;
          const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
          response.furigana = {
            totalLines,
            totalChunks,
            chunkSize: CHUNK_SIZE,
            cached: false,
          };
        }
        
        // Include soramimi chunk info if requested (not cached since lyrics are fresh)
        if (includeSoramimi) {
          const totalLines = parsedLines.length;
          const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
          response.soramimi = {
            totalLines,
            totalChunks,
            chunkSize: CHUNK_SIZE,
            cached: false,
          };
        }
        
        return jsonResponse(response);
      }

      // =======================================================================
      // Handle get-chunk-info action - returns chunk metadata for client
      // =======================================================================
      if (action === "get-chunk-info") {
        const parsed = GetChunkInfoSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { operation, language, force } = parsed.data;

        // Get song with lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeTranslations: language ? [language] : undefined,
          includeFurigana: operation === "furigana",
          includeSoramimi: operation === "soramimi",
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Ensure parsedLines exist
        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          song.lyrics.parsedLines = parseLyricsContent(
            { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
            song.title,
            song.artist
          );
          await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
        }

        const totalLines = song.lyrics.parsedLines.length;
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);

        // For soramimi: skip if lyrics are mostly Chinese (空耳 doesn't make sense for Chinese lyrics)
        if (operation === "soramimi" && lyricsAreMostlyChinese(song.lyrics.parsedLines)) {
          logInfo(requestId, "Skipping soramimi generation - lyrics are mostly Chinese");
          return jsonResponse({
            totalLines,
            totalChunks: 0,
            chunkSize: CHUNK_SIZE,
            cached: false,
            skipped: true,
            skipReason: "chinese_lyrics",
          });
        }

        // Check if already cached (must have actual data, not just empty arrays/objects)
        // Skip cache check if force=true (user wants to regenerate)
        let cached = false;
        let krcDerivedTranslation: string | undefined;
        
        if (!force) {
          if (operation === "translate" && language && song.translations?.[language]) {
            cached = true;
          } else if (operation === "furigana" && song.furigana && song.furigana.length > 0) {
            cached = true;
          } else if (operation === "soramimi" && song.soramimi && song.soramimi.length > 0) {
            cached = true;
          }
        }
        
        // For Chinese Traditional: use KRC source directly if available (skip AI)
        if (!cached && operation === "translate" && language && isChineseTraditional(language) && song.lyrics?.krc) {
          const krcDerivedLrc = buildChineseTranslationFromKrc(
            song.lyrics,
            song.lyricsSource?.title || song.title,
            song.lyricsSource?.artist || song.artist
          );
          if (krcDerivedLrc) {
            cached = true;
            krcDerivedTranslation = krcDerivedLrc;
            logInfo(requestId, "Using KRC-derived Traditional Chinese translation in chunk-info (skipping AI)");
            // Save this translation for future requests
            await saveTranslation(redis, songId, language, krcDerivedLrc);
          }
        }

        // If not cached and has chunks, process chunk 0 inline to eliminate one round-trip
        let initialChunk: {
          chunkIndex: number;
          startIndex: number;
          translations?: string[];
          furigana?: FuriganaSegment[][];
          soramimi?: FuriganaSegment[][];
          cached: boolean;
        } | undefined;

        if (!cached && totalChunks > 0) {
          const startIndex = 0;
          const endIndex = Math.min(CHUNK_SIZE, totalLines);
          const chunkLines = song.lyrics!.parsedLines!.slice(startIndex, endIndex);

          if (operation === "translate" && language) {
            // Convert to LyricLine format and translate
            const lines: LyricLine[] = chunkLines.map(line => ({ words: line.words, startTimeMs: line.startTimeMs }));
            const translations = await translateChunk(lines, language, requestId);

            // Cache chunk 0
            const lyricsHash = song.lyricsSource?.hash;
            const chunkCacheKey = lyricsHash
              ? `song:${songId}:translate:${language}:chunk:0:${lyricsHash}`
              : `song:${songId}:translate:${language}:chunk:0`;
            await redis.set(chunkCacheKey, translations, { ex: 60 * 60 * 24 * 30 });

            initialChunk = { chunkIndex: 0, startIndex: 0, translations, cached: false };
            logInfo(requestId, `Chunk info: ${operation} - processed chunk 0 inline`, { totalLines, totalChunks });
          } else if (operation === "furigana") {
            const lines: LyricLine[] = chunkLines.map(line => ({ words: line.words, startTimeMs: line.startTimeMs }));
            const furigana = await generateFuriganaForChunk(lines, requestId);

            const lyricsHash = song.lyricsSource?.hash;
            const chunkCacheKey = lyricsHash
              ? `song:${songId}:furigana:chunk:0:${lyricsHash}`
              : `song:${songId}:furigana:chunk:0`;
            await redis.set(chunkCacheKey, furigana, { ex: 60 * 60 * 24 * 30 });

            initialChunk = { chunkIndex: 0, startIndex: 0, furigana, cached: false };
            logInfo(requestId, `Chunk info: ${operation} - processed chunk 0 inline`, { totalLines, totalChunks });
          } else if (operation === "soramimi") {
            const lines: LyricLine[] = chunkLines.map(line => ({ words: line.words, startTimeMs: line.startTimeMs }));
            const soramimi = await generateSoramimiForChunk(lines, requestId);

            const lyricsHash = song.lyricsSource?.hash;
            const chunkCacheKey = lyricsHash
              ? `song:${songId}:soramimi:chunk:0:${lyricsHash}`
              : `song:${songId}:soramimi:chunk:0`;
            await redis.set(chunkCacheKey, soramimi, { ex: 60 * 60 * 24 * 30 });

            initialChunk = { chunkIndex: 0, startIndex: 0, soramimi, cached: false };
            logInfo(requestId, `Chunk info: ${operation} - processed chunk 0 inline`, { totalLines, totalChunks });
          }
        } else {
          logInfo(requestId, `Chunk info: ${operation}`, { totalLines, totalChunks, cached });
        }

        return jsonResponse({
          totalLines,
          totalChunks,
          chunkSize: CHUNK_SIZE,
          cached,
          // If cached, return the full result
          ...(cached && operation === "translate" && language && (krcDerivedTranslation || song.translations?.[language])
            ? { translation: krcDerivedTranslation || song.translations![language] }
            : {}),
          ...(cached && operation === "furigana" && song.furigana && song.furigana.length > 0 
            ? { furigana: song.furigana } 
            : {}),
          ...(cached && operation === "soramimi" && song.soramimi && song.soramimi.length > 0 
            ? { soramimi: song.soramimi } 
            : {}),
          // Include first chunk if not cached (eliminates one round-trip)
          ...(initialChunk ? { initialChunk } : {}),
        });
      }

      // =======================================================================
      // Handle translate-chunk action - processes a single chunk
      // =======================================================================
      if (action === "translate-chunk") {
        const parsed = TranslateChunkSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { language, chunkIndex, force } = parsed.data;

        // Get song with lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics to translate", 404);
        }

        // Ensure parsedLines exist
        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          song.lyrics.parsedLines = parseLyricsContent(
            { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
            song.title,
            song.artist
          );
          await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
        }

        const totalLines = song.lyrics.parsedLines.length;
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);

        if (chunkIndex < 0 || chunkIndex >= totalChunks) {
          return errorResponse(`Invalid chunk index: ${chunkIndex}. Valid range: 0-${totalChunks - 1}`);
        }

        // Extract chunk
        const startIndex = chunkIndex * CHUNK_SIZE;
        const endIndex = Math.min(startIndex + CHUNK_SIZE, totalLines);
        const chunkLines = song.lyrics.parsedLines.slice(startIndex, endIndex);

        // Check chunk cache (include lyrics hash to invalidate when source changes)
        const lyricsHash = song.lyricsSource?.hash;
        const chunkCacheKey = lyricsHash
          ? `song:${songId}:translate:${language}:chunk:${chunkIndex}:${lyricsHash}`
          : `song:${songId}:translate:${language}:chunk:${chunkIndex}`;
        if (!force) {
          try {
            const cachedChunk = await redis.get(chunkCacheKey) as string[] | null;
            if (cachedChunk) {
              logInfo(requestId, `Translate chunk ${chunkIndex + 1}/${totalChunks} - cache HIT`);
              return jsonResponse({
                chunkIndex,
                totalChunks,
                startIndex,
                translations: cachedChunk,
                cached: true,
              });
            }
          } catch (e) {
            logError(requestId, "Chunk cache lookup failed", e);
          }
        }

        // Convert to LyricLine format
        const lines: LyricLine[] = chunkLines.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
        }));

        let translations: string[];
        
        // For Chinese Traditional: use KRC source directly if available (skip AI)
        if (isChineseTraditional(language) && song.lyrics?.krc) {
          logInfo(requestId, `Using KRC-derived Traditional Chinese for chunk ${chunkIndex + 1}/${totalChunks} (${lines.length} lines)`);
          // Convert each line's text from Simplified to Traditional Chinese
          translations = lines.map(line => simplifiedToTraditional(line.words));
        } else {
          logInfo(requestId, `Translating chunk ${chunkIndex + 1}/${totalChunks} (${lines.length} lines)`);
          translations = await translateChunk(lines, language, requestId);
        }

        // Cache the chunk result (30 days)
        try {
          await redis.set(chunkCacheKey, translations, { ex: 60 * 60 * 24 * 30 });
        } catch (e) {
          logError(requestId, "Chunk cache write failed", e);
        }

        logInfo(requestId, `Translate chunk ${chunkIndex + 1}/${totalChunks} - completed`);
        return jsonResponse({
          chunkIndex,
          totalChunks,
          startIndex,
          translations,
          cached: false,
        });
      }

      // =======================================================================
      // Handle furigana-chunk action - processes a single chunk
      // =======================================================================
      if (action === "furigana-chunk") {
        const parsed = FuriganaChunkSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { chunkIndex, force } = parsed.data;

        // Get song with lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Ensure parsedLines exist
        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          song.lyrics.parsedLines = parseLyricsContent(
            { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
            song.title,
            song.artist
          );
          await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
        }

        const totalLines = song.lyrics.parsedLines.length;
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);

        if (chunkIndex < 0 || chunkIndex >= totalChunks) {
          return errorResponse(`Invalid chunk index: ${chunkIndex}. Valid range: 0-${totalChunks - 1}`);
        }

        // Extract chunk
        const startIndex = chunkIndex * CHUNK_SIZE;
        const endIndex = Math.min(startIndex + CHUNK_SIZE, totalLines);
        const chunkLines = song.lyrics.parsedLines.slice(startIndex, endIndex);

        // Check chunk cache (include lyrics hash to invalidate when source changes)
        const lyricsHash = song.lyricsSource?.hash;
        const chunkCacheKey = lyricsHash
          ? `song:${songId}:furigana:chunk:${chunkIndex}:${lyricsHash}`
          : `song:${songId}:furigana:chunk:${chunkIndex}`;
        if (!force) {
          try {
            const cachedChunk = await redis.get(chunkCacheKey) as FuriganaSegment[][] | null;
            if (cachedChunk) {
              logInfo(requestId, `Furigana chunk ${chunkIndex + 1}/${totalChunks} - cache HIT`);
              return jsonResponse({
                chunkIndex,
                totalChunks,
                startIndex,
                furigana: cachedChunk,
                cached: true,
              });
            }
          } catch (e) {
            logError(requestId, "Chunk cache lookup failed", e);
          }
        }

        // Convert to LyricLine format and generate furigana
        const lines: LyricLine[] = chunkLines.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
        }));

        logInfo(requestId, `Generating furigana chunk ${chunkIndex + 1}/${totalChunks} (${lines.length} lines)`);
        const furigana = await generateFuriganaForChunk(lines, requestId);

        // Cache the chunk result (30 days)
        try {
          await redis.set(chunkCacheKey, furigana, { ex: 60 * 60 * 24 * 30 });
        } catch (e) {
          logError(requestId, "Chunk cache write failed", e);
        }

        logInfo(requestId, `Furigana chunk ${chunkIndex + 1}/${totalChunks} - completed`);
        return jsonResponse({
          chunkIndex,
          totalChunks,
          startIndex,
          furigana,
          cached: false,
        });
      }

      // =======================================================================
      // Handle soramimi-chunk action - processes a single chunk of Chinese misheard lyrics
      // =======================================================================
      if (action === "soramimi-chunk") {
        const parsed = SoramimiChunkSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { chunkIndex, force } = parsed.data;

        // Get song with lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Ensure parsedLines exist
        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          song.lyrics.parsedLines = parseLyricsContent(
            { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
            song.title,
            song.artist
          );
          await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
        }

        // Skip soramimi for Chinese lyrics (空耳 doesn't make sense for Chinese lyrics)
        if (lyricsAreMostlyChinese(song.lyrics.parsedLines)) {
          logInfo(requestId, "Skipping soramimi chunk - lyrics are mostly Chinese");
          return jsonResponse({
            chunkIndex,
            totalChunks: 0,
            startIndex: 0,
            soramimi: [],
            cached: false,
            skipped: true,
            skipReason: "chinese_lyrics",
          });
        }

        const totalLines = song.lyrics.parsedLines.length;
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);

        if (chunkIndex < 0 || chunkIndex >= totalChunks) {
          return errorResponse(`Invalid chunk index: ${chunkIndex}. Valid range: 0-${totalChunks - 1}`);
        }

        // Extract chunk
        const startIndex = chunkIndex * CHUNK_SIZE;
        const endIndex = Math.min(startIndex + CHUNK_SIZE, totalLines);
        const chunkLines = song.lyrics.parsedLines.slice(startIndex, endIndex);

        // Check chunk cache (include lyrics hash to invalidate when source changes)
        const lyricsHash = song.lyricsSource?.hash;
        const chunkCacheKey = lyricsHash
          ? `song:${songId}:soramimi:chunk:${chunkIndex}:${lyricsHash}`
          : `song:${songId}:soramimi:chunk:${chunkIndex}`;
        if (!force) {
          try {
            const cachedChunk = await redis.get(chunkCacheKey) as FuriganaSegment[][] | null;
            if (cachedChunk) {
              logInfo(requestId, `Soramimi chunk ${chunkIndex + 1}/${totalChunks} - cache HIT`);
              return jsonResponse({
                chunkIndex,
                totalChunks,
                startIndex,
                soramimi: cachedChunk,
                cached: true,
              });
            }
          } catch (e) {
            logError(requestId, "Chunk cache lookup failed", e);
          }
        }

        // Convert to LyricLine format and generate soramimi
        const lines: LyricLine[] = chunkLines.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
        }));

        logInfo(requestId, `Generating soramimi chunk ${chunkIndex + 1}/${totalChunks} (${lines.length} lines)`);
        const soramimi = await generateSoramimiForChunk(lines, requestId);

        // Cache the chunk result (30 days)
        try {
          await redis.set(chunkCacheKey, soramimi, { ex: 60 * 60 * 24 * 30 });
        } catch (e) {
          logError(requestId, "Chunk cache write failed", e);
        }

        logInfo(requestId, `Soramimi chunk ${chunkIndex + 1}/${totalChunks} - completed`);
        return jsonResponse({
          chunkIndex,
          totalChunks,
          startIndex,
          soramimi,
          cached: false,
        });
      }

      // =======================================================================
      // Handle save-translation action - saves consolidated translation to song
      // This is called by the client after all chunks have been processed
      // =======================================================================
      if (action === "save-translation") {
        const parsed = SaveTranslationSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { language, translations } = parsed.data;

        // Get song with lyrics to build the LRC
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.parsedLines) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Verify the translations array matches the parsed lines
        if (translations.length !== song.lyrics.parsedLines.length) {
          return errorResponse(`Translation count mismatch: ${translations.length} vs ${song.lyrics.parsedLines.length} lines`);
        }

        // Build translated LRC from the parsed lines and translations
        const translatedLrc = song.lyrics.parsedLines
          .map((line, index) => `${msToLrcTime(line.startTimeMs)}${translations[index] || line.words}`)
          .join("\n");

        // Save to song document
        await saveTranslation(redis, songId, language, translatedLrc);

        // Clean up chunk caches now that consolidated data is saved
        const lyricsHash = song.lyricsSource?.hash;
        const totalChunks = Math.ceil(song.lyrics.parsedLines.length / CHUNK_SIZE);
        try {
          for (let i = 0; i < totalChunks; i++) {
            const chunkKey = lyricsHash
              ? `song:${songId}:translate:${language}:chunk:${i}:${lyricsHash}`
              : `song:${songId}:translate:${language}:chunk:${i}`;
            await redis.del(chunkKey);
          }
          if (totalChunks > 0) {
            logInfo(requestId, `Cleaned up ${totalChunks} translation chunk caches`);
          }
        } catch (e) {
          logError(requestId, "Failed to clean up translation chunk caches", e);
        }

        logInfo(requestId, `Saved consolidated translation (${language}, ${translations.length} lines)`);
        return jsonResponse({ success: true, language, lineCount: translations.length });
      }

      // =======================================================================
      // Handle save-furigana action - saves consolidated furigana to song
      // This is called by the client after all chunks have been processed
      // =======================================================================
      if (action === "save-furigana") {
        const parsed = SaveFuriganaSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { furigana } = parsed.data;

        // Get song to verify it exists and has lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.parsedLines) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Verify the furigana array matches the parsed lines
        if (furigana.length !== song.lyrics.parsedLines.length) {
          return errorResponse(`Furigana count mismatch: ${furigana.length} vs ${song.lyrics.parsedLines.length} lines`);
        }

        // Save to song document
        await saveFurigana(redis, songId, furigana as FuriganaSegment[][]);

        // Clean up chunk caches now that consolidated data is saved
        const lyricsHash = song.lyricsSource?.hash;
        const totalChunks = Math.ceil(song.lyrics.parsedLines.length / CHUNK_SIZE);
        try {
          for (let i = 0; i < totalChunks; i++) {
            const chunkKey = lyricsHash
              ? `song:${songId}:furigana:chunk:${i}:${lyricsHash}`
              : `song:${songId}:furigana:chunk:${i}`;
            await redis.del(chunkKey);
          }
          if (totalChunks > 0) {
            logInfo(requestId, `Cleaned up ${totalChunks} furigana chunk caches`);
          }
        } catch (e) {
          logError(requestId, "Failed to clean up furigana chunk caches", e);
        }

        logInfo(requestId, `Saved consolidated furigana (${furigana.length} lines)`);
        return jsonResponse({ success: true, lineCount: furigana.length });
      }

      // =======================================================================
      // Handle save-soramimi action - saves consolidated soramimi to song
      // This is called by the client after all chunks have been processed
      // =======================================================================
      if (action === "save-soramimi") {
        const parsed = SaveSoramimiSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { soramimi } = parsed.data;

        // Get song to verify it exists and has lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.parsedLines) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Verify the soramimi array matches the parsed lines
        if (soramimi.length !== song.lyrics.parsedLines.length) {
          return errorResponse(`Soramimi count mismatch: ${soramimi.length} vs ${song.lyrics.parsedLines.length} lines`);
        }

        // Save to song document
        await saveSoramimi(redis, songId, soramimi as FuriganaSegment[][]);

        // Clean up chunk caches now that consolidated data is saved
        const lyricsHash = song.lyricsSource?.hash;
        const totalChunks = Math.ceil(song.lyrics.parsedLines.length / CHUNK_SIZE);
        try {
          for (let i = 0; i < totalChunks; i++) {
            const chunkKey = lyricsHash
              ? `song:${songId}:soramimi:chunk:${i}:${lyricsHash}`
              : `song:${songId}:soramimi:chunk:${i}`;
            await redis.del(chunkKey);
          }
          if (totalChunks > 0) {
            logInfo(requestId, `Cleaned up ${totalChunks} soramimi chunk caches`);
          }
        } catch (e) {
          logError(requestId, "Failed to clean up soramimi chunk caches", e);
        }

        logInfo(requestId, `Saved consolidated soramimi (${soramimi.length} lines)`);
        return jsonResponse({ success: true, lineCount: soramimi.length });
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
        const lyricsHash = song.lyricsSource?.hash;
        const totalLines = song.lyrics?.parsedLines?.length || 0;
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);

        // Clear translations if requested
        if (shouldClearTranslations) {
          // Clear consolidated translations
          if (song.translations && Object.keys(song.translations).length > 0) {
            await saveSong(redis, { id: songId, translations: {} }, { preserveTranslations: false });
          }
          
          // Clear chunk caches for all languages
          try {
            const pattern = lyricsHash
              ? `song:${songId}:translate:*:chunk:*:${lyricsHash}`
              : `song:${songId}:translate:*:chunk:*`;
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
              await redis.del(...keys);
              logInfo(requestId, `Deleted ${keys.length} translation chunk caches`);
            }
          } catch (e) {
            logError(requestId, "Failed to delete translation chunk caches", e);
          }
          
          cleared.push("translations");
        }

        // Clear furigana if requested
        if (shouldClearFurigana) {
          // Clear consolidated furigana
          if (song.furigana && song.furigana.length > 0) {
            await saveSong(redis, { id: songId, furigana: [] }, { preserveFurigana: false });
          }
          
          // Clear furigana chunk caches
          try {
            for (let i = 0; i < totalChunks; i++) {
              const chunkKey = lyricsHash
                ? `song:${songId}:furigana:chunk:${i}:${lyricsHash}`
                : `song:${songId}:furigana:chunk:${i}`;
              await redis.del(chunkKey);
            }
            if (totalChunks > 0) {
              logInfo(requestId, `Deleted ${totalChunks} furigana chunk caches`);
            }
          } catch (e) {
            logError(requestId, "Failed to delete furigana chunk caches", e);
          }
          
          cleared.push("furigana");
        }

        // Clear soramimi if requested
        if (shouldClearSoramimi) {
          // Clear consolidated soramimi
          if (song.soramimi && song.soramimi.length > 0) {
            await saveSong(redis, { id: songId, soramimi: [] }, { preserveSoramimi: false });
          }
          
          // Clear soramimi chunk caches
          try {
            for (let i = 0; i < totalChunks; i++) {
              const chunkKey = lyricsHash
                ? `song:${songId}:soramimi:chunk:${i}:${lyricsHash}`
                : `song:${songId}:soramimi:chunk:${i}`;
              await redis.del(chunkKey);
            }
            if (totalChunks > 0) {
              logInfo(requestId, `Deleted ${totalChunks} soramimi chunk caches`);
            }
          } catch (e) {
            logError(requestId, "Failed to delete soramimi chunk caches", e);
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
        const authResult = await validateAuthToken(redis, username, authToken);
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
      const authResult = await validateAuthToken(redis, username, authToken);
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

      const authResult = await validateAuthToken(redis, username, authToken);
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
