/**
 * Client-side utilities for SSE streaming API calls
 * Server processes all chunks and saves results even if client disconnects
 */

import { getApiUrl } from "@/utils/platform";

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
}

interface SoramimiCachedEvent {
  type: "cached";
  soramimi: Array<Array<{ text: string; reading?: string }>>;
}

type SoramimiSSEEvent = SSEStartEvent | SoramimiChunkEvent | SoramimiCompleteEvent | SoramimiCachedEvent | SSEChunkErrorEvent;

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
    onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
    return parseLrcToTranslations(prefetchedInfo.lrc);
  }

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    fetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "translate-stream",
        language,
        force,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
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

        const decoder = new TextDecoder();
        let buffer = "";
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
                onProgress?.({ completedChunks: 0, totalChunks, percentage: 0 });
                break;

              case "chunk":
                completedChunks++;
                onProgress?.({
                  completedChunks,
                  totalChunks,
                  percentage: data.progress,
                });
                onChunk?.(data.chunkIndex, data.startIndex, data.translations);
                break;

              case "chunk_error":
                completedChunks++;
                onProgress?.({
                  completedChunks,
                  totalChunks,
                  percentage: data.progress,
                });
                console.warn(`SSE: Translate chunk ${data.chunkIndex} failed:`, data.error);
                break;

              case "cached":
                finalTranslations = parseLrcToTranslations(data.translation);
                onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
                break;

              case "complete":
                finalTranslations = data.translations;
                onProgress?.({
                  completedChunks: data.totalChunks,
                  totalChunks: data.totalChunks,
                  percentage: 100,
                });
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
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            processLine(line.trim());
          }
        }

        if (finalTranslations) {
          resolve(finalTranslations);
        } else {
          reject(new Error("SSE stream ended without complete event"));
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          reject(err);
        } else {
          console.error("Translation SSE error:", err);
          reject(err);
        }
      });
  });
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
    onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
    return prefetchedInfo.data;
  }

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    fetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "furigana-stream",
        force,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
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

        const decoder = new TextDecoder();
        let buffer = "";
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
                onProgress?.({ completedChunks: 0, totalChunks, percentage: 0 });
                break;

              case "chunk":
                completedChunks++;
                onProgress?.({
                  completedChunks,
                  totalChunks,
                  percentage: data.progress,
                });
                onChunk?.(data.chunkIndex, data.startIndex, data.furigana);
                break;

              case "chunk_error":
                completedChunks++;
                onProgress?.({
                  completedChunks,
                  totalChunks,
                  percentage: data.progress,
                });
                console.warn(`SSE: Furigana chunk ${data.chunkIndex} failed:`, data.error);
                break;

              case "cached":
                finalFurigana = data.furigana;
                onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
                break;

              case "complete":
                finalFurigana = data.furigana;
                onProgress?.({
                  completedChunks: data.totalChunks,
                  totalChunks: data.totalChunks,
                  percentage: 100,
                });
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
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            processLine(line.trim());
          }
        }

        if (finalFurigana) {
          resolve(finalFurigana);
        } else {
          reject(new Error("SSE stream ended without complete event"));
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          reject(err);
        } else {
          console.error("Furigana SSE error:", err);
          reject(err);
        }
      });
  });
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

/**
 * Process soramimi using Server-Sent Events (SSE).
 * The server processes all chunks and saves to cache, even if client disconnects.
 */
export async function processSoramimiSSE(
  songId: string,
  options: ProcessSoramimiOptions = {}
): Promise<Array<Array<{ text: string; reading?: string }>>> {
  const { force, signal, onProgress, onChunk, prefetchedInfo } = options;

  // If we have cached data from prefetch and not forcing, use it
  if (!force && prefetchedInfo?.cached && prefetchedInfo.data) {
    onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
    return prefetchedInfo.data;
  }

  // If skipped (e.g., Chinese lyrics), return empty
  if (prefetchedInfo?.skipped) {
    onProgress?.({ completedChunks: 0, totalChunks: 0, percentage: 100 });
    return [];
  }

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    fetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "soramimi-stream",
        force,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`SSE request failed: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const json = await response.json();
          if (json.skipped) {
            onProgress?.({ completedChunks: 0, totalChunks: 0, percentage: 100 });
            resolve([]);
            return;
          }
          throw new Error(json.error || "Unknown error");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let totalChunks = 0;
        let completedChunks = 0;
        let finalSoramimi: Array<Array<{ text: string; reading?: string }>> | null = null;

        const processLine = (line: string) => {
          if (!line.startsWith("data: ")) return;
          
          try {
            const data = JSON.parse(line.slice(6)) as SoramimiSSEEvent;

            switch (data.type) {
              case "start":
                totalChunks = data.totalChunks;
                onProgress?.({ completedChunks: 0, totalChunks, percentage: 0 });
                break;

              case "chunk":
                completedChunks++;
                onProgress?.({
                  completedChunks,
                  totalChunks,
                  percentage: data.progress,
                });
                onChunk?.(data.chunkIndex, data.startIndex, data.soramimi);
                break;

              case "chunk_error":
                completedChunks++;
                onProgress?.({
                  completedChunks,
                  totalChunks,
                  percentage: data.progress,
                });
                console.warn(`SSE: Soramimi chunk ${data.chunkIndex} failed:`, data.error);
                break;

              case "cached":
                finalSoramimi = data.soramimi;
                onProgress?.({ completedChunks: 1, totalChunks: 1, percentage: 100 });
                break;

              case "complete":
                finalSoramimi = data.soramimi;
                onProgress?.({
                  completedChunks: data.totalChunks,
                  totalChunks: data.totalChunks,
                  percentage: 100,
                });
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
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            processLine(line.trim());
          }
        }

        if (finalSoramimi) {
          resolve(finalSoramimi);
        } else {
          reject(new Error("SSE stream ended without complete event"));
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          reject(err);
        } else {
          console.error("Soramimi SSE error:", err);
          reject(err);
        }
      });
  });
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
