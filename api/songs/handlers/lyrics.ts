import * as RateLimit from "../../_utils/_rate-limit.js";
import { getClientIp } from "../../_utils/_rate-limit.js";
import {
  getSong,
  saveLyrics,
  saveTranslation,
  canModifySong,
  type LyricsSource,
  type LyricsContent,
} from "../../_utils/_song-service.js";
import { FetchLyricsSchema, SearchLyricsSchema } from "../_constants.js";
import { stripParentheses, parseYouTubeTitleWithAI } from "../_utils.js";
import { searchKugou, fetchLyricsFromKugou, fetchCoverUrl } from "../_kugou.js";
import {
  isChineseTraditional,
  parseLyricsContent,
  buildChineseTranslationFromKrc,
} from "../_lyrics.js";
import { lyricsAreMostlyChinese, normalizeFuriganaSegments } from "../_furigana.js";
import { RATE_LIMITS, type SongHandlerContext } from "./_context.js";

export async function handleSearchLyrics(
  ctx: SongHandlerContext,
  bodyObj: Record<string, unknown>
): Promise<void> {
  const { req, redis, logger, songId, requestId, jsonResponse, errorResponse } = ctx;
  const requestIp = getClientIp(req);

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

export async function handleFetchLyrics(
  ctx: SongHandlerContext,
  bodyObj: Record<string, unknown>
): Promise<void> {
  const { req, redis, logger, songId, requestId, user, jsonResponse, errorResponse } = ctx;
  const username = user?.username || null;
  const rateLimitUser = username?.toLowerCase() || getClientIp(req);

    const isAuthenticatedRyo = username?.toLowerCase() === "ryo";
    if (!isAuthenticatedRyo) {
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
    } else {
      logger.info("Rate limit bypassed for authenticated ryo user (fetch-lyrics)");
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
      const allowAnonymousRefresh = isPublicSong && !username;
      if (!allowAnonymousRefresh) {
        if (!username) {
          return errorResponse("Unauthorized - authentication required to change lyrics source or force refresh", 401);
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
          ...(hasFurigana
            ? { data: song.furigana!.map((segments) => normalizeFuriganaSegments(segments)) }
            : {}),
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
          coverColor: song.coverColor,
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
        coverColor: savedSong.coverColor,
        lyricsSource: savedSong.lyricsSource,
      };
    }
    
    return jsonResponse(response);
}
