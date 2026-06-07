import * as RateLimit from "../../_utils/_rate-limit.js";
import { getClientIp } from "../../_utils/_rate-limit.js";
import { getSong, saveTranslation, canModifySong } from "../../_utils/_song-service.js";
import { TranslateStreamSchema } from "../_constants.js";
import { parseLyricsContent, buildChineseTranslationFromKrc, isChineseTraditional, getTranslationSystemPrompt } from "../_lyrics.js";
import { msToLrcTime, type LyricLine } from "../_utils.js";
import { RATE_LIMITS, sendSSEResponse, type SongHandlerContext } from "./_context.js";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function handleTranslateStream(
  ctx: SongHandlerContext,
  bodyObj: Record<string, unknown>
): Promise<void> {
  const { req, res, redis, logger, songId, requestId, user, effectiveOrigin, jsonResponse, errorResponse } = ctx;
  const username = user?.username || null;
  const requestIp = getClientIp(req);
  const rateLimitUser = username?.toLowerCase() || requestIp;

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
      if (!username) {
        return errorResponse("Unauthorized - authentication required to force refresh translation", 401);
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
    if (effectiveOrigin) {
      res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
    }
  
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
  
      // Use streamText with GPT-5.4
      const result = streamText({
        model: openai("gpt-5.4"),
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
