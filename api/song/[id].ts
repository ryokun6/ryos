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
  updateSoramimiLines,
  canModifySong,
  type LyricsSource,
  type LyricsContent,
  type FuriganaSegment,
  type SoramimiMeta,
} from "../_utils/song-service.js";

// Import from split modules
import {
  CHUNK_SIZE,
  SORAMIMI_CHUNK_SIZE,
  UpdateSongSchema,
  FetchLyricsSchema,
  SearchLyricsSchema,
  TranslateStreamSchema,
  FuriganaStreamSchema,
  SoramimiStreamSchema,
  SoramimiResumeSchema,
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
          
          // Include soramimi info if requested (uses smaller chunk size due to complex prompt)
          if (includeSoramimi && song.lyrics.parsedLines) {
            const totalLines = song.lyrics.parsedLines.length;
            const totalChunks = Math.ceil(totalLines / SORAMIMI_CHUNK_SIZE);
            const hasSoramimi = !!(song.soramimi && song.soramimi.length > 0);
            // Check if there are failed lines that need resume
            const failedLines = song.soramimiMeta?.failedLines || [];
            const isPartial = failedLines.length > 0;
            response.soramimi = {
              totalLines,
              totalChunks,
              chunkSize: SORAMIMI_CHUNK_SIZE,
              cached: hasSoramimi,
              ...(hasSoramimi ? { data: song.soramimi } : {}),
              // Include metadata about partial results
              ...(isPartial ? { 
                isPartial: true, 
                failedLines,
              } : {}),
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
        // Uses smaller chunk size due to complex creative prompt
        if (includeSoramimi) {
          const totalLines = parsedLines.length;
          const totalChunks = Math.ceil(totalLines / SORAMIMI_CHUNK_SIZE);
          response.soramimi = {
            totalLines,
            totalChunks,
            chunkSize: SORAMIMI_CHUNK_SIZE,
            cached: false,
          };
        }
        
        return jsonResponse(response);
      }

      // =======================================================================
      // Handle translate-stream action - SSE streaming with server-side caching
      // Server translates all chunks and saves to Redis even if client disconnects
      // =======================================================================
      if (action === "translate-stream") {
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

        // Check if already cached (and not forcing regeneration)
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
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
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
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": effectiveOrigin!,
              },
            });
          }
        }

        logInfo(requestId, `Starting translate SSE stream`, { totalLines, totalChunks, language });

        // Create SSE stream
        const encoder = new TextEncoder();
        let streamClosed = false;
        
        const stream = new ReadableStream({
          async start(controller) {
            const allTranslations: string[] = new Array(totalLines).fill("");
            let successCount = 0;
            let failCount = 0;

            const sendEvent = (data: unknown) => {
              if (streamClosed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch {
                streamClosed = true;
              }
            };

            sendEvent({
              type: "start",
              totalChunks,
              totalLines,
              chunkSize: CHUNK_SIZE,
            });

            const MAX_CONCURRENT = 3; // Process up to 3 chunks in parallel
            let completedCount = 0;

            // Helper function to process a single chunk
            const processChunk = async (chunkIndex: number): Promise<{ chunkIndex: number; success: boolean }> => {
              // Check if client disconnected before processing
              if (streamClosed) {
                logInfo(requestId, `SSE: Skipping translate chunk ${chunkIndex} - stream closed`);
                return { chunkIndex, success: false };
              }

              const startIndex = chunkIndex * CHUNK_SIZE;
              const endIndex = Math.min(startIndex + CHUNK_SIZE, totalLines);
              const chunkLines = song.lyrics!.parsedLines!.slice(startIndex, endIndex);

              const lines: LyricLine[] = chunkLines.map(line => ({
                words: line.words,
                startTimeMs: line.startTimeMs,
              }));

              try {
                logInfo(requestId, `SSE: Translating chunk ${chunkIndex + 1}/${totalChunks}`);
                const translations = await translateChunk(lines, language, requestId);

                translations.forEach((text, i) => {
                  const targetIndex = startIndex + i;
                  if (targetIndex < allTranslations.length) {
                    allTranslations[targetIndex] = text;
                  }
                });

                completedCount++;

                sendEvent({
                  type: "chunk",
                  chunkIndex,
                  startIndex,
                  translations,
                  progress: Math.round((completedCount / totalChunks) * 100),
                });

                logInfo(requestId, `SSE: Translate chunk ${chunkIndex + 1}/${totalChunks} done`);
                return { chunkIndex, success: true };
              } catch (err) {
                logError(requestId, `SSE: Translate chunk ${chunkIndex} failed`, err);
                
                // Use original text as fallback
                lines.forEach((line, i) => {
                  const targetIndex = startIndex + i;
                  if (targetIndex < allTranslations.length) {
                    allTranslations[targetIndex] = line.words;
                  }
                });

                completedCount++;

                sendEvent({
                  type: "chunk_error",
                  chunkIndex,
                  startIndex,
                  error: err instanceof Error ? err.message : "Unknown error",
                  progress: Math.round((completedCount / totalChunks) * 100),
                });

                return { chunkIndex, success: false };
              }
            };

            // Process chunks in parallel with concurrency limit
            const processInParallel = async (chunkIndices: number[]) => {
              const results: { chunkIndex: number; success: boolean }[] = [];
              
              for (let i = 0; i < chunkIndices.length; i += MAX_CONCURRENT) {
                const batch = chunkIndices.slice(i, i + MAX_CONCURRENT);
                const batchResults = await Promise.all(
                  batch.map(idx => processChunk(idx))
                );
                results.push(...batchResults);
              }
              
              return results;
            };

            // Process all chunks in parallel
            const allChunkIndices = Array.from({ length: totalChunks }, (_, i) => i);
            const results = await processInParallel(allChunkIndices);

            for (const result of results) {
              if (result.success) {
                successCount++;
              } else {
                failCount++;
              }
            }

            // After processing all chunks, save results
            // Save translation even if partial - failures used original text as fallback
            try {
              const translatedLrc = song.lyrics!.parsedLines!
                .map((line, index) => `${msToLrcTime(line.startTimeMs)}${allTranslations[index] || line.words}`)
                .join("\n");
              await saveTranslation(redis, songId, language, translatedLrc);
              logInfo(requestId, `SSE: Saved translation to cache (${totalLines} lines, ${failCount} chunks used fallback)`);
            } catch (err) {
              logError(requestId, "SSE: Failed to save translation", err);
            }

            sendEvent({
              type: "complete",
              totalChunks,
              successCount,
              failCount,
              cached: true, // Always true now since we save partial results
              partialSuccess: failCount > 0, // Indicates some failures occurred
              translations: allTranslations,
            });

            logInfo(requestId, `SSE: Translate stream complete`, { successCount, failCount, cached: true });
            
            if (!streamClosed) {
              controller.close();
            }
          },
          cancel(reason) {
            streamClosed = true;
            logInfo(requestId, "SSE: Client disconnected, stopping translation", { reason: String(reason) });
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        });
      }

      // =======================================================================
      // Handle furigana-stream action - SSE streaming with server-side caching
      // Server generates all chunks and saves to Redis even if client disconnects
      // =======================================================================
      if (action === "furigana-stream") {
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

        // Check if already cached
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
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          });
        }

        logInfo(requestId, `Starting furigana SSE stream`, { totalLines, totalChunks });

        // Create SSE stream
        const encoder = new TextEncoder();
        let streamClosed = false;
        
        const stream = new ReadableStream({
          async start(controller) {
            const allFurigana: Array<Array<{ text: string; reading?: string }>> = 
              new Array(totalLines).fill(null).map(() => []);
            let successCount = 0;
            let failCount = 0;

            const sendEvent = (data: unknown) => {
              if (streamClosed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch {
                streamClosed = true;
              }
            };

            sendEvent({
              type: "start",
              totalChunks,
              totalLines,
              chunkSize: CHUNK_SIZE,
            });

            const MAX_CONCURRENT = 3; // Process up to 3 chunks in parallel
            let completedCount = 0;

            // Helper function to process a single chunk
            const processChunk = async (chunkIndex: number): Promise<{ chunkIndex: number; success: boolean }> => {
              // Check if client disconnected before processing
              if (streamClosed) {
                logInfo(requestId, `SSE: Skipping furigana chunk ${chunkIndex} - stream closed`);
                return { chunkIndex, success: false };
              }

              const startIndex = chunkIndex * CHUNK_SIZE;
              const endIndex = Math.min(startIndex + CHUNK_SIZE, totalLines);
              const chunkLines = song.lyrics!.parsedLines!.slice(startIndex, endIndex);

              const lines: LyricLine[] = chunkLines.map(line => ({
                words: line.words,
                startTimeMs: line.startTimeMs,
              }));

              try {
                logInfo(requestId, `SSE: Generating furigana chunk ${chunkIndex + 1}/${totalChunks}`);
                const furigana = await generateFuriganaForChunk(lines, requestId);

                furigana.forEach((segments, i) => {
                  const targetIndex = startIndex + i;
                  if (targetIndex < allFurigana.length) {
                    allFurigana[targetIndex] = segments;
                  }
                });

                completedCount++;

                sendEvent({
                  type: "chunk",
                  chunkIndex,
                  startIndex,
                  furigana,
                  progress: Math.round((completedCount / totalChunks) * 100),
                });

                logInfo(requestId, `SSE: Furigana chunk ${chunkIndex + 1}/${totalChunks} done`);
                return { chunkIndex, success: true };
              } catch (err) {
                logError(requestId, `SSE: Furigana chunk ${chunkIndex} failed`, err);

                completedCount++;

                sendEvent({
                  type: "chunk_error",
                  chunkIndex,
                  startIndex,
                  error: err instanceof Error ? err.message : "Unknown error",
                  progress: Math.round((completedCount / totalChunks) * 100),
                });

                return { chunkIndex, success: false };
              }
            };

            // Process chunks in parallel with concurrency limit
            const processInParallel = async (chunkIndices: number[]) => {
              const results: { chunkIndex: number; success: boolean }[] = [];
              
              for (let i = 0; i < chunkIndices.length; i += MAX_CONCURRENT) {
                const batch = chunkIndices.slice(i, i + MAX_CONCURRENT);
                const batchResults = await Promise.all(
                  batch.map(idx => processChunk(idx))
                );
                results.push(...batchResults);
              }
              
              return results;
            };

            // Process all chunks in parallel
            const allChunkIndices = Array.from({ length: totalChunks }, (_, i) => i);
            const results = await processInParallel(allChunkIndices);

            for (const result of results) {
              if (result.success) {
                successCount++;
              } else {
                failCount++;
              }
            }

            // After processing all chunks, save results
            // Save furigana even if partial - missing lines will have empty arrays
            try {
              await saveFurigana(redis, songId, allFurigana);
              logInfo(requestId, `SSE: Saved furigana to cache (${totalLines} lines, ${failCount} chunks failed)`);
            } catch (err) {
              logError(requestId, "SSE: Failed to save furigana", err);
            }

            sendEvent({
              type: "complete",
              totalChunks,
              successCount,
              failCount,
              cached: true, // Always true now since we save partial results
              partialSuccess: failCount > 0, // Indicates some failures occurred
              furigana: allFurigana,
            });

            logInfo(requestId, `SSE: Furigana stream complete`, { successCount, failCount, cached: true });
            
            if (!streamClosed) {
              controller.close();
            }
          },
          cancel(reason) {
            streamClosed = true;
            logInfo(requestId, "SSE: Client disconnected, stopping furigana", { reason: String(reason) });
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        });
      }

      // =======================================================================
      // Handle soramimi-stream action - SSE streaming with server-side caching
      // Server generates all chunks and saves to Redis even if client disconnects
      // =======================================================================
      if (action === "soramimi-stream") {
        const parsed = SoramimiStreamSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { force } = parsed.data;

        // Get song with lyrics and existing soramimi
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeSoramimi: true,
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

        // Skip soramimi for Chinese lyrics
        if (lyricsAreMostlyChinese(song.lyrics.parsedLines)) {
          logInfo(requestId, "Skipping soramimi stream - lyrics are mostly Chinese");
          return jsonResponse({
            skipped: true,
            skipReason: "chinese_lyrics",
          });
        }

        // Check if already cached (and not forcing regeneration)
        if (!force && song.soramimi && song.soramimi.length > 0) {
          logInfo(requestId, "Returning cached soramimi via SSE");
          // Return cached data as a single complete event
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "cached",
                soramimi: song.soramimi,
              })}\n\n`));
              controller.close();
            },
          });
          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          });
        }

        const totalLines = song.lyrics.parsedLines.length;
        const totalChunks = Math.ceil(totalLines / SORAMIMI_CHUNK_SIZE);

        logInfo(requestId, `Starting soramimi SSE stream`, { totalLines, totalChunks });

        // Create SSE stream
        const encoder = new TextEncoder();
        let streamClosed = false;
        
        const stream = new ReadableStream({
          async start(controller) {
            const allSoramimi: Array<Array<{ text: string; reading?: string }>> = 
              new Array(totalLines).fill(null).map(() => []);
            let successCount = 0;
            let failCount = 0;

            // Helper to send SSE event (ignore errors if stream closed)
            const sendEvent = (data: unknown) => {
              if (streamClosed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch {
                streamClosed = true;
              }
            };

            // Send initial progress
            sendEvent({
              type: "start",
              totalChunks,
              totalLines,
              chunkSize: SORAMIMI_CHUNK_SIZE,
            });

            // Track failed chunks for retry
            const failedChunks: number[] = [];
            const MAX_RETRIES = 2;
            const MAX_CONCURRENT = 3; // Process up to 3 chunks in parallel

            // Helper function to process a single chunk
            const processChunk = async (chunkIndex: number, isRetry = false): Promise<{ chunkIndex: number; success: boolean }> => {
              // Check if client disconnected before processing
              if (streamClosed) {
                logInfo(requestId, `SSE: Skipping chunk ${chunkIndex} - stream closed`);
                return { chunkIndex, success: false };
              }

              const startIndex = chunkIndex * SORAMIMI_CHUNK_SIZE;
              const endIndex = Math.min(startIndex + SORAMIMI_CHUNK_SIZE, totalLines);
              const chunkLines = song.lyrics!.parsedLines!.slice(startIndex, endIndex);

              const lines: LyricLine[] = chunkLines.map(line => ({
                words: line.words,
                startTimeMs: line.startTimeMs,
              }));

              try {
                logInfo(requestId, `SSE: ${isRetry ? "Retrying" : "Generating"} chunk ${chunkIndex + 1}/${totalChunks}`);
                const { segments, success } = await generateSoramimiForChunk(lines, requestId);

                // Only store results if AI generation succeeded (not fallback)
                if (success) {
                  segments.forEach((seg, i) => {
                    const targetIndex = startIndex + i;
                    if (targetIndex < allSoramimi.length) {
                      allSoramimi[targetIndex] = seg;
                    }
                  });

                  // Send progress event with chunk data
                  sendEvent({
                    type: "chunk",
                    chunkIndex,
                    startIndex,
                    soramimi: segments,
                    progress: Math.round(((successCount + 1) / totalChunks) * 100),
                  });

                  logInfo(requestId, `SSE: Chunk ${chunkIndex + 1}/${totalChunks} done`);
                  return { chunkIndex, success: true };
                } else {
                  // AI returned fallback (timeout) - mark as failed for retry
                  logInfo(requestId, `SSE: Chunk ${chunkIndex + 1}/${totalChunks} returned fallback, will retry`);
                  return { chunkIndex, success: false };
                }
              } catch (err) {
                logError(requestId, `SSE: Chunk ${chunkIndex} failed`, err);
                return { chunkIndex, success: false };
              }
            };

            // Process chunks in parallel with concurrency limit
            const processInParallel = async (chunkIndices: number[], isRetry = false) => {
              const results: { chunkIndex: number; success: boolean }[] = [];
              
              for (let i = 0; i < chunkIndices.length; i += MAX_CONCURRENT) {
                const batch = chunkIndices.slice(i, i + MAX_CONCURRENT);
                const batchResults = await Promise.all(
                  batch.map(idx => processChunk(idx, isRetry))
                );
                results.push(...batchResults);
              }
              
              return results;
            };

            // First pass: process all chunks in parallel
            const allChunkIndices = Array.from({ length: totalChunks }, (_, i) => i);
            const firstPassResults = await processInParallel(allChunkIndices);
            
            for (const result of firstPassResults) {
              if (result.success) {
                successCount++;
              } else {
                failedChunks.push(result.chunkIndex);
              }
            }

            // Retry failed chunks (sequentially for reliability)
            if (failedChunks.length > 0) {
              logInfo(requestId, `SSE: Retrying ${failedChunks.length} failed chunks`);
              
              for (let retry = 0; retry < MAX_RETRIES && failedChunks.length > 0; retry++) {
                const chunksToRetry = [...failedChunks];
                failedChunks.length = 0;
                
                // Retry sequentially to avoid overloading
                for (const chunkIndex of chunksToRetry) {
                  const result = await processChunk(chunkIndex, true);
                  if (result.success) {
                    successCount++;
                    logInfo(requestId, `SSE: Retry succeeded for chunk ${chunkIndex + 1}`);
                  } else {
                    failedChunks.push(chunkIndex);
                  }
                }

                if (failedChunks.length > 0) {
                  logInfo(requestId, `SSE: ${failedChunks.length} chunks still failed after retry ${retry + 1}`);
                }
              }
            }

            // Final fail count
            failCount = failedChunks.length;

            // Compute which individual lines failed (from failed chunks)
            const failedLineIndices: number[] = [];
            for (const chunkIndex of failedChunks) {
              const startIndex = chunkIndex * SORAMIMI_CHUNK_SIZE;
              const endIndex = Math.min(startIndex + SORAMIMI_CHUNK_SIZE, totalLines);
              for (let i = startIndex; i < endIndex; i++) {
                failedLineIndices.push(i);
              }
            }

            // Send error events for any chunks that still failed after retries
            for (const chunkIndex of failedChunks) {
              const startIndex = chunkIndex * SORAMIMI_CHUNK_SIZE;
              sendEvent({
                type: "chunk_error",
                chunkIndex,
                startIndex,
                error: "Failed after retries",
                progress: 100,
              });
            }

            // Save to Redis - save partial results if we have at least 50% success
            // Also save metadata about which lines failed so client can resume
            const hasEnoughData = successCount >= totalChunks * 0.5;
            const soramimiMeta: SoramimiMeta = {
              failedLines: failedLineIndices,
              totalLines,
              lastAttemptAt: Date.now(),
              isComplete: failedLineIndices.length === 0,
            };
            
            if (hasEnoughData) {
              try {
                await saveSoramimi(redis, songId, allSoramimi, soramimiMeta);
                logInfo(requestId, `SSE: Saved soramimi to cache (${totalLines} lines, ${failedLineIndices.length} lines failed)`);
              } catch (err) {
                logError(requestId, "SSE: Failed to save soramimi", err);
              }
            } else {
              logInfo(requestId, `SSE: Not caching soramimi - only ${successCount}/${totalChunks} chunks succeeded (need 50%)`);
            }

            // Send complete event with failed line info for client to resume
            sendEvent({
              type: "complete",
              totalChunks,
              successCount,
              failCount,
              cached: hasEnoughData, // True if we saved (at least 50% success)
              partialSuccess: failCount > 0, // Indicates some failures occurred
              soramimi: allSoramimi,
              // Include failed line indices so client can request resume
              ...(failedLineIndices.length > 0 ? { failedLines: failedLineIndices } : {}),
            });

            logInfo(requestId, `SSE: Stream complete`, { successCount, failCount, failedLines: failedLineIndices.length, cached: hasEnoughData });
            
            if (!streamClosed) {
              controller.close();
            }
          },
          cancel(reason) {
            streamClosed = true;
            logInfo(requestId, "SSE: Client disconnected, stopping soramimi", { reason: String(reason) });
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        });
      }

      // =======================================================================
      // Handle soramimi-resume action - regenerate specific failed lines
      // =======================================================================
      if (action === "soramimi-resume") {
        const parsed = SoramimiResumeSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { lineIndices } = parsed.data;
        
        if (lineIndices.length === 0) {
          return errorResponse("No line indices provided");
        }

        // Get song with lyrics and existing soramimi
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeSoramimi: true,
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Ensure parsedLines exist
        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          return errorResponse("Song has no parsed lyrics", 404);
        }

        // Skip soramimi for Chinese lyrics
        if (lyricsAreMostlyChinese(song.lyrics.parsedLines)) {
          logInfo(requestId, "Skipping soramimi resume - lyrics are mostly Chinese");
          return jsonResponse({
            skipped: true,
            skipReason: "chinese_lyrics",
          });
        }

        // Validate line indices
        const totalLines = song.lyrics.parsedLines.length;
        const validLineIndices = lineIndices.filter(idx => idx >= 0 && idx < totalLines);
        
        if (validLineIndices.length === 0) {
          return errorResponse("All provided line indices are invalid");
        }

        // Group line indices into chunks (using SORAMIMI_CHUNK_SIZE)
        // Create virtual chunks that contain only the lines we need to regenerate
        type ChunkToProcess = { chunkIndex: number; lineIndices: number[]; startIndex: number };
        const chunksToProcess: ChunkToProcess[] = [];
        
        // Group consecutive line indices into chunks
        const sortedIndices = [...validLineIndices].sort((a, b) => a - b);
        let currentChunk: number[] = [];
        let currentChunkStart = -1;
        
        for (const lineIdx of sortedIndices) {
          const naturalChunkIndex = Math.floor(lineIdx / SORAMIMI_CHUNK_SIZE);
          const chunkStart = naturalChunkIndex * SORAMIMI_CHUNK_SIZE;
          
          if (currentChunkStart !== chunkStart) {
            // Start a new chunk
            if (currentChunk.length > 0) {
              chunksToProcess.push({
                chunkIndex: Math.floor(currentChunkStart / SORAMIMI_CHUNK_SIZE),
                lineIndices: currentChunk,
                startIndex: currentChunkStart,
              });
            }
            currentChunk = [lineIdx];
            currentChunkStart = chunkStart;
          } else {
            currentChunk.push(lineIdx);
          }
        }
        
        // Don't forget the last chunk
        if (currentChunk.length > 0) {
          chunksToProcess.push({
            chunkIndex: Math.floor(currentChunkStart / SORAMIMI_CHUNK_SIZE),
            lineIndices: currentChunk,
            startIndex: currentChunkStart,
          });
        }

        logInfo(requestId, `Starting soramimi resume SSE stream`, { 
          requestedLines: validLineIndices.length,
          chunksToProcess: chunksToProcess.length,
        });

        // Create SSE stream
        const encoder = new TextEncoder();
        let streamClosed = false;
        
        const stream = new ReadableStream({
          async start(controller) {
            const completedLineUpdates: { lineIndex: number; segments: FuriganaSegment[] }[] = [];
            const completedLineIndices: number[] = [];
            let successCount = 0;
            let failCount = 0;

            const sendEvent = (data: unknown) => {
              if (streamClosed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch {
                streamClosed = true;
              }
            };

            sendEvent({
              type: "start",
              totalChunks: chunksToProcess.length,
              totalLines: validLineIndices.length,
              chunkSize: SORAMIMI_CHUNK_SIZE,
              isResume: true,
            });

            // Process each chunk sequentially (for resume, be conservative)
            for (let i = 0; i < chunksToProcess.length; i++) {
              if (streamClosed) break;

              const chunk = chunksToProcess[i];
              
              // Get the lines for this chunk (only the lines we need to regenerate)
              const chunkLines = chunk.lineIndices.map(idx => ({
                words: song.lyrics!.parsedLines![idx].words,
                startTimeMs: song.lyrics!.parsedLines![idx].startTimeMs,
              }));

              try {
                logInfo(requestId, `SSE Resume: Generating chunk ${i + 1}/${chunksToProcess.length} (${chunk.lineIndices.length} lines)`);
                const { segments, success } = await generateSoramimiForChunk(chunkLines, requestId);

                if (success) {
                  // Map segments back to their original line indices
                  segments.forEach((seg, segIdx) => {
                    const originalLineIdx = chunk.lineIndices[segIdx];
                    completedLineUpdates.push({
                      lineIndex: originalLineIdx,
                      segments: seg,
                    });
                    completedLineIndices.push(originalLineIdx);
                  });

                  // Send progress with the regenerated segments mapped to original indices
                  const soramimiByLine: Record<number, FuriganaSegment[]> = {};
                  segments.forEach((seg, segIdx) => {
                    soramimiByLine[chunk.lineIndices[segIdx]] = seg;
                  });

                  sendEvent({
                    type: "chunk",
                    chunkIndex: i,
                    lineIndices: chunk.lineIndices,
                    soramimi: soramimiByLine,
                    progress: Math.round(((i + 1) / chunksToProcess.length) * 100),
                  });

                  successCount++;
                  logInfo(requestId, `SSE Resume: Chunk ${i + 1}/${chunksToProcess.length} done`);
                } else {
                  // AI returned fallback
                  failCount++;
                  sendEvent({
                    type: "chunk_error",
                    chunkIndex: i,
                    lineIndices: chunk.lineIndices,
                    error: "AI generation returned fallback",
                    progress: Math.round(((i + 1) / chunksToProcess.length) * 100),
                  });
                  logInfo(requestId, `SSE Resume: Chunk ${i + 1}/${chunksToProcess.length} returned fallback`);
                }
              } catch (err) {
                failCount++;
                logError(requestId, `SSE Resume: Chunk ${i} failed`, err);
                sendEvent({
                  type: "chunk_error",
                  chunkIndex: i,
                  lineIndices: chunk.lineIndices,
                  error: err instanceof Error ? err.message : "Unknown error",
                  progress: Math.round(((i + 1) / chunksToProcess.length) * 100),
                });
              }
            }

            // Update cache with completed lines
            if (completedLineUpdates.length > 0) {
              try {
                await updateSoramimiLines(redis, songId, completedLineUpdates, completedLineIndices);
                logInfo(requestId, `SSE Resume: Updated ${completedLineUpdates.length} lines in cache`);
              } catch (err) {
                logError(requestId, "SSE Resume: Failed to update cache", err);
              }
            }

            // Compute remaining failed lines
            const stillFailedLines = validLineIndices.filter(idx => !completedLineIndices.includes(idx));

            sendEvent({
              type: "complete",
              totalChunks: chunksToProcess.length,
              successCount,
              failCount,
              completedLines: completedLineIndices,
              ...(stillFailedLines.length > 0 ? { failedLines: stillFailedLines } : {}),
            });

            logInfo(requestId, `SSE Resume: Complete`, { 
              successCount, 
              failCount, 
              completedLines: completedLineIndices.length,
              stillFailed: stillFailedLines.length,
            });
            
            if (!streamClosed) {
              controller.close();
            }
          },
          cancel(reason) {
            streamClosed = true;
            logInfo(requestId, "SSE Resume: Client disconnected", { reason: String(reason) });
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
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

        // Clear soramimi if requested
        if (shouldClearSoramimi) {
          if (song.soramimi && song.soramimi.length > 0) {
            await saveSong(redis, { id: songId, soramimi: [] }, { preserveSoramimi: false });
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
