/**
 * Client-side utilities for SSE streaming API calls
 * Server processes lyrics line-by-line and streams updates in real-time
 */

import { getApiUrl } from "@/utils/platform";

// =============================================================================
// Constants
// =============================================================================

const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

// =============================================================================
// Types
// =============================================================================

export interface LineProgress {
  completedLines: number;
  totalLines: number;
  percentage: number;
}

/** Pre-fetched translation info from initial lyrics fetch */
export interface TranslationStreamInfo {
  totalLines: number;
  cached: boolean;
  /** Cached translation LRC (only present if cached=true) */
  lrc?: string;
}

/** Pre-fetched furigana info from initial lyrics fetch */
export interface FuriganaStreamInfo {
  totalLines: number;
  cached: boolean;
  /** Cached furigana data (only present if cached=true) */
  data?: Array<Array<{ text: string; reading?: string }>>;
}

/** Pre-fetched soramimi info from initial lyrics fetch */
export interface SoramimiStreamInfo {
  totalLines: number;
  cached: boolean;
  /** Cached soramimi data (only present if cached=true) */
  data?: Array<Array<{ text: string; reading?: string }>>;
  /** Target language this cached data was generated for */
  targetLanguage?: "zh-TW" | "en";
  /** Whether soramimi was skipped (e.g., for Chinese lyrics) */
  skipped?: boolean;
  /** Reason for skipping */
  skipReason?: string;
}

// Legacy type aliases for backwards compatibility
/** @deprecated Use TranslationStreamInfo instead */
export type TranslationChunkInfo = TranslationStreamInfo;
/** @deprecated Use FuriganaStreamInfo instead */
export type FuriganaChunkInfo = FuriganaStreamInfo;
/** @deprecated Use SoramimiStreamInfo instead */
export type SoramimiChunkInfo = SoramimiStreamInfo;

// =============================================================================
// Translation SSE Processing (Line-by-line streaming)
// =============================================================================

export interface ProcessTranslationOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: LineProgress) => void;
  onLine?: (lineIndex: number, translation: string) => void;
  /** Pre-fetched info from initial lyrics request */
  prefetchedInfo?: TranslationStreamInfo;
  /** Auth credentials (required for force refresh) */
  auth?: { username: string; authToken: string };
}

/** Result of translation processing */
export interface TranslationResult {
  /** The translations array */
  data: string[];
  /** Whether the result was successful */
  success: boolean;
}

/**
 * Process translation using Server-Sent Events (SSE).
 * The server streams each translated line in real-time as it's generated.
 */
export async function processTranslationSSE(
  songId: string,
  language: string,
  options: ProcessTranslationOptions = {}
): Promise<TranslationResult> {
  const { force, signal, onProgress, onLine, prefetchedInfo, auth } = options;

  // If we have complete cached data from prefetch and not forcing, use it
  if (!force && prefetchedInfo?.cached && prefetchedInfo.lrc) {
    try {
      onProgress?.({ completedLines: prefetchedInfo.totalLines, totalLines: prefetchedInfo.totalLines, percentage: 100 });
    } catch (callbackErr) {
      console.warn("SSE: Callback error:", callbackErr);
    }
    return {
      data: parseLrcToTranslations(prefetchedInfo.lrc),
      success: true,
    };
  }

  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let buffer = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth?.username && auth?.authToken) {
        headers["Authorization"] = `Bearer ${auth.authToken}`;
        headers["X-Username"] = auth.username;
      }

      const response = await fetch(getApiUrl(`/api/songs/${songId}`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "translate-stream",
          language,
          force,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE request failed: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const json = await response.json();
        throw new Error(json.error || "Unknown error");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      try {
        const decoder = new TextDecoder();
        buffer = "";
        let totalLines = 0;
        let completedLines = 0;
        let finalResult: TranslationResult | null = null;

        const processLine = (line: string) => {
          if (!line.startsWith("data: ")) return;
          
          try {
            const rawData = JSON.parse(line.slice(6));
            
            // Handle both old format (type: "start") and new AI SDK format (type: "data-start")
            const eventType = rawData.type as string;
            const isDataEvent = eventType.startsWith("data-");
            const normalizedType = isDataEvent ? eventType.slice(5) : eventType;
            const eventData = isDataEvent ? rawData.data : rawData;

            switch (normalizedType) {
              case "start":
                totalLines = eventData.totalLines;
                try {
                  onProgress?.({ completedLines: 0, totalLines, percentage: 0 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "line":
                completedLines++;
                try {
                  onProgress?.({
                    completedLines,
                    totalLines,
                    percentage: eventData.progress,
                  });
                  onLine?.(eventData.lineIndex, eventData.translation);
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "error":
                console.warn("SSE: Translation stream error:", eventData.error || rawData.error);
                break;

              case "cached":
              {
                const cachedTranslations = parseLrcToTranslations(eventData.translation);
                finalResult = { 
                  data: cachedTranslations,
                  success: true,
                };
                try {
                  onProgress?.({ completedLines: cachedTranslations.length, totalLines: cachedTranslations.length, percentage: 100 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;
              }

              case "complete":
                finalResult = {
                  data: eventData.translations,
                  success: eventData.success,
                };
                try {
                  onProgress?.({
                    completedLines: eventData.totalLines,
                    totalLines: eventData.totalLines,
                    percentage: 100,
                  });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;
                
              // Ignore AI SDK internal events
              case "start-step":
              case "finish-step":
              case "finish":
              case "text-start":
              case "text-delta":
              case "text-end":
                break;
            }
          } catch (e) {
            console.warn("SSE: Failed to parse event:", line, e);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            if (buffer.trim()) {
              for (const line of buffer.split("\n")) {
                processLine(line.trim());
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          // Check buffer size limit
          if (buffer.length > MAX_BUFFER_SIZE) {
            reader.cancel();
            throw new Error("SSE buffer exceeded maximum size");
          }
          
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            processLine(line.trim());
          }
        }

        if (finalResult) {
          return finalResult;
        } else {
          throw new Error("SSE stream ended without complete event");
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      buffer = ""; // Clear buffer on error
      
      if (err instanceof Error && err.name === "AbortError") {
        throw err; // Don't retry on abort
      }
      if (attempt === MAX_RETRIES) {
        console.error("Translation SSE error:", err);
        throw err; // Final attempt failed
      }
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      console.warn(`SSE: Retry attempt ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // This should never be reached due to the throw in the loop
  throw new Error("SSE request failed after all retries");
}

// =============================================================================
// Furigana SSE Processing (Line-by-line streaming)
// =============================================================================

export interface ProcessFuriganaOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: LineProgress) => void;
  onLine?: (lineIndex: number, furigana: Array<{ text: string; reading?: string }>) => void;
  /** Pre-fetched info from initial lyrics request */
  prefetchedInfo?: FuriganaStreamInfo;
  /** Auth credentials (required for force refresh) */
  auth?: { username: string; authToken: string };
}

/** Result of furigana processing */
export interface FuriganaResult {
  /** The furigana data */
  data: Array<Array<{ text: string; reading?: string }>>;
  /** Whether the result was successful */
  success: boolean;
}

/**
 * Process furigana using Server-Sent Events (SSE).
 * The server streams each furigana line in real-time as it's generated.
 */
export async function processFuriganaSSE(
  songId: string,
  options: ProcessFuriganaOptions = {}
): Promise<FuriganaResult> {
  const { force, signal, onProgress, onLine, prefetchedInfo, auth } = options;

  // If we have complete cached data from prefetch and not forcing, use it
  if (!force && prefetchedInfo?.cached && prefetchedInfo.data) {
    try {
      onProgress?.({ completedLines: prefetchedInfo.totalLines, totalLines: prefetchedInfo.totalLines, percentage: 100 });
    } catch (callbackErr) {
      console.warn("SSE: Callback error:", callbackErr);
    }
    return {
      data: prefetchedInfo.data,
      success: true,
    };
  }

  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let buffer = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const furiganaHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (auth?.username && auth?.authToken) {
        furiganaHeaders["Authorization"] = `Bearer ${auth.authToken}`;
        furiganaHeaders["X-Username"] = auth.username;
      }

      const response = await fetch(getApiUrl(`/api/songs/${songId}`), {
        method: "POST",
        headers: furiganaHeaders,
        body: JSON.stringify({
          action: "furigana-stream",
          force,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE request failed: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const json = await response.json();
        throw new Error(json.error || "Unknown error");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      try {
        const decoder = new TextDecoder();
        buffer = "";
        let totalLines = 0;
        let completedLines = 0;
        let finalResult: FuriganaResult | null = null;

        const processLine = (line: string) => {
          if (!line.startsWith("data: ")) return;
          
          try {
            const rawData = JSON.parse(line.slice(6));
            
            // Handle both old format (type: "start") and new AI SDK format (type: "data-start")
            const eventType = rawData.type as string;
            const isDataEvent = eventType.startsWith("data-");
            const normalizedType = isDataEvent ? eventType.slice(5) : eventType;
            const eventData = isDataEvent ? rawData.data : rawData;

            switch (normalizedType) {
              case "start":
                totalLines = eventData.totalLines;
                try {
                  onProgress?.({ completedLines: 0, totalLines, percentage: 0 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "line":
                completedLines++;
                try {
                  onProgress?.({
                    completedLines,
                    totalLines,
                    percentage: eventData.progress,
                  });
                  onLine?.(eventData.lineIndex, eventData.furigana);
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "error":
                console.warn("SSE: Furigana stream error:", eventData.error || rawData.error);
                break;

              case "cached":
                finalResult = { data: eventData.furigana, success: true };
                try {
                  onProgress?.({ completedLines: eventData.furigana.length, totalLines: eventData.furigana.length, percentage: 100 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "complete":
                finalResult = {
                  data: eventData.furigana,
                  success: eventData.success,
                };
                try {
                  onProgress?.({
                    completedLines: eventData.totalLines,
                    totalLines: eventData.totalLines,
                    percentage: 100,
                  });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;
                
              // Ignore AI SDK internal events
              case "start-step":
              case "finish-step":
              case "finish":
              case "text-start":
              case "text-delta":
              case "text-end":
                break;
            }
          } catch (e) {
            console.warn("SSE: Failed to parse event:", line, e);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            if (buffer.trim()) {
              for (const line of buffer.split("\n")) {
                processLine(line.trim());
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          // Check buffer size limit
          if (buffer.length > MAX_BUFFER_SIZE) {
            reader.cancel();
            throw new Error("SSE buffer exceeded maximum size");
          }
          
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            processLine(line.trim());
          }
        }

        if (finalResult) {
          return finalResult;
        } else {
          throw new Error("SSE stream ended without complete event");
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      buffer = ""; // Clear buffer on error
      
      if (err instanceof Error && err.name === "AbortError") {
        throw err; // Don't retry on abort
      }
      if (attempt === MAX_RETRIES) {
        console.error("Furigana SSE error:", err);
        throw err; // Final attempt failed
      }
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      console.warn(`SSE: Retry attempt ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // This should never be reached due to the throw in the loop
  throw new Error("SSE request failed after all retries");
}

// =============================================================================
// Soramimi SSE Processing (Line-by-line streaming)
// =============================================================================

export interface ProcessSoramimiOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: LineProgress) => void;
  onLine?: (lineIndex: number, soramimi: Array<{ text: string; reading?: string }>) => void;
  /** Pre-fetched info from initial lyrics request */
  prefetchedInfo?: SoramimiStreamInfo;
  /**
   * Optional furigana data for Japanese songs. 
   * When provided, the API will use this to generate more accurate soramimi
   * by knowing the correct pronunciation of kanji characters.
   * Format: 2D array of segments [{text, reading?}] indexed by line
   */
  furigana?: Array<Array<{ text: string; reading?: string }>>;
  /**
   * Target language for soramimi output:
   * - "zh-TW": Chinese characters (空耳 - traditional style)
   * - "en": English phonetic approximations (misheard lyrics)
   * Defaults to "zh-TW" if not specified.
   */
  targetLanguage?: "zh-TW" | "en";
  /** Auth credentials (required for force refresh) */
  auth?: { username: string; authToken: string };
}

/** Result of soramimi processing */
export interface SoramimiResult {
  /** The soramimi data */
  data: Array<Array<{ text: string; reading?: string }>>;
  /** Whether the result was successful */
  success: boolean;
}

/**
 * Process soramimi using Server-Sent Events (SSE).
 * The server streams each soramimi line in real-time as it's generated.
 */
export async function processSoramimiSSE(
  songId: string,
  options: ProcessSoramimiOptions = {}
): Promise<SoramimiResult> {
  const { force, signal, onProgress, onLine, prefetchedInfo, furigana, targetLanguage = "zh-TW", auth } = options;

  // If we have complete cached data from prefetch and not forcing, use it
  if (!force && prefetchedInfo?.cached && prefetchedInfo.data) {
    try {
      onProgress?.({ completedLines: prefetchedInfo.totalLines, totalLines: prefetchedInfo.totalLines, percentage: 100 });
    } catch (callbackErr) {
      console.warn("SSE: Callback error:", callbackErr);
    }
    return {
      data: prefetchedInfo.data,
      success: true,
    };
  }

  // If skipped (e.g., Chinese lyrics), return empty
  if (prefetchedInfo?.skipped) {
    try {
      onProgress?.({ completedLines: 0, totalLines: 0, percentage: 100 });
    } catch (callbackErr) {
      console.warn("SSE: Callback error:", callbackErr);
    }
    return { data: [], success: true };
  }

  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let buffer = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Build request body - include furigana if provided (for Japanese songs)
      const requestBody: Record<string, unknown> = {
        action: "soramimi-stream",
        force,
        targetLanguage,
      };
      
      // Only include furigana if it has actual reading data
      // This helps the AI know the correct pronunciation of kanji
      if (furigana && furigana.length > 0 && furigana.some(line => line.some(seg => seg.reading))) {
        requestBody.furigana = furigana;
      }
      
      const soramimiHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (auth?.username && auth?.authToken) {
        soramimiHeaders["Authorization"] = `Bearer ${auth.authToken}`;
        soramimiHeaders["X-Username"] = auth.username;
      }

      const response = await fetch(getApiUrl(`/api/songs/${songId}`), {
        method: "POST",
        headers: soramimiHeaders,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE request failed: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const json = await response.json();
        if (json.skipped) {
        try {
          onProgress?.({ completedLines: 0, totalLines: 0, percentage: 100 });
        } catch (callbackErr) {
          console.warn("SSE: Callback error:", callbackErr);
        }
        return { data: [], success: true };
      }
        throw new Error(json.error || "Unknown error");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      try {
        const decoder = new TextDecoder();
        buffer = "";
        let totalLines = 0;
        let completedLines = 0;
        let finalSoramimi: SoramimiResult | null = null;

        const processLine = (line: string) => {
          if (!line.startsWith("data: ")) return;
          
          try {
            const rawData = JSON.parse(line.slice(6));
            
            // Handle both old format (type: "start") and new AI SDK format (type: "data-start")
            const eventType = rawData.type as string;
            
            // AI SDK data-* events have nested data, extract it
            const isDataEvent = eventType.startsWith("data-");
            const normalizedType = isDataEvent ? eventType.slice(5) : eventType; // Remove "data-" prefix
            const eventData = isDataEvent ? rawData.data : rawData;

            switch (normalizedType) {
              case "start":
                totalLines = eventData.totalLines;
                try {
                  onProgress?.({ completedLines: 0, totalLines, percentage: 0 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "line":
                completedLines++;
                try {
                  onProgress?.({
                    completedLines,
                    totalLines,
                    percentage: eventData.progress,
                  });
                  onLine?.(eventData.lineIndex, eventData.soramimi);
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "error":
                console.warn("SSE: Soramimi stream error:", eventData.error || rawData.error);
                break;

              case "cached":
                finalSoramimi = { data: eventData.soramimi, success: true };
                try {
                  onProgress?.({ completedLines: eventData.soramimi.length, totalLines: eventData.soramimi.length, percentage: 100 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "complete":
                finalSoramimi = { 
                  data: eventData.soramimi, 
                  success: eventData.success,
                };
                try {
                  onProgress?.({
                    completedLines: eventData.totalLines,
                    totalLines: eventData.totalLines,
                    percentage: 100,
                  });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;
                
              // Ignore AI SDK internal events
              case "start-step":
              case "finish-step":
              case "finish":
              case "text-start":
              case "text-delta":
              case "text-end":
                // These are AI SDK internal events, ignore them
                break;
            }
          } catch (e) {
            console.warn("SSE: Failed to parse event:", line, e);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            if (buffer.trim()) {
              for (const line of buffer.split("\n")) {
                processLine(line.trim());
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          // Check buffer size limit
          if (buffer.length > MAX_BUFFER_SIZE) {
            reader.cancel();
            throw new Error("SSE buffer exceeded maximum size");
          }
          
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            processLine(line.trim());
          }
        }

        if (finalSoramimi) {
          return finalSoramimi;
        } else {
          throw new Error("SSE stream ended without complete event");
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      buffer = ""; // Clear buffer on error
      
      if (err instanceof Error && err.name === "AbortError") {
        throw err; // Don't retry on abort
      }
      if (attempt === MAX_RETRIES) {
        console.error("Soramimi SSE error:", err);
        throw err; // Final attempt failed
      }
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      console.warn(`SSE: Retry attempt ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // This should never be reached due to the throw in the loop
  throw new Error("SSE request failed after all retries");
}

// =============================================================================
// Utilities
// =============================================================================

/** Parse LRC format back to array of translation strings */
export function parseLrcToTranslations(lrc: string): string[] {
  const lines: string[] = [];
  const lineRegex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;

  for (const line of lrc.split("\n")) {
    const match = line.trim().match(lineRegex);
    if (match) {
      lines.push(match[4].trim());
    }
  }

  return lines;
}

/**
 * Check if a line is likely incomplete (has no readings when it should).
 * Used to detect lines that need resume.
 */
export function isIncompletesoramimiLine(
  segments: Array<{ text: string; reading?: string }>,
  originalText: string
): boolean {
  // Empty segments array means the line definitely needs regeneration
  if (!segments || segments.length === 0) {
    return true;
  }
  
  // If it's just a single segment with the original text and no reading,
  // and the original text contains non-English characters that should have readings
  if (segments.length === 1 && !segments[0].reading) {
    const text = segments[0].text;
    // Check if text matches original (fallback case)
    if (text === originalText) {
      // Check if the text contains Japanese/Korean characters that should have soramimi
      // Japanese: Hiragana, Katakana, Kanji
      // Korean: Hangul
      const hasNonEnglish = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\uAC00-\uD7AF]/.test(text);
      return hasNonEnglish;
    }
  }
  
  return false;
}
