import * as RateLimit from "../../_utils/_rate-limit.js";
import { getClientIp } from "../../_utils/_rate-limit.js";
import { getSong, saveFurigana, canModifySong } from "../../_utils/_song-service.js";
import { FuriganaStreamSchema } from "../_constants.js";
import { parseLyricsContent } from "../_lyrics.js";
import { parseRubyMarkup, normalizeFuriganaSegments, lineNeedsFuriganaGeneration, FURIGANA_STREAM_SYSTEM_PROMPT } from "../_furigana.js";
import { type LyricLine } from "../_utils.js";
import { RATE_LIMITS, sendSSEResponse, type SongHandlerContext } from "./_context.js";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function handleFuriganaStream(
  ctx: SongHandlerContext,
  bodyObj: Record<string, unknown>
): Promise<void> {
  const { req, res, redis, logger, songId, requestId, user, effectiveOrigin, jsonResponse, errorResponse } = ctx;
  const username = user?.username || null;
  const requestIp = getClientIp(req);
  const rateLimitUser = username?.toLowerCase() || requestIp;

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
      if (!username) {
        return errorResponse("Unauthorized - authentication required to force refresh furigana", 401);
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
        furigana: song.furigana.map((segments) => normalizeFuriganaSegments(segments)),
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
  
    // Build index mapping: lines that need AI (kanji, Latin, Hangul, etc.); kana-only lines skip
    const lineInfo = lines.map((line, originalIndex) => ({
      line,
      originalIndex,
      needsFurigana: lineNeedsFuriganaGeneration(line.words),
    }));
    const linesNeedingFurigana = lineInfo.filter((info) => info.needsFurigana);
  
    // Build numbered text input for AI
    const textsToProcess = linesNeedingFurigana.map((info, i) => `${i + 1}: ${info.line.words}`).join("\n");
  
    // Use native SSE streaming for custom events
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (effectiveOrigin) {
      res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
    }
  
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
  
      // Emit kana-only / empty lines immediately (no AI)
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
  
      // If every line is kana-only, we're done
      if (linesNeedingFurigana.length === 0) {
        logger.info(`No lines need furigana generation, skipping AI`);
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
            const segments = normalizeFuriganaSegments(parseRubyMarkup(content));
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
  
      const result = streamText({
        model: openai("gpt-5.4"),
        messages: [
          { role: "system", content: FURIGANA_STREAM_SYSTEM_PROMPT },
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
