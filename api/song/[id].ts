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
  simplifiedToTraditional,
} from "./_kugou.js";

import {
  isChineseTraditional,
  parseLyricsContent,
  buildChineseTranslationFromKrc,
  streamTranslation,
} from "./_lyrics.js";

import {
  lyricsAreMostlyChinese,
  streamFurigana,
} from "./_furigana.js";

import {
  streamSoramimi,
} from "./_soramimi.js";

// Vercel Edge Function configuration
export const config = {
  runtime: "edge",
};

// Extended timeout for AI streaming (increased for line-by-line streaming)
export const maxDuration = 120;

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
          if (includeFurigana && song.lyrics.parsedLines) {
            const totalLines = song.lyrics.parsedLines.length;
            const hasFurigana = !!(song.furigana && song.furigana.length > 0);
            
            response.furigana = {
              totalLines,
              cached: hasFurigana,
              ...(hasFurigana ? { data: song.furigana } : {}),
            };
          }
          
          // Include soramimi info if requested
          if (includeSoramimi && song.lyrics.parsedLines) {
            const totalLines = song.lyrics.parsedLines.length;
            const hasSoramimi = !!(song.soramimi && song.soramimi.length > 0);
            
            response.soramimi = {
              totalLines,
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
        
        // Build response with optional translation/furigana info
        const response: Record<string, unknown> = {
          lyrics: { parsedLines },
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
          response.soramimi = {
            totalLines: parsedLines.length,
            cached: false,
          };
        }
        
        return jsonResponse(response);
      }

      // =======================================================================
      // Handle translate-stream action - SSE streaming with line-by-line updates
      // Uses streamText for real-time line emission as AI generates each line
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

        const totalLines = song.lyrics.parsedLines.length;

        logInfo(requestId, `Starting translate SSE stream (line-by-line)`, { 
          totalLines, 
          language,
        });

        // Create SSE stream with line-by-line updates
        const encoder = new TextEncoder();
        let streamClosed = false;
        
        const stream = new ReadableStream({
          async start(controller) {
            const allTranslations: string[] = new Array(totalLines).fill("");
            let completedLines = 0;

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
              totalLines,
            });

            // Prepare lines for translation
            const lines: LyricLine[] = song.lyrics!.parsedLines!.map(line => ({
              words: line.words,
              startTimeMs: line.startTimeMs,
            }));

            try {
              // Use streamTranslation with line callback
              const result = await streamTranslation(
                lines,
                language,
                requestId,
                (lineIndex: number, translation: string) => {
                  if (streamClosed) return;
                  
                  allTranslations[lineIndex] = translation;
                  completedLines++;
                  
                  // Emit line event immediately
                  sendEvent({
                    type: "line",
                    lineIndex,
                    translation,
                    progress: Math.round((completedLines / totalLines) * 100),
                  });
                }
              );

              // Save complete translation to main document
              if (result.success) {
                try {
                  const translatedLrc = song.lyrics!.parsedLines!
                    .map((line, index) => `${msToLrcTime(line.startTimeMs)}${result.translations[index] || line.words}`)
                    .join("\n");
                  await saveTranslation(redis, songId, language, translatedLrc);
                  logInfo(requestId, `SSE: Translation complete - saved to main document`);
                } catch (err) {
                  logError(requestId, "SSE: Failed to save translation", err);
                }
              }

              sendEvent({
                type: "complete",
                totalLines,
                successCount: completedLines,
                translations: result.translations,
                success: result.success,
              });

              logInfo(requestId, `SSE: Translate stream complete`, { 
                completedLines,
                totalLines,
                success: result.success,
              });
            } catch (err) {
              logError(requestId, "SSE: Translation stream failed", err);
              sendEvent({
                type: "error",
                error: err instanceof Error ? err.message : "Unknown error",
              });
            }
            
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
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        });
      }

      // =======================================================================
      // Handle furigana-stream action - SSE streaming with line-by-line updates
      // Uses streamText for real-time line emission as AI generates each line
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

        const totalLines = song.lyrics.parsedLines.length;

        logInfo(requestId, `Starting furigana SSE stream (line-by-line)`, { 
          totalLines,
        });

        // Create SSE stream with line-by-line updates
        const encoder = new TextEncoder();
        let streamClosed = false;
        
        const stream = new ReadableStream({
          async start(controller) {
            const allFurigana: Array<Array<{ text: string; reading?: string }>> = 
              new Array(totalLines).fill(null).map(() => []);
            let completedLines = 0;

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
              totalLines,
            });

            // Prepare lines for furigana
            const lines: LyricLine[] = song.lyrics!.parsedLines!.map(line => ({
              words: line.words,
              startTimeMs: line.startTimeMs,
            }));

            try {
              // Use streamFurigana with line callback
              const result = await streamFurigana(
                lines,
                requestId,
                (lineIndex: number, segments: FuriganaSegment[]) => {
                  if (streamClosed) return;
                  
                  allFurigana[lineIndex] = segments;
                  completedLines++;
                  
                  // Emit line event immediately
                  sendEvent({
                    type: "line",
                    lineIndex,
                    furigana: segments,
                    progress: Math.round((completedLines / totalLines) * 100),
                  });
                }
              );

              // Save complete furigana to main document
              if (result.success) {
                try {
                  await saveFurigana(redis, songId, result.furigana);
                  logInfo(requestId, `SSE: Furigana complete - saved to main document`);
                } catch (err) {
                  logError(requestId, "SSE: Failed to save furigana", err);
                }
              }

              sendEvent({
                type: "complete",
                totalLines,
                successCount: completedLines,
                furigana: result.furigana,
                success: result.success,
              });

              logInfo(requestId, `SSE: Furigana stream complete`, { 
                completedLines,
                totalLines,
                success: result.success,
              });
            } catch (err) {
              logError(requestId, "SSE: Furigana stream failed", err);
              sendEvent({
                type: "error",
                error: err instanceof Error ? err.message : "Unknown error",
              });
            }
            
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
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": effectiveOrigin!,
          },
        });
      }

      // =======================================================================
      // Handle soramimi-stream action - SSE streaming with line-by-line updates
      // Uses streamText for real-time line emission as AI generates each line
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

        // Check if already cached in main document (and not forcing regeneration)
        if (!force && song.soramimi && song.soramimi.length > 0) {
          logInfo(requestId, "Returning cached soramimi via SSE");
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
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
              "X-Accel-Buffering": "no",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          });
        }

        const totalLines = song.lyrics.parsedLines.length;

        logInfo(requestId, `Starting soramimi SSE stream (line-by-line)`, { 
          totalLines,
        });

        // Create SSE stream with line-by-line updates
        const encoder = new TextEncoder();
        let streamClosed = false;
        
        const stream = new ReadableStream({
          async start(controller) {
            const allSoramimi: Array<Array<{ text: string; reading?: string }>> = 
              new Array(totalLines).fill(null).map(() => []);
            let completedLines = 0;

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
              totalLines,
            });

            // Prepare lines for soramimi
            const lines: LyricLine[] = song.lyrics!.parsedLines!.map(line => ({
              words: line.words,
              startTimeMs: line.startTimeMs,
            }));

            try {
              // Use streamSoramimi with line callback
              const result = await streamSoramimi(
                lines,
                requestId,
                (lineIndex: number, segments: FuriganaSegment[]) => {
                  if (streamClosed) return;
                  
                  allSoramimi[lineIndex] = segments;
                  completedLines++;
                  
                  // Emit line event immediately
                  sendEvent({
                    type: "line",
                    lineIndex,
                    soramimi: segments,
                    progress: Math.round((completedLines / totalLines) * 100),
                  });
                }
              );

              // Save complete soramimi to main document
              if (result.success) {
                try {
                  await saveSoramimi(redis, songId, result.segments);
                  logInfo(requestId, `SSE: Soramimi complete - saved to main document`);
                } catch (err) {
                  logError(requestId, "SSE: Failed to save soramimi", err);
                }
              }

              sendEvent({
                type: "complete",
                totalLines,
                successCount: completedLines,
                soramimi: result.segments,
                success: result.success,
              });

              logInfo(requestId, `SSE: Soramimi stream complete`, { 
                completedLines,
                totalLines,
                success: result.success,
              });
            } catch (err) {
              logError(requestId, "SSE: Soramimi stream failed", err);
              sendEvent({
                type: "error",
                error: err instanceof Error ? err.message : "Unknown error",
              });
            }
            
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
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
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
