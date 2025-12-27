/**
 * Client-side utilities for SSE streaming API calls
 * Server processes all chunks and saves results even if client disconnects
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

export interface ChunkProgress {
  completedChunks: number;
  totalChunks: number;
  percentage: number;
}

/** Pre-fetched translation info from initial lyrics fetch */
export interface TranslationChunkInfo {
  totalLines: number;
  totalChunks: number;
  chunkSize: number;
  cached: boolean;
  /** Cached translation LRC (only present if cached=true) */
  lrc?: string;
}

/** Pre-fetched furigana info from initial lyrics fetch */
export interface FuriganaChunkInfo {
  totalLines: number;
  totalChunks: number;
  chunkSize: number;
  cached: boolean;
  /** Cached furigana data (only present if cached=true) */
  data?: Array<Array<{ text: string; reading?: string }>>;
}

/** Pre-fetched soramimi info from initial lyrics fetch */
export interface SoramimiChunkInfo {
  totalLines: number;
  totalChunks: number;
  chunkSize: number;
  cached: boolean;
  /** Cached soramimi data (only present if cached=true) */
  data?: Array<Array<{ text: string; reading?: string }>>;
  /** Whether soramimi was skipped (e.g., for Chinese lyrics) */
  skipped?: boolean;
  /** Reason for skipping */
  skipReason?: string;
  /** Whether the cached data is partial (some lines failed) */
  isPartial?: boolean;
  /** Line indices that failed and need resume */
  failedLines?: number[];
}

// =============================================================================
// SSE Event Types
// =============================================================================

interface SSEStartEvent {
  type: "start";
  totalChunks: number;
  totalLines: number;
  chunkSize: number;
}

interface SSEChunkErrorEvent {
  type: "chunk_error";
  chunkIndex: number;
  startIndex: number;
  error: string;
  progress: number;
}

// Translation SSE events
interface TranslationChunkEvent {
  type: "chunk";
  chunkIndex: number;
  startIndex: number;
  translations: string[];
  progress: number;
}

interface TranslationCompleteEvent {
  type: "complete";
  totalChunks: number;
  successCount: number;
  failCount: number;
  cached: boolean;
  translations: string[];
}

interface TranslationCachedEvent {
  type: "cached";
  translation: string; // LRC format
}

type TranslationSSEEvent = SSEStartEvent | TranslationChunkEvent | TranslationCompleteEvent | TranslationCachedEvent | SSEChunkErrorEvent;

// Furigana SSE events
interface FuriganaChunkEvent {
  type: "chunk";
  chunkIndex: number;
  startIndex: number;
  furigana: Array<Array<{ text: string; reading?: string }>>;
  progress: number;
}

interface FuriganaCompleteEvent {
  type: "complete";
  totalChunks: number;
  successCount: number;
  failCount: number;
  cached: boolean;
  furigana: Array<Array<{ text: string; reading?: string }>>;
}

interface FuriganaCachedEvent {
  type: "cached";
  furigana: Array<Array<{ text: string; reading?: string }>>;
}

type FuriganaSSEEvent = SSEStartEvent | FuriganaChunkEvent | FuriganaCompleteEvent | FuriganaCachedEvent | SSEChunkErrorEvent;

// Soramimi SSE events
interface SoramimiChunkEvent {
  type: "chunk";
  chunkIndex: number;
  startIndex: number;
  soramimi: Array<Array<{ text: string; reading?: string }>>;
  progress: number;
}

interface SoramimiCompleteEvent {
  type: "complete";
  totalChunks: number;
  successCount: number;
  failCount: number;
  cached: boolean;
  soramimi: Array<Array<{ text: string; reading?: string }>>;
  /** Line indices that failed (for client to trigger resume) */
  failedLines?: number[];
}

interface SoramimiCachedEvent {
  type: "cached";
  soramimi: Array<Array<{ text: string; reading?: string }>>;
}

// Soramimi Resume SSE events
interface SoramimiResumeStartEvent {
  type: "start";
  totalChunks: number;
  totalLines: number;
  chunkSize: number;
  isResume: boolean;
}

interface SoramimiResumeChunkEvent {
  type: "chunk";
  chunkIndex: number;
  /** Original line indices that were regenerated */
  lineIndices: number[];
  /** Regenerated soramimi keyed by original line index */
  soramimi: Record<number, Array<{ text: string; reading?: string }>>;
  progress: number;
}

interface SoramimiResumeChunkErrorEvent {
  type: "chunk_error";
  chunkIndex: number;
  lineIndices: number[];
  error: string;
  progress: number;
}

interface SoramimiResumeCompleteEvent {
  type: "complete";
  totalChunks: number;
  successCount: number;
  failCount: number;
  /** Lines that were successfully regenerated */
  completedLines: number[];
  /** Lines that still failed (can retry again) */
  failedLines?: number[];
}

type SoramimiSSEEvent = SSEStartEvent | SoramimiChunkEvent | SoramimiCompleteEvent | SoramimiCachedEvent | SSEChunkErrorEvent;

type SoramimiResumeSSEEvent = SoramimiResumeStartEvent | SoramimiResumeChunkEvent | SoramimiResumeCompleteEvent | SoramimiResumeChunkErrorEvent;

// =============================================================================
// Translation SSE Processing
// =============================================================================

export interface ProcessTranslationOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  onChunk?: (chunkIndex: number, startIndex: number, translations: string[]) => void;
  /** Pre-fetched chunk info from initial lyrics request */
  prefetchedInfo?: TranslationChunkInfo;
}

/**
 * Process translation using Server-Sent Events (SSE).
 * The server processes all chunks and saves to cache, even if client disconnects.
 */
export async function processTranslationSSE(
  songId: string,
  language: string,
  options: ProcessTranslationOptions = {}
): Promise<string[]> {
  const { force, signal, onProgress, onChunk, prefetchedInfo } = options;

  // If we have cached data from prefetch and not forcing, use it
  if (!force && prefetchedInfo?.cached && prefetchedInfo.lrc) {
    try {
      onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
    } catch (callbackErr) {
      console.warn("SSE: Callback error:", callbackErr);
    }
    return parseLrcToTranslations(prefetchedInfo.lrc);
  }

  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  let buffer = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        let totalChunks = 0;
        let completedChunks = 0;
        let finalTranslations: string[] | null = null;

        const processLine = (line: string) => {
          if (!line.startsWith("data: ")) return;
          
          try {
            const data = JSON.parse(line.slice(6)) as TranslationSSEEvent;

            switch (data.type) {
              case "start":
                totalChunks = data.totalChunks;
                try {
                  onProgress?.({ completedChunks: 0, totalChunks, percentage: 0 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "chunk":
                completedChunks++;
                try {
                  onProgress?.({
                    completedChunks,
                    totalChunks,
                    percentage: data.progress,
                  });
                  onChunk?.(data.chunkIndex, data.startIndex, data.translations);
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "chunk_error":
                completedChunks++;
                try {
                  onProgress?.({
                    completedChunks,
                    totalChunks,
                    percentage: data.progress,
                  });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                console.warn(`SSE: Translate chunk ${data.chunkIndex} failed:`, data.error);
                break;

              case "cached":
                finalTranslations = parseLrcToTranslations(data.translation);
                try {
                  onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "complete":
                finalTranslations = data.translations;
                try {
                  onProgress?.({
                    completedChunks: data.totalChunks,
                    totalChunks: data.totalChunks,
                    percentage: 100,
                  });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
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

        if (finalTranslations) {
          return finalTranslations;
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
// Furigana SSE Processing
// =============================================================================

export interface ProcessFuriganaOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  onChunk?: (chunkIndex: number, startIndex: number, furigana: Array<Array<{ text: string; reading?: string }>>) => void;
  /** Pre-fetched chunk info from initial lyrics request */
  prefetchedInfo?: FuriganaChunkInfo;
}

/**
 * Process furigana using Server-Sent Events (SSE).
 * The server processes all chunks and saves to cache, even if client disconnects.
 */
export async function processFuriganaSSE(
  songId: string,
  options: ProcessFuriganaOptions = {}
): Promise<Array<Array<{ text: string; reading?: string }>>> {
  const { force, signal, onProgress, onChunk, prefetchedInfo } = options;

  // If we have cached data from prefetch and not forcing, use it
  if (!force && prefetchedInfo?.cached && prefetchedInfo.data) {
    try {
      onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
    } catch (callbackErr) {
      console.warn("SSE: Callback error:", callbackErr);
    }
    return prefetchedInfo.data;
  }

  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  let buffer = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        let totalChunks = 0;
        let completedChunks = 0;
        let finalFurigana: Array<Array<{ text: string; reading?: string }>> | null = null;

        const processLine = (line: string) => {
          if (!line.startsWith("data: ")) return;
          
          try {
            const data = JSON.parse(line.slice(6)) as FuriganaSSEEvent;

            switch (data.type) {
              case "start":
                totalChunks = data.totalChunks;
                try {
                  onProgress?.({ completedChunks: 0, totalChunks, percentage: 0 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "chunk":
                completedChunks++;
                try {
                  onProgress?.({
                    completedChunks,
                    totalChunks,
                    percentage: data.progress,
                  });
                  onChunk?.(data.chunkIndex, data.startIndex, data.furigana);
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "chunk_error":
                completedChunks++;
                try {
                  onProgress?.({
                    completedChunks,
                    totalChunks,
                    percentage: data.progress,
                  });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                console.warn(`SSE: Furigana chunk ${data.chunkIndex} failed:`, data.error);
                break;

              case "cached":
                finalFurigana = data.furigana;
                try {
                  onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "complete":
                finalFurigana = data.furigana;
                try {
                  onProgress?.({
                    completedChunks: data.totalChunks,
                    totalChunks: data.totalChunks,
                    percentage: 100,
                  });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
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

        if (finalFurigana) {
          return finalFurigana;
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
// Soramimi SSE Processing
// =============================================================================

export interface ProcessSoramimiOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  onChunk?: (chunkIndex: number, startIndex: number, soramimi: Array<Array<{ text: string; reading?: string }>>) => void;
  /** Pre-fetched chunk info from initial lyrics request */
  prefetchedInfo?: SoramimiChunkInfo;
}

/** Result of soramimi processing */
export interface SoramimiResult {
  /** The soramimi data */
  data: Array<Array<{ text: string; reading?: string }>>;
  /** Whether the result is partial (some lines failed) */
  isPartial: boolean;
  /** Line indices that failed and need resume */
  failedLines: number[];
}

/**
 * Process soramimi using Server-Sent Events (SSE).
 * The server processes all chunks and saves to cache, even if client disconnects.
 * Returns both the data and info about any failed lines that need resume.
 */
export async function processSoramimiSSE(
  songId: string,
  options: ProcessSoramimiOptions = {}
): Promise<SoramimiResult> {
  const { force, signal, onProgress, onChunk, prefetchedInfo } = options;

  // If we have cached data from prefetch and not forcing, use it
  if (!force && prefetchedInfo?.cached && prefetchedInfo.data) {
    try {
      onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
    } catch (callbackErr) {
      console.warn("SSE: Callback error:", callbackErr);
    }
    // Check if the cached data is partial
    const failedLines = prefetchedInfo.failedLines || [];
    return {
      data: prefetchedInfo.data,
      isPartial: prefetchedInfo.isPartial || failedLines.length > 0,
      failedLines,
    };
  }

  // If skipped (e.g., Chinese lyrics), return empty
  if (prefetchedInfo?.skipped) {
    try {
      onProgress?.({ completedChunks: 0, totalChunks: 0, percentage: 100 });
    } catch (callbackErr) {
      console.warn("SSE: Callback error:", callbackErr);
    }
    return { data: [], isPartial: false, failedLines: [] };
  }

  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  let buffer = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "soramimi-stream",
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
        if (json.skipped) {
          try {
            onProgress?.({ completedChunks: 0, totalChunks: 0, percentage: 100 });
          } catch (callbackErr) {
            console.warn("SSE: Callback error:", callbackErr);
          }
          return { data: [], isPartial: false, failedLines: [] };
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
        let totalChunks = 0;
        let completedChunks = 0;
        let finalSoramimi: SoramimiResult | null = null;

        const processLine = (line: string) => {
          if (!line.startsWith("data: ")) return;
          
          try {
            const data = JSON.parse(line.slice(6)) as SoramimiSSEEvent;

            switch (data.type) {
              case "start":
                totalChunks = data.totalChunks;
                try {
                  onProgress?.({ completedChunks: 0, totalChunks, percentage: 0 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "chunk":
                completedChunks++;
                try {
                  onProgress?.({
                    completedChunks,
                    totalChunks,
                    percentage: data.progress,
                  });
                  onChunk?.(data.chunkIndex, data.startIndex, data.soramimi);
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "chunk_error":
                completedChunks++;
                try {
                  onProgress?.({
                    completedChunks,
                    totalChunks,
                    percentage: data.progress,
                  });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                console.warn(`SSE: Soramimi chunk ${data.chunkIndex} failed:`, data.error);
                break;

              case "cached":
                finalSoramimi = { data: data.soramimi, isPartial: false, failedLines: [] };
                try {
                  onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
                break;

              case "complete":
                finalSoramimi = { 
                  data: data.soramimi, 
                  isPartial: (data.failedLines?.length ?? 0) > 0,
                  failedLines: data.failedLines || [],
                };
                try {
                  onProgress?.({
                    completedChunks: data.totalChunks,
                    totalChunks: data.totalChunks,
                    percentage: 100,
                  });
                } catch (callbackErr) {
                  console.warn("SSE: Callback error:", callbackErr);
                }
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
// Soramimi Resume SSE Processing
// =============================================================================

export interface ResumeSoramimiOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  /** Called when individual lines are regenerated */
  onLineUpdate?: (lineIndex: number, segments: Array<{ text: string; reading?: string }>) => void;
}

/** Result of soramimi resume */
export interface SoramimiResumeResult {
  /** Lines that were successfully regenerated, keyed by line index */
  completedLines: Map<number, Array<{ text: string; reading?: string }>>;
  /** Line indices that still failed */
  stillFailedLines: number[];
}

/**
 * Resume soramimi generation for specific failed lines.
 * The server regenerates only the requested lines and updates the cache.
 */
export async function resumeSoramimiSSE(
  songId: string,
  failedLineIndices: number[],
  options: ResumeSoramimiOptions = {}
): Promise<SoramimiResumeResult> {
  const { signal, onProgress, onLineUpdate } = options;

  if (failedLineIndices.length === 0) {
    return { completedLines: new Map(), stillFailedLines: [] };
  }

  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  let buffer = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "soramimi-resume",
          lineIndices: failedLineIndices,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE request failed: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const json = await response.json();
        if (json.skipped) {
          return { completedLines: new Map(), stillFailedLines: [] };
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
        let totalChunks = 0;
        let completedChunks = 0;
        const completedLines = new Map<number, Array<{ text: string; reading?: string }>>();
        let stillFailedLines: number[] = [];
        let isComplete = false;

        const processLine = (line: string) => {
          if (!line.startsWith("data: ")) return;
          
          try {
            const data = JSON.parse(line.slice(6)) as SoramimiResumeSSEEvent;

            switch (data.type) {
              case "start":
                totalChunks = data.totalChunks;
                try {
                  onProgress?.({ completedChunks: 0, totalChunks, percentage: 0 });
                } catch (callbackErr) {
                  console.warn("SSE Resume: Callback error:", callbackErr);
                }
                break;

              case "chunk":
                completedChunks++;
                // Process completed lines from this chunk
                for (const [lineIdxStr, segments] of Object.entries(data.soramimi)) {
                  const lineIdx = parseInt(lineIdxStr, 10);
                  completedLines.set(lineIdx, segments);
                  try {
                    onLineUpdate?.(lineIdx, segments);
                  } catch (callbackErr) {
                    console.warn("SSE Resume: Callback error:", callbackErr);
                  }
                }
                try {
                  onProgress?.({
                    completedChunks,
                    totalChunks,
                    percentage: data.progress,
                  });
                } catch (callbackErr) {
                  console.warn("SSE Resume: Callback error:", callbackErr);
                }
                break;

              case "chunk_error":
                completedChunks++;
                try {
                  onProgress?.({
                    completedChunks,
                    totalChunks,
                    percentage: data.progress,
                  });
                } catch (callbackErr) {
                  console.warn("SSE Resume: Callback error:", callbackErr);
                }
                console.warn(`SSE Resume: Chunk ${data.chunkIndex} failed:`, data.error);
                break;

              case "complete":
                stillFailedLines = data.failedLines || [];
                isComplete = true;
                try {
                  onProgress?.({
                    completedChunks: data.totalChunks,
                    totalChunks: data.totalChunks,
                    percentage: 100,
                  });
                } catch (callbackErr) {
                  console.warn("SSE Resume: Callback error:", callbackErr);
                }
                break;
            }
          } catch (e) {
            console.warn("SSE Resume: Failed to parse event:", line, e);
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

        if (isComplete) {
          return { completedLines, stillFailedLines };
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
        console.error("Soramimi Resume SSE error:", err);
        throw err; // Final attempt failed
      }
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      console.warn(`SSE Resume: Retry attempt ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
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
