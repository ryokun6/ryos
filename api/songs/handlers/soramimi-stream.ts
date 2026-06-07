import * as RateLimit from "../../_utils/_rate-limit.js";
import { getClientIp } from "../../_utils/_rate-limit.js";
import { getSong, saveSoramimi, canModifySong } from "../../_utils/_song-service.js";
import { SoramimiStreamSchema } from "../_constants.js";
import { parseLyricsContent } from "../_lyrics.js";
import { lyricsAreMostlyChinese } from "../_furigana.js";
import {
  SORAMIMI_SYSTEM_PROMPT,
  SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT,
  SORAMIMI_ENGLISH_SYSTEM_PROMPT,
  SORAMIMI_ENGLISH_WITH_FURIGANA_PROMPT,
  convertLinesToAnnotatedText,
  parseSoramimiRubyMarkup,
  fillMissingReadings,
  cleanSoramimiReading,
} from "../_soramimi.js";
import { type LyricLine } from "../_utils.js";
import { RATE_LIMITS, sendSSEResponse, type SongHandlerContext } from "./_context.js";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function handleSoramimiStream(
  ctx: SongHandlerContext,
  bodyObj: Record<string, unknown>
): Promise<void> {
  const { req, res, redis, logger, songId, requestId, user, effectiveOrigin, jsonResponse, errorResponse } = ctx;
  const username = user?.username || null;
  const requestIp = getClientIp(req);
  const rateLimitUser = username?.toLowerCase() || requestIp;

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
      if (!username) {
        return errorResponse("Unauthorized - authentication required to force refresh soramimi", 401);
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
      const cleanedSoramimi = cachedSoramimi.map((lineSegments) =>
        lineSegments.reduce<Array<(typeof lineSegments)[number]>>((acc, seg) => {
          const candidate =
            seg.reading && targetLanguage === "zh-TW"
              ? (() => {
                  const cleanedReading = cleanSoramimiReading(seg.reading);
                  return cleanedReading
                    ? { ...seg, reading: cleanedReading }
                    : { text: seg.text };
                })()
              : seg;
  
          if (candidate.reading || !containsKoreanOrJapanese(candidate.text)) {
            acc.push(candidate);
          }
          return acc;
        }, [])
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
    if (effectiveOrigin) {
      res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
    }
  
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
        model: openai("gpt-5.4"),
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
