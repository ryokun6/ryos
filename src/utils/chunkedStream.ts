/**
 * Client-side utilities for SSE streaming API calls
 * Server processes lyrics line-by-line and streams updates in real-time
 */

import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import { createClientLogger } from "@/utils/logger";

// =============================================================================
// Constants
// =============================================================================

const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const streamLog = createClientLogger("LyricsStream");

type LyricsStreamKind = "translation" | "furigana" | "soramimi";

class NonRetryableStreamError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "NonRetryableStreamError";
  }
}

function isNonRetryableHttpStatus(status: number): boolean {
  return status >= 400 && status < 500;
}

function getObjectProperty(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function getJsonErrorMessage(value: unknown): string | null {
  const error = getObjectProperty(value, "error");
  return typeof error === "string" && error.trim() ? error : null;
}

function isSkippedJsonResponse(value: unknown): boolean {
  return getObjectProperty(value, "skipped") === true;
}

async function createStreamHttpError(response: Response): Promise<Error> {
  let message = `SSE request failed: ${response.status}`;
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    try {
      const json = await response.json();
      message = getJsonErrorMessage(json) ?? message;
    } catch {
      // Keep the status-based message if the error body is malformed.
    }
  }
  if (isNonRetryableHttpStatus(response.status)) {
    return new NonRetryableStreamError(message, response.status);
  }
  return new Error(message);
}

function createTerminalJsonStreamError(value: unknown): NonRetryableStreamError {
  return new NonRetryableStreamError(
    getJsonErrorMessage(value) ?? "Unknown error"
  );
}

function logCallbackError(
  stream: LyricsStreamKind,
  stage: string,
  error: unknown
): void {
  streamLog.warn("Lyrics stream callback failed", { stream, stage, error });
}

function logParseError(
  stream: LyricsStreamKind,
  line: string,
  error: unknown
): void {
  streamLog.warn("Could not parse lyrics stream event", {
    stream,
    lineLength: line.length,
    error,
  });
}

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
  auth?: { username: string; isAuthenticated: boolean };
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
  streamLog.debug("Preparing translation stream", {
    songId,
    language,
    force: Boolean(force),
    hasPrefetchedData: Boolean(prefetchedInfo),
    hasAuthenticatedUser: Boolean(auth?.username && auth.isAuthenticated),
  });

  // If we have complete cached data from prefetch and not forcing, use it
  if (!force && prefetchedInfo?.cached && prefetchedInfo.lrc) {
    try {
      onProgress?.({ completedLines: prefetchedInfo.totalLines, totalLines: prefetchedInfo.totalLines, percentage: 100 });
    } catch (callbackErr) {
      logCallbackError("translation", "prefetched progress", callbackErr);
    }
    streamLog.debug("Using prefetched translation", {
      songId,
      language,
      totalLines: prefetchedInfo.totalLines,
    });
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
      streamLog.debug("Opening translation stream request", {
        songId,
        language,
        attempt: attempt + 1,
      });
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      const response = await abortableFetch(getApiUrl(`/api/songs/${songId}`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "translate-stream",
          language,
          force,
        }),
        signal: controller.signal,
        timeout: 300000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });

      if (!response.ok) {
        throw await createStreamHttpError(response);
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const json = await response.json();
        throw createTerminalJsonStreamError(json);
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
        const finalResult = { current: null as TranslationResult | null };

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
                  logCallbackError("translation", "start progress", callbackErr);
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
                  logCallbackError("translation", "line update", callbackErr);
                }
                break;

              case "error":
                streamLog.warn("Translation stream reported an error", {
                  songId,
                  language,
                  error: eventData.error || rawData.error,
                });
                break;

              case "cached":
              {
                const cachedTranslations = parseLrcToTranslations(eventData.translation);
                finalResult.current = {
                  data: cachedTranslations,
                  success: true,
                };
                try {
                  onProgress?.({ completedLines: cachedTranslations.length, totalLines: cachedTranslations.length, percentage: 100 });
                } catch (callbackErr) {
                  logCallbackError(
                    "translation",
                    "cached progress",
                    callbackErr
                  );
                }
                break;
              }

              case "complete":
                finalResult.current = {
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
                  logCallbackError(
                    "translation",
                    "completion progress",
                    callbackErr
                  );
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
            logParseError("translation", line, e);
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

        if (finalResult.current) {
          streamLog.debug("Translation stream completed", {
            songId,
            language,
            totalLines,
            completedLines,
            success: finalResult.current.success,
          });
          return finalResult.current;
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
      if (err instanceof NonRetryableStreamError) {
        streamLog.warn("Translation stream failed without retry", {
          error: err,
          songId,
          language,
          status: err.status,
        });
        throw err;
      }
      if (attempt === MAX_RETRIES) {
        streamLog.error("Translation stream failed", {
          error: err,
          songId,
          language,
          attempts: attempt + 1,
        });
        throw err; // Final attempt failed
      }
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      streamLog.warn("Retrying translation stream", {
        error: err,
        songId,
        language,
        retryAttempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        delayMs: delay,
      });
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
  auth?: { username: string; isAuthenticated: boolean };
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
  streamLog.debug("Preparing furigana stream", {
    songId,
    force: Boolean(force),
    hasPrefetchedData: Boolean(prefetchedInfo),
    hasAuthenticatedUser: Boolean(auth?.username && auth.isAuthenticated),
  });

  // If we have complete cached data from prefetch and not forcing, use it
  if (!force && prefetchedInfo?.cached && prefetchedInfo.data) {
    try {
      onProgress?.({ completedLines: prefetchedInfo.totalLines, totalLines: prefetchedInfo.totalLines, percentage: 100 });
    } catch (callbackErr) {
      logCallbackError("furigana", "prefetched progress", callbackErr);
    }
    streamLog.debug("Using prefetched furigana", {
      songId,
      totalLines: prefetchedInfo.totalLines,
    });
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
      streamLog.debug("Opening furigana stream request", {
        songId,
        attempt: attempt + 1,
      });
      const furiganaHeaders: Record<string, string> = { "Content-Type": "application/json" };

      const response = await abortableFetch(getApiUrl(`/api/songs/${songId}`), {
        method: "POST",
        headers: furiganaHeaders,
        body: JSON.stringify({
          action: "furigana-stream",
          force,
        }),
        signal: controller.signal,
        timeout: 300000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });

      if (!response.ok) {
        throw await createStreamHttpError(response);
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const json = await response.json();
        throw createTerminalJsonStreamError(json);
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
        const finalResult = { current: null as FuriganaResult | null };

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
                  logCallbackError("furigana", "start progress", callbackErr);
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
                  logCallbackError("furigana", "line update", callbackErr);
                }
                break;

              case "error":
                streamLog.warn("Furigana stream reported an error", {
                  songId,
                  error: eventData.error || rawData.error,
                });
                break;

              case "cached":
                finalResult.current = {
                  data: eventData.furigana,
                  success: true,
                };
                try {
                  onProgress?.({ completedLines: eventData.furigana.length, totalLines: eventData.furigana.length, percentage: 100 });
                } catch (callbackErr) {
                  logCallbackError("furigana", "cached progress", callbackErr);
                }
                break;

              case "complete":
                finalResult.current = {
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
                  logCallbackError(
                    "furigana",
                    "completion progress",
                    callbackErr
                  );
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
            logParseError("furigana", line, e);
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

        if (finalResult.current) {
          streamLog.debug("Furigana stream completed", {
            songId,
            totalLines,
            completedLines,
            success: finalResult.current.success,
          });
          return finalResult.current;
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
      if (err instanceof NonRetryableStreamError) {
        streamLog.warn("Furigana stream failed without retry", {
          error: err,
          songId,
          status: err.status,
        });
        throw err;
      }
      if (attempt === MAX_RETRIES) {
        streamLog.error("Furigana stream failed", {
          error: err,
          songId,
          attempts: attempt + 1,
        });
        throw err; // Final attempt failed
      }
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      streamLog.warn("Retrying furigana stream", {
        error: err,
        songId,
        retryAttempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        delayMs: delay,
      });
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
  auth?: { username: string; isAuthenticated: boolean };
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
  const {
    force,
    signal,
    onProgress,
    onLine,
    prefetchedInfo,
    furigana,
    targetLanguage = "zh-TW",
    auth,
  } = options;
  streamLog.debug("Preparing soramimi stream", {
    songId,
    targetLanguage,
    force: Boolean(force),
    hasPrefetchedData: Boolean(prefetchedInfo),
    hasFurigana: Boolean(furigana?.length),
    hasAuthenticatedUser: Boolean(auth?.username && auth.isAuthenticated),
  });

  // If we have complete cached data from prefetch and not forcing, use it
  if (!force && prefetchedInfo?.cached && prefetchedInfo.data) {
    try {
      onProgress?.({ completedLines: prefetchedInfo.totalLines, totalLines: prefetchedInfo.totalLines, percentage: 100 });
    } catch (callbackErr) {
      logCallbackError("soramimi", "prefetched progress", callbackErr);
    }
    streamLog.debug("Using prefetched soramimi", {
      songId,
      targetLanguage,
      totalLines: prefetchedInfo.totalLines,
    });
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
      logCallbackError("soramimi", "skipped progress", callbackErr);
    }
    streamLog.debug("Soramimi generation was skipped", {
      songId,
      targetLanguage,
      reason: prefetchedInfo.skipReason,
    });
    return { data: [], success: true };
  }

  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let buffer = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      streamLog.debug("Opening soramimi stream request", {
        songId,
        targetLanguage,
        attempt: attempt + 1,
      });
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

      const response = await abortableFetch(getApiUrl(`/api/songs/${songId}`), {
        method: "POST",
        headers: soramimiHeaders,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        timeout: 300000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });

      if (!response.ok) {
        throw await createStreamHttpError(response);
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const json = await response.json();
        if (isSkippedJsonResponse(json)) {
          try {
            onProgress?.({ completedLines: 0, totalLines: 0, percentage: 100 });
          } catch (callbackErr) {
            logCallbackError("soramimi", "server-skipped progress", callbackErr);
          }
          return { data: [], success: true };
        }
        throw createTerminalJsonStreamError(json);
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
        const finalSoramimi = { current: null as SoramimiResult | null };

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
                  logCallbackError("soramimi", "start progress", callbackErr);
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
                  logCallbackError("soramimi", "line update", callbackErr);
                }
                break;

              case "error":
                streamLog.warn("Soramimi stream reported an error", {
                  songId,
                  targetLanguage,
                  error: eventData.error || rawData.error,
                });
                break;

              case "cached":
                finalSoramimi.current = {
                  data: eventData.soramimi,
                  success: true,
                };
                try {
                  onProgress?.({ completedLines: eventData.soramimi.length, totalLines: eventData.soramimi.length, percentage: 100 });
                } catch (callbackErr) {
                  logCallbackError("soramimi", "cached progress", callbackErr);
                }
                break;

              case "complete":
                finalSoramimi.current = {
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
                  logCallbackError(
                    "soramimi",
                    "completion progress",
                    callbackErr
                  );
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
            logParseError("soramimi", line, e);
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

        if (finalSoramimi.current) {
          streamLog.debug("Soramimi stream completed", {
            songId,
            targetLanguage,
            totalLines,
            completedLines,
            success: finalSoramimi.current.success,
          });
          return finalSoramimi.current;
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
      if (err instanceof NonRetryableStreamError) {
        streamLog.warn("Soramimi stream failed without retry", {
          error: err,
          songId,
          targetLanguage,
          status: err.status,
        });
        throw err;
      }
      if (attempt === MAX_RETRIES) {
        streamLog.error("Soramimi stream failed", {
          error: err,
          songId,
          targetLanguage,
          attempts: attempt + 1,
        });
        throw err; // Final attempt failed
      }
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      streamLog.warn("Retrying soramimi stream", {
        error: err,
        songId,
        targetLanguage,
        retryAttempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        delayMs: delay,
      });
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
