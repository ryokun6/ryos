/**
 * Client-side utilities for chunked streaming API calls
 * Handles processing large requests chunk-by-chunk to avoid edge function timeouts
 */

import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

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

interface TranslateChunkResponse {
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  translations: string[];
}

interface FuriganaChunkResponse {
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  furigana: Array<Array<{ text: string; reading?: string }>>;
}

interface SoramimiChunkResponse {
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  soramimi: Array<Array<{ text: string; reading?: string }>>;
  skipped?: boolean;
  skipReason?: string;
}

// =============================================================================
// Constants
// =============================================================================

const MAX_CONCURRENT_CHUNKS = 3;
// Client timeout should be longer than server's 55s AI timeout to allow graceful fallback
const CHUNK_TIMEOUT = 65000; // 65 seconds per chunk (server times out at 55s)

// =============================================================================
// Translation Processing
// =============================================================================

export interface ProcessTranslationOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  onChunk?: (chunkIndex: number, startIndex: number, translations: string[]) => void;
  /** Pre-fetched chunk info from initial lyrics request (skips extra API call) */
  prefetchedInfo?: TranslationChunkInfo;
}

/**
 * Process translation chunks with streaming progress.
 * Always checks for cached consolidated data unless force=true.
 * If prefetchedInfo has cached data, uses it directly to skip the API call.
 */
export async function processTranslationChunks(
  songId: string,
  language: string,
  options: ProcessTranslationOptions = {}
): Promise<string[]> {
  const { force, signal, onProgress, onChunk, prefetchedInfo } = options;

  // Use prefetched info or fetch it
  let totalLines: number;
  let totalChunks: number;
  let cachedLrc: string | undefined;

  // If prefetched info has cached data, use it directly (skip API call)
  if (prefetchedInfo?.cached && prefetchedInfo.lrc && !force) {
    totalLines = prefetchedInfo.totalLines;
    totalChunks = prefetchedInfo.totalChunks;
    cachedLrc = prefetchedInfo.lrc;
  } else {
    // Either no prefetched info OR prefetched info shows not cached
    // Always call get-chunk-info to verify server state (prefetched info might be stale)
    const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get-chunk-info",
        operation: "translate",
        language,
        force,
      }),
      signal,
      timeout: 30000,
    });

    if (!res.ok) {
      throw new Error(`Failed to get chunk info (status ${res.status})`);
    }

    const chunkInfo = await res.json();
    totalLines = chunkInfo.totalLines;
    totalChunks = chunkInfo.totalChunks;
    if (chunkInfo.cached && chunkInfo.translation) {
      cachedLrc = chunkInfo.translation;
    }
  }

  // If fully cached, return immediately
  if (cachedLrc) {
    onProgress?.({ completedChunks: totalChunks, totalChunks, percentage: 100 });
    return parseLrcToTranslations(cachedLrc);
  }

  // Process all chunks in parallel
  const allTranslations: string[] = new Array(totalLines).fill("");
  let completedChunks = 0;

  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);

  await processWithConcurrency(
    chunkIndices,
    async (chunkIndex) => {
      if (signal?.aborted) return;

      const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate-chunk",
          language,
          chunkIndex,
        }),
        signal,
        timeout: CHUNK_TIMEOUT,
        retry: {
          maxAttempts: 3,
          initialDelayMs: 2000,
          backoffMultiplier: 2,
        },
      });

      if (!res.ok) {
        throw new Error(`Chunk ${chunkIndex} failed (status ${res.status})`);
      }

      const result = (await res.json()) as TranslateChunkResponse;

      if (typeof result.startIndex !== "number" || result.startIndex < 0) {
        throw new Error(`Invalid startIndex ${result.startIndex} in chunk ${chunkIndex}`);
      }

      result.translations.forEach((text, i) => {
        const targetIndex = result.startIndex + i;
        if (targetIndex < allTranslations.length) {
          allTranslations[targetIndex] = text;
        }
      });

      completedChunks++;
      onProgress?.({
        completedChunks,
        totalChunks,
        percentage: Math.round((completedChunks / totalChunks) * 100),
      });
      onChunk?.(result.chunkIndex, result.startIndex, result.translations);
    },
    MAX_CONCURRENT_CHUNKS
  );

  // Validate all chunks completed
  if (completedChunks !== totalChunks) {
    throw new Error(`Translation incomplete: expected ${totalChunks} chunks, got ${completedChunks}`);
  }

  // Save consolidated translation
  if (!signal?.aborted) {
    try {
      await abortableFetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-translation",
          language,
          translations: allTranslations,
        }),
        signal,
        timeout: 60000,
      });
    } catch (e) {
      console.warn("Failed to save consolidated translation:", e);
    }
  }

  return allTranslations;
}

// =============================================================================
// Furigana Processing
// =============================================================================

export interface ProcessFuriganaOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  onChunk?: (chunkIndex: number, startIndex: number, furigana: Array<Array<{ text: string; reading?: string }>>) => void;
  /** Pre-fetched chunk info from initial lyrics request (skips extra API call) */
  prefetchedInfo?: FuriganaChunkInfo;
}

/**
 * Process furigana chunks with streaming progress.
 * Always checks for cached consolidated data unless force=true.
 * If prefetchedInfo has cached data, uses it directly to skip the API call.
 */
export async function processFuriganaChunks(
  songId: string,
  options: ProcessFuriganaOptions = {}
): Promise<Array<Array<{ text: string; reading?: string }>>> {
  const { force, signal, onProgress, onChunk, prefetchedInfo } = options;

  // Use prefetched info or fetch it
  let totalLines: number;
  let totalChunks: number;
  let cachedData: Array<Array<{ text: string; reading?: string }>> | undefined;

  // If prefetched info has cached data, use it directly (skip API call)
  if (prefetchedInfo?.cached && prefetchedInfo.data && !force) {
    totalLines = prefetchedInfo.totalLines;
    totalChunks = prefetchedInfo.totalChunks;
    cachedData = prefetchedInfo.data;
  } else {
    // Either no prefetched info OR prefetched info shows not cached
    // Always call get-chunk-info to verify server state (prefetched info might be stale)
    const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get-chunk-info",
        operation: "furigana",
        force,
      }),
      signal,
      timeout: 30000,
    });

    if (!res.ok) {
      throw new Error(`Failed to get chunk info (status ${res.status})`);
    }

    const chunkInfo = await res.json();
    totalLines = chunkInfo.totalLines;
    totalChunks = chunkInfo.totalChunks;
    if (chunkInfo.cached && chunkInfo.furigana) {
      cachedData = chunkInfo.furigana;
    }
  }

  // If fully cached, return immediately
  if (cachedData) {
    onProgress?.({ completedChunks: totalChunks, totalChunks, percentage: 100 });
    return cachedData;
  }

  // Process all chunks in parallel
  const allFurigana: Array<Array<{ text: string; reading?: string }>> = new Array(totalLines).fill(null).map(() => []);
  let completedChunks = 0;

  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);

  await processWithConcurrency(
    chunkIndices,
    async (chunkIndex) => {
      if (signal?.aborted) return;

      const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "furigana-chunk",
          chunkIndex,
        }),
        signal,
        timeout: CHUNK_TIMEOUT,
        retry: {
          maxAttempts: 3,
          initialDelayMs: 2000,
          backoffMultiplier: 2,
        },
      });

      if (!res.ok) {
        throw new Error(`Chunk ${chunkIndex} failed (status ${res.status})`);
      }

      const result = (await res.json()) as FuriganaChunkResponse;

      if (typeof result.startIndex !== "number" || result.startIndex < 0) {
        throw new Error(`Invalid startIndex ${result.startIndex} in chunk ${chunkIndex}`);
      }

      result.furigana.forEach((segments, i) => {
        const targetIndex = result.startIndex + i;
        if (targetIndex < allFurigana.length) {
          allFurigana[targetIndex] = segments;
        }
      });

      completedChunks++;
      onProgress?.({
        completedChunks,
        totalChunks,
        percentage: Math.round((completedChunks / totalChunks) * 100),
      });
      onChunk?.(result.chunkIndex, result.startIndex, result.furigana);
    },
    MAX_CONCURRENT_CHUNKS
  );

  // Validate all chunks completed
  if (completedChunks !== totalChunks) {
    throw new Error(`Furigana incomplete: expected ${totalChunks} chunks, got ${completedChunks}`);
  }

  // Save consolidated furigana
  if (!signal?.aborted) {
    try {
      await abortableFetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-furigana",
          furigana: allFurigana,
        }),
        signal,
        timeout: 60000,
      });
    } catch (e) {
      console.warn("Failed to save consolidated furigana:", e);
    }
  }

  return allFurigana;
}

// =============================================================================
// Soramimi Processing
// =============================================================================

export interface ProcessSoramimiOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  onChunk?: (chunkIndex: number, startIndex: number, soramimi: Array<Array<{ text: string; reading?: string }>>) => void;
  /** Pre-fetched chunk info from initial lyrics request (skips extra API call) */
  prefetchedInfo?: SoramimiChunkInfo;
}

/**
 * Process soramimi chunks with streaming progress.
 * Always checks for cached consolidated data unless force=true.
 * If prefetchedInfo has cached data, uses it directly to skip the API call.
 */
export async function processSoramimiChunks(
  songId: string,
  options: ProcessSoramimiOptions = {}
): Promise<Array<Array<{ text: string; reading?: string }>>> {
  const { force, signal, onProgress, onChunk, prefetchedInfo } = options;

  // Use prefetched info or fetch it
  let totalLines: number;
  let totalChunks: number;
  let cachedData: Array<Array<{ text: string; reading?: string }>> | undefined;

  // If prefetched info has cached data, use it directly (skip API call)
  if (prefetchedInfo?.cached && prefetchedInfo.data && !force) {
    totalLines = prefetchedInfo.totalLines;
    totalChunks = prefetchedInfo.totalChunks;
    cachedData = prefetchedInfo.data;
  } else if (prefetchedInfo?.skipped) {
    // Handle skipped case from prefetch (e.g., Chinese lyrics)
    onProgress?.({ completedChunks: 0, totalChunks: 0, percentage: 100 });
    return []; // Return empty array for skipped content
  } else {
    // Either no prefetched info OR prefetched info shows not cached
    // Always call get-chunk-info to verify server state (prefetched info might be stale)
    const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get-chunk-info",
        operation: "soramimi",
        force,
      }),
      signal,
      timeout: 30000, // Quick metadata fetch (30s should be plenty)
    });

    if (!res.ok) {
      throw new Error(`Failed to get chunk info (status ${res.status})`);
    }

    const chunkInfo = await res.json();
    
    // Handle skipped case (e.g., Chinese lyrics)
    if (chunkInfo.skipped) {
      onProgress?.({ completedChunks: 0, totalChunks: 0, percentage: 100 });
      return []; // Return empty array for skipped content
    }
    
    totalLines = chunkInfo.totalLines;
    totalChunks = chunkInfo.totalChunks;
    if (chunkInfo.cached && chunkInfo.soramimi) {
      cachedData = chunkInfo.soramimi;
    }
  }

  // If fully cached, return immediately
  if (cachedData) {
    onProgress?.({ completedChunks: totalChunks, totalChunks, percentage: 100 });
    return cachedData;
  }

  // Process all chunks in parallel
  const allSoramimi: Array<Array<{ text: string; reading?: string }>> = new Array(totalLines).fill(null).map(() => []);
  const completedChunkSet = new Set<number>();
  const failedChunks: number[] = [];
  let completedChunks = 0;

  // Process ALL chunks (0 through totalChunks-1) in parallel
  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);
  
  // We need chunk size to calculate fallback indices - use prefetchedInfo or default
  const chunkSize = prefetchedInfo?.chunkSize || 8;

  await processWithConcurrency(
    chunkIndices,
    async (chunkIndex) => {
      if (signal?.aborted) return;

      try {
        const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "soramimi-chunk",
            chunkIndex,
          }),
          signal,
          timeout: CHUNK_TIMEOUT,
          retry: {
            maxAttempts: 2, // Reduced retries since server returns fallback on timeout
            initialDelayMs: 1000,
            backoffMultiplier: 2,
          },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const result = (await res.json()) as SoramimiChunkResponse;

        // Handle skipped chunk (e.g., Chinese lyrics detected mid-stream)
        if (result.skipped) {
          completedChunkSet.add(chunkIndex);
          completedChunks++;
          onProgress?.({
            completedChunks,
            totalChunks,
            percentage: Math.round((completedChunks / totalChunks) * 100),
          });
          return;
        }

        if (typeof result.startIndex !== "number" || result.startIndex < 0) {
          throw new Error(`Invalid startIndex ${result.startIndex}`);
        }

        result.soramimi.forEach((segments, i) => {
          const targetIndex = result.startIndex + i;
          if (targetIndex < allSoramimi.length) {
            allSoramimi[targetIndex] = segments;
          }
        });

        completedChunkSet.add(chunkIndex);
        completedChunks++;
        onProgress?.({
          completedChunks,
          totalChunks,
          percentage: Math.round((completedChunks / totalChunks) * 100),
        });
        onChunk?.(result.chunkIndex, result.startIndex, result.soramimi);
      } catch (err) {
        // Don't throw on failed chunks - mark as failed and continue
        // The server should have returned fallback data, but if client times out
        // we'll leave the lines empty (they won't have readings)
        if (err instanceof Error && err.name === "AbortError") {
          throw err; // Re-throw abort errors
        }
        
        console.warn(`Soramimi chunk ${chunkIndex} failed, using fallback:`, err);
        failedChunks.push(chunkIndex);
        
        // Mark chunk as "completed" with empty fallback to allow progress to continue
        completedChunkSet.add(chunkIndex);
        completedChunks++;
        onProgress?.({
          completedChunks,
          totalChunks,
          percentage: Math.round((completedChunks / totalChunks) * 100),
        });
        
        // Emit empty chunk so UI updates (lines without soramimi will show plain text)
        const startIndex = chunkIndex * chunkSize;
        const emptyFallback: Array<Array<{ text: string; reading?: string }>> = [];
        for (let i = 0; i < chunkSize && startIndex + i < totalLines; i++) {
          emptyFallback.push([]); // Empty segments = plain text fallback
        }
        onChunk?.(chunkIndex, startIndex, emptyFallback);
      }
    },
    MAX_CONCURRENT_CHUNKS
  );

  // Retry failed chunks sequentially with longer timeout
  if (failedChunks.length > 0 && !signal?.aborted) {
    console.log(`Soramimi: Retrying ${failedChunks.length} failed chunks sequentially...`);
    
    for (const chunkIndex of failedChunks) {
      if (signal?.aborted) break;
      
      try {
        const res = await abortableFetch(getApiUrl(`/api/song/${songId}`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "soramimi-chunk",
            chunkIndex,
          }),
          signal,
          timeout: 90000, // Longer timeout for retries (90s)
          retry: {
            maxAttempts: 2,
            initialDelayMs: 3000,
            backoffMultiplier: 2,
          },
        });

        if (res.ok) {
          const result = (await res.json()) as SoramimiChunkResponse;
          
          if (!result.skipped && typeof result.startIndex === "number" && result.startIndex >= 0) {
            result.soramimi.forEach((segments, i) => {
              const targetIndex = result.startIndex + i;
              if (targetIndex < allSoramimi.length) {
                allSoramimi[targetIndex] = segments;
              }
            });
            
            // Remove from failed list on success
            const idx = failedChunks.indexOf(chunkIndex);
            if (idx > -1) failedChunks.splice(idx, 1);
            
            console.log(`Soramimi: Retry succeeded for chunk ${chunkIndex}`);
            onChunk?.(result.chunkIndex, result.startIndex, result.soramimi);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") break;
        console.warn(`Soramimi: Retry failed for chunk ${chunkIndex}:`, err);
      }
    }
  }

  // Log final status
  const hasFailures = failedChunks.length > 0;
  if (hasFailures) {
    console.warn(`Soramimi: ${failedChunks.length}/${totalChunks} chunks still failed after retries`);
  }

  // Only save consolidated soramimi if ALL chunks succeeded
  // This ensures we don't cache partial/fallback data
  if (!signal?.aborted && !hasFailures) {
    try {
      await abortableFetch(getApiUrl(`/api/song/${songId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-soramimi",
          soramimi: allSoramimi,
        }),
        signal,
        timeout: 60000,
      });
    } catch (e) {
      console.warn("Failed to save consolidated soramimi:", e);
    }
  } else if (hasFailures) {
    console.log("Skipping soramimi save due to failed chunks - will retry on next request");
  }

  return allSoramimi;
}

// =============================================================================
// Soramimi SSE Streaming (Server-Side Processing)
// =============================================================================

export interface ProcessSoramimiSSEOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  onChunk?: (chunkIndex: number, startIndex: number, soramimi: Array<Array<{ text: string; reading?: string }>>) => void;
  /** Pre-fetched chunk info from initial lyrics request */
  prefetchedInfo?: SoramimiChunkInfo;
}

interface SSEChunkEvent {
  type: "chunk";
  chunkIndex: number;
  startIndex: number;
  soramimi: Array<Array<{ text: string; reading?: string }>>;
  progress: number;
}

interface SSECompleteEvent {
  type: "complete";
  totalChunks: number;
  successCount: number;
  failCount: number;
  cached: boolean;
  soramimi: Array<Array<{ text: string; reading?: string }>>;
}

interface SSECachedEvent {
  type: "cached";
  soramimi: Array<Array<{ text: string; reading?: string }>>;
}

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

type SSEEvent = SSEChunkEvent | SSECompleteEvent | SSECachedEvent | SSEStartEvent | SSEChunkErrorEvent;

/**
 * Process soramimi using Server-Sent Events (SSE).
 * The server processes all chunks and saves to cache, even if client disconnects.
 * This is more reliable than client-side chunk orchestration.
 */
export async function processSoramimiSSE(
  songId: string,
  options: ProcessSoramimiSSEOptions = {}
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
    const combinedSignal = signal;

    // Abort our controller if external signal aborts
    if (combinedSignal) {
      combinedSignal.addEventListener("abort", () => controller.abort());
    }

    // Make POST request to SSE endpoint
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

        // Check if it's a JSON response (error or skipped)
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

        // Process SSE stream
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
            const data = JSON.parse(line.slice(6)) as SSEEvent;

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
                console.warn(`SSE: Chunk ${data.chunkIndex} failed:`, data.error);
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
                if (data.failCount > 0) {
                  console.warn(`SSE: ${data.failCount}/${data.totalChunks} chunks failed`);
                }
                break;
            }
          } catch (e) {
            console.warn("SSE: Failed to parse event:", line, e);
          }
        };

        // Read stream
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Process any remaining buffer
            if (buffer.trim()) {
              for (const line of buffer.split("\n")) {
                processLine(line.trim());
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          // Process complete lines
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer
          
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
          console.error("SSE error:", err);
          reject(err);
        }
      });
  });
}

// =============================================================================
// Utilities
// =============================================================================

async function processWithConcurrency<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  maxConcurrent: number
): Promise<void> {
  const queue = [...items];
  const active: Promise<void>[] = [];

  while (queue.length > 0 || active.length > 0) {
    while (active.length < maxConcurrent && queue.length > 0) {
      const item = queue.shift()!;
      const promise = processor(item)
        .then(() => {
          const index = active.indexOf(promise);
          if (index > -1) active.splice(index, 1);
        })
        .catch((err) => {
          const index = active.indexOf(promise);
          if (index > -1) active.splice(index, 1);
          throw err;
        });
      active.push(promise);
    }

    if (active.length > 0) {
      await Promise.race(active);
    }
  }
}

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
